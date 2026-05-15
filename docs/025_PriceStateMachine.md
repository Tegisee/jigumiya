# 025. 가격 상태 머신 + 상품 추가 UX 개편 (1.0.19 작업 계획)

> **상태**: 📋 설계 확정 (2026-05-15) — 코드 작업 미착수. 1.0.18 베타 검증 통과 후 진입 예정.
> 관련 문서: [023_RealPrice_Architecture.md](./023_RealPrice_Architecture.md) (apiPrice/realPrice 분리), [020_PriceChecker_CronDesign.md](./020_PriceChecker_CronDesign.md)

---

## 배경 / 문제 정의

1.0.16 RealPrice 아키텍처(`docs/023`)로 apiPrice/realPrice를 분리했지만, 상품 추가 시점에는 여전히 WebView로 realPrice를 동기 수집한다. 이로 인한 잔존 문제:

- **상품 추가 UX 지연**: WebView 로드 + Akamai 챌린지 + DOM 폴링으로 사용자가 10~60초 대기. 챌린지 실패 시 추가 자체가 막힘 (1.0.17 iOS 100% 실패 사례).
- **현재가 vs 그래프 불일치**: 상품 추가 직후 apiPrice를 첫 priceHistory 포인트로 기록하는 경로가 남아 있어, 이후 첫 realPrice가 들어오면 "apiPrice → realPrice" 변동이 가격 하락 알림으로 오탐.
- **상세페이지 "가격 하락 감지" 오표시**: 첫 realPrice 수신을 변동으로 간주해 신규 사용자에게 잘못된 하락 배지가 노출.
- **알림 발송 기준 모호**: cron(apiPrice)과 CF 트리거(realPrice)가 각자 알림을 발송. 어느 baseline에서 시작했는지 상태가 없어 false positive 차단 가드를 일관되게 적용하기 어렵다.

해결책: **가격 상태 머신**(`priceStatus: INIT → SYNCING → TRACKING`)을 shared_products 문서에 도입하고, 상품 추가 시 WebView를 완전히 제거해 파트너스 API 정보만으로 즉시 저장한다.

---

## 1순위 — 상품 추가 UX 개선 (WebView 제거)

### 현재 흐름의 문제
- `app/modal/add-item.tsx`가 `CoupangScraper` WebView를 동기 호출하여 realPrice를 수집할 때까지 사용자를 대기시킴
- Akamai 챌린지/iOS Universal Link race/네트워크 지연이 모두 추가 성공률을 깎음
- 사용자가 "추가했는데 안 됨" → 재시도 → 중복 시도 → Akamai 임계 ↑ 악순환

### 신규 흐름
1. 사용자가 URL 입력 또는 공유 진입 → "다음" 버튼
2. **Functions `resolveAndGenerateAffiliateUrl`** 호출 → resolved URL + affiliate URL + 파트너스 API metadata(상품명, 이미지, apiPrice) 수신
3. 즉시 `shared_products` write + 로컬 `trackedItems` 추가 + "추가 완료!" 토스트
4. 화면 종료 — 사용자 대기 시간 최소화 (목표: 2초 이내)
5. realPrice는 **백그라운드**에서 갱신:
   - shared-price-checker cron (`*/10` 10분 간격)
   - 관리자 모드 순회
   - 자동 새로고침(TTL 6h + viewport, 1.0.17 구현)

### 부수 변경
- `CoupangScraper` 컴포넌트는 **관리자 모드 / 사용자 수동 새로고침 / 자동 새로고침(viewport)** 경로에만 유지. 상품 추가 경로에서는 제거.
- `add-item.tsx`의 `step === 'scraping'` 단계 삭제 → `'url' → 'target'` 2단계로 단축. 목표가 단계에서는 apiPrice만 표시되며 "정확한 현재가는 곧 갱신됩니다" 안내 문구 노출.
- Functions가 파트너스 API metadata를 한 번에 반환하도록 응답 스키마 확장:
  ```
  { ok: true, originalUrl, shortenUrl, productName, productImage, apiPrice }
  ```
- 클라이언트 fallback(`generateDeepLink` + HTML redirectWebUrl 파싱)은 그대로 유지. Functions 실패 시 affiliate만 확보하고 상품명/이미지/apiPrice는 빈 값으로 저장(이후 cron이 채움).

### 신규/기존 사용자 동작
- **기존 상품(이미 shared_products에 존재)**: priceHistory + lowestPrice/highestPrice 머지(1A 머지 로직 유지). 신규 사용자도 즉시 풍부한 그래프 표시.
- **신규 상품**: apiPrice만 저장, priceHistory 비움, `priceStatus = INIT`. 첫 realPrice가 들어오면 SYNCING으로 전이하며 그래프 시작.

---

## 2순위 — 가격 상태 머신 도입 (핵심)

### Firestore 필드 추가
`shared_products/{productId}`에 다음 필드 추가:

| 필드 | 타입 | 의미 |
|------|------|------|
| `priceStatus` | `'INIT' \| 'SYNCING' \| 'TRACKING'` | 가격 추적 상태 |
| `firstRealPriceAt` | timestamp | 첫 realPrice 수신 시각 (SYNCING 진입) |
| `trackingStartedAt` | timestamp | TRACKING 진입 시각 (두 번째 realPrice) |

### 상태 정의

#### `INIT` — 초기 상태
- **조건**: 상품 추가 직후, realPrice 아직 없음
- **저장된 가격**: apiPrice만 존재 (`realPrice === undefined`)
- **그래프**: 표시 안 함 ("가격 추적 준비 중" 안내)
- **알림**: 발송 안 함 (cron / CF 트리거 모두 INIT 상태는 스킵)
- **현재가 표시**: apiPrice를 회색/연한 색으로 "(예상)" 라벨과 함께 표시

#### `SYNCING` — 첫 realPrice 수집됨, baseline 설정
- **전이 조건**: WebView가 첫 realPrice를 write
- **자동 동작**: `currentPrice = previousPrice = realPrice`로 baseline 통일 → 변동 0
- **저장**: `priceHistory = [{ date, realPrice }]` 1포인트 생성, `firstRealPriceAt` 기록
- **그래프**: 1포인트만 표시 (점 하나)
- **알림**: 발송 안 함 — "이건 첫 데이터이지 변동이 아니다"
- **현재가 표시**: realPrice를 정상 색으로 표시

#### `TRACKING` — 정상 추적 중
- **전이 조건**: 두 번째 realPrice가 들어옴 (값이 같든 다르든)
- **자동 동작**: `trackingStartedAt` 기록, 이후 모든 realPrice 변동을 정상 변동으로 간주
- **저장**: 매 realPrice마다 priceHistory에 누적
- **알림**: 정상 발송
  - 가격 하락 (lowest 갱신 또는 ≥10% 하락)
  - 목표가 도달 (`currentPrice <= targetPrice`)
  - 가격 상승 (≥10% 상승, 옵션)
- **현재가 표시**: realPrice 정상 표시

### 상태 전이 다이어그램
```
[상품 추가]
     ↓
   INIT (apiPrice만)
     ↓ 첫 realPrice 수신
   SYNCING (baseline = realPrice, 알림 X, 그래프 1점)
     ↓ 두 번째 realPrice 수신
   TRACKING (정상 추적, 알림 O, 그래프 누적)
```

### apiPrice의 위치
- `apiPrice`는 그래프에 **포함하지 않는다** (참고용만)
- 상세페이지에 별도 섹션으로 "파트너스 API 정가: XX,XXX원" 표시 (즉시할인 미반영 정가임을 명시)
- INIT 상태에서만 currentPrice 표시 fallback으로 사용

### 알림 가드 변경
모든 알림 발송 경로에서 `priceStatus === 'TRACKING'` 가드 추가:
- **cron `shared-price-check.yml`**: `payloads.priceDrop` / `payloads.priceUp` 빌드 직전에 `if (product.priceStatus !== 'TRACKING') continue`
- **CF 트리거 `onSharedProductRealPriceChange`**: handler 진입 시 `if (after.priceStatus !== 'TRACKING') return`
- **클라이언트 자동 새로고침**: realPrice write 시 priceStatus 전이만 처리, 알림은 CF에 위임

### 상세페이지 표시 수정
- INIT: 그래프 영역에 "가격 추적 준비 중 — 곧 첫 수집됩니다" 플레이스홀더
- SYNCING: 그래프 1점 + "최저가 도달 시 알림이 시작됩니다" 안내
- TRACKING: 정상 그래프 + 변동 배지 (하락/상승)
- "가격 하락 감지" 배지는 TRACKING 상태에서만 노출

---

## 3순위 — 홈 화면 여백

### 현재
1.0.18에서 `scroll.paddingBottom: 40 → 0`으로 축소했으나, 추적 상품이 적을 때(예: 1~2개) 화면 하단이 비어 보임. 반대로 많을 때(20개)는 정상 스크롤.

### 변경
- `app/(tabs)/index.tsx`의 ScrollView contentContainerStyle에 `flexGrow: 1` 추가
- 효과:
  - 콘텐츠 적을 때: 콘텐츠가 위로 정렬되고 빈 공간은 배경으로 채워짐 (화면 꽉 차게)
  - 콘텐츠 많을 때: 자연스럽게 스크롤 (기존 동작 유지)

---

## 4순위 — 관리자 모드 순회 옵션

### 현재
`Platform.OS`로 자동 분배:
- Android: `index % 2 === 1` (홀수)
- iOS(iPad): `index % 2 === 0` (짝수)

### 문제
- 1대만 운영할 때도 절반만 순회됨
- 기기 한 대가 일시 차단되었을 때 다른 기기로 전체 순회를 시킬 방법이 없음
- 테스트 시 특정 기기에 부담을 몰아주기 어려움

### 변경
관리자 모드 UI에 분배 옵션 추가:
- **"전체"**: 모든 상품 순회
- **"홀수만"** (`index % 2 === 1`): Android 기본
- **"짝수만"** (`index % 2 === 0`): iOS 기본
- **"자동(Platform 기반)"**: 기존 동작 (기본값)

AsyncStorage에 선택값 저장 (`admin.distributionMode`), 앱 재시작 시 복원.

---

## 5순위 — 모니터링

### 사용자 상세페이지: "N시간 전 업데이트"
- `shared_products.lastRealPriceUpdatedAt`을 기준으로 상대시간 표시
- 예: "10분 전", "3시간 전", "어제", "3일 전"
- 6시간 이상 미갱신 시 노란색 강조 — TTL 6h 가드(1.0.17)와 함께 사용자가 "이 가격 최신인지" 판단 가능

### 관리자 모드: price_update_logs 통계
- 별도 컬렉션 `price_update_logs/{YYYY-MM-DD}` 또는 단일 문서 `meta/price_update_stats`에 일 단위 집계:
  - `attempted`: 시도 횟수
  - `succeeded`: realPrice write 성공
  - `challengeFailed`: Akamai 챌린지 timeout
  - `domFailed`: DOM 셀렉터 미스
  - `avgDurationMs`: 평균 소요 시간
- 관리자 모드 화면 상단에 오늘/어제 수치 표시
- 갱신 트리거: 매 WebView 호출 종료 시 increment

---

## 알림 푸시 구조 확정

### 원칙
1. **realPrice 기반으로만 알림 발송** — apiPrice 기반 알림은 즉시할인 미반영으로 false positive 발생 (구매 시 실제 가격이 다름)
2. **TRACKING 상태에서만 알림 허용** — INIT/SYNCING은 baseline 수집 중이라 변동 판정 불가
3. **24h productId 가드 유지** — `users/{uid}.lastNotifications.{priceDrop|priceUp|targetReached}[pid]`

### 활성 알림 종류 (1.0.19)
| 알림 | 조건 | 발송 주체 |
|------|------|----------|
| 가격 하락 | TRACKING + realPrice가 lowestPrice 갱신 또는 ≥10% 하락 | cron `shared-price-check.yml` |
| 가격 상승 | TRACKING + realPrice가 ≥10% 상승 (옵션, 사용자 설정) | cron `shared-price-check.yml` |
| 목표가 도달 | TRACKING + realPrice ≤ targetPrice | CF 트리거 `onSharedProductRealPriceChange` |

### 폐기/검토 대상
- **apiPrice 기반 알림**: cron 측 `priceDrop_summary` / `priceUp_summary`가 1.0.17부터 baseline을 realPrice로 전환했으나, fallback으로 apiPrice를 쓰는 분기가 남아 있다면 제거 검토
- **legacy `morning` / `evening` / `broadcast_drop10` / `broadcast_drop20`**: 1.0.16에서 폐기 또는 통계만 수집. 1.0.19에서 코드 정식 삭제

### CF 트리거 priceStatus 가드 추가
`functions/src/index.ts`의 `onSharedProductRealPriceChange`:
- handler 진입 시 `if (after.priceStatus !== 'TRACKING') return`
- INIT → SYNCING 전이도 트리거되지만 즉시 return → 비용 최소화
- SYNCING → TRACKING 전이는 baseline 통일 후 trackingStartedAt만 기록, 알림 X
- TRACKING → TRACKING(가격 변동)에서만 알림 발송

---

## 마이그레이션

### 기존 shared_products 문서 (~93개) 처리
- 마이그레이션 스크립트 1회 실행: `scripts/migration/2026-05-priceStatus-backfill.mjs`
- 로직:
  - `realPrice`가 존재하고 `priceHistory.length >= 2` → `priceStatus = 'TRACKING'`
  - `realPrice`가 존재하고 `priceHistory.length === 1` → `priceStatus = 'SYNCING'` (단, `firstRealPriceAt`은 `priceHistory[0].date`로 백필)
  - `realPrice`가 없음 → `priceStatus = 'INIT'`
- 안전 가드: dry-run 모드 먼저, 결과 로그 확인 후 실제 write
- 신규 추가 상품은 코드 변경 시점부터 `priceStatus = 'INIT'`로 시작

### 앱 측 하위 호환
- `priceStatus`가 undefined인 문서 발견 시 `'TRACKING'`으로 간주(기존 사용자 상품에 영향 없음)
- 마이그레이션 완료 후 이 fallback 제거

---

## 검증 계획

### 단위 시나리오
1. **신규 상품 추가** → `priceStatus === 'INIT'` 확인, 그래프 미표시, "(예상)" 라벨
2. **첫 realPrice 수집** (cron 또는 수동 새로고침) → `SYNCING` 전이, 그래프 1점, 알림 미발송 확인
3. **두 번째 realPrice 수집** (값 동일) → `TRACKING` 전이, 알림 미발송 (변동 0)
4. **세 번째 realPrice 수집** (≥10% 하락) → 가격 하락 알림 발송
5. **목표가 도달** → CF 트리거 알림 발송, `lastNotifications.targetReached[pid]` 박힘
6. **마이그레이션** → 기존 93개 문서 모두 `priceStatus` 채워짐, dry-run/실제 결과 일치

### 모니터링 지표
- 상품 추가 평균 소요시간: 1.0.18 ~30s → 1.0.19 목표 ≤2s
- INIT 상태 상품 비율 (전체 대비)
- SYNCING → TRACKING 전이 평균 소요시간 (= 첫 realPrice 후 두 번째 realPrice까지)
- 알림 false positive 신고 0건 목표

### 회귀 체크
- 기존 사용자의 그래프/현재가/알림 정상 동작 (마이그레이션 후)
- 1.0.18 fix 사항(iOS incognito 분기, 홈 여백, 공유 메시지) 회귀 없음
- cron + CF 트리거 + 클라이언트 자동 새로고침 모두 priceStatus 가드 적용 후 정상 동작

---

## 작업 순서 (제안)

1. **마이그레이션 스크립트 작성 + dry-run** — 기존 문서 분류 확인
2. **Functions 응답 스키마 확장** — `productName/productImage/apiPrice` 추가
3. **add-item.tsx 개편** — WebView 제거, 즉시 저장 흐름
4. **shared_products write 경로에 priceStatus 전이 로직 추가** — 앱 측 realPrice write + CF 트리거 + cron 모두 동일 로직
5. **상세페이지 표시 분기** — INIT/SYNCING/TRACKING별 UI
6. **알림 가드 추가** — cron + CF 트리거
7. **홈 ScrollView flexGrow** + 관리자 순회 옵션 + 모니터링 UI (3~5순위 일괄)
8. **마이그레이션 스크립트 실제 실행**
9. **베타 검증** — 단위 시나리오 6종

---

## 참고

- 본 문서는 1.0.19 작업 계획서로, 1.0.18 베타 검증 통과 후 진입한다.
- 1.0.18에서 iOS incognito 분기가 실패하거나 회귀가 발견되면 1.0.19 진입을 보류하고 1.0.18 추가 fix를 우선한다.
- 마이그레이션은 1회성이며, 이후 신규 상품은 코드가 자동으로 `priceStatus = 'INIT'`부터 시작한다.
