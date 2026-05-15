# 026. apiPrice 단일 출처 전환 (realPrice 제거) — 1.0.20 통합 빌드

> **상태**: 📋 설계 확정 (2026-05-16) — P1/P2 선반영 완료(`0b029b4`), 나머지 11종 작업 1.0.20 (bn56/vc56) 통합 빌드로 진행.
> 관련 문서: [023_RealPrice_Architecture.md](./023_RealPrice_Architecture.md) (이전 dual-price 설계, 본 문서로 대체), [025_PriceStateMachine.md](./025_PriceStateMachine.md) (priceStatus 머신 — 본 문서로 폐기)
>
> **2026-05-16 빌드 전략 변경**: bn56(선행 패치) / bn57(본격 전환) 분리 계획을 취소하고 **1.0.20 단일 통합 빌드**로 진행. 분리 빌드의 부가 비용(중간 베타 사이클 + 사용자 혼란 + 마이그레이션 2회)이 통합 비용 대비 높음.

---

## 배경 / 문제 정의

### 1.0.16~1.0.19 dual-price(`apiPrice` + `realPrice`) 운영 결과

`docs/023`이 도입한 "cron은 apiPrice / 앱 WebView는 realPrice" 분리는 false positive 알림을 줄이는 데 기여했지만, **구조적 불안정**이 누적되었다:

1. **Akamai Bot Manager 구조적 장벽**:
   - 1.0.16 iOS 무한로딩 fix
   - 1.0.17 Akamai 완화 4종 (UA 풀 + 쿠키 격리 + 지터 + 배치 휴식)
   - 1.0.17 iOS 100% 실패 → 1.0.18 incognito Platform 분기
   - 1.0.19 §1에서 상품 추가 경로의 WebView 제거 (Functions OG 파싱으로 우회)
   - 그러나 **1.0.19 Functions의 vp HTML OG 파싱조차 Akamai 차단으로 실패율 증가** (Functions IP 풀이 봇 분류)
2. **관리자 기기 순회 운영 부담**:
   - 안드로이드 + 아이패드 2대 상시 활성화 필요
   - 차단 발생 시 사용자 대신 운영자가 시간 경과 대기
   - 84개 순회에 ~3분 + 20개당 5분 휴식 → 1회 완주에 ~20분 소요
   - 3대+ 확장 시 deviceId hash 분배 필요한데 구현 미실시
3. **dual-price 정합성 부담**:
   - cron이 apiPrice를 priceHistory에 누적하던 잔여(`docs/025` §검증 잔여)
   - 신규 사용자가 추가한 상품의 첫 realPrice 수신을 변동으로 오탐
   - 1.0.19 §2에서 priceStatus 머신(INIT/SYNCING/TRACKING)으로 봉합했으나 **상태 관리 복잡도 증가**
   - sync race / 마이그레이션 / cron-CF-앱 3 출처 동기화 등 추가 부채

### 결정

**realPrice 개념 완전 제거 → apiPrice 단일 출처로 전환.** Akamai 의존성을 영구히 끊고 cron(쿠팡 파트너스 API)으로 통일한다.

---

## 핵심 방향

| 항목 | 변경 전 (1.0.19 기준) | 변경 후 (1.0.X bn57) |
|------|----------------------|---------------------|
| 가격 출처 | apiPrice(cron) + realPrice(WebView) 2원화 | **apiPrice 단일** |
| WebView | 상품 추가 제거 / 관리자·수동·자동 새로고침 유지 | **전체 제거** |
| priceStatus 머신 | INIT → SYNCING → TRACKING | **삭제** (전이 단계 없음, 즉시 추적) |
| 사용자 노출 라벨 | "현재가" / "(예상)" | **"기준가격"** + "실제 결제가는 쿠팡에서 확인" 안내 |
| 알림 메시지 | "[상품명] 가격이 X원으로 떨어졌어요" | **"[상품명] 기준가격이 내렸어요 ... 실제 결제가는 쿠팡에서 확인하세요"** |
| 관리자 기기 순회 | 활성 운영 (안드로이드 + 아이패드) | **기능 자체 제거** (또는 관리 화면만 유지) |
| `trackerCount=0` 정리 | cron이 매 사이클 fetchActiveProducts에서 skipZero 처리만 | **즉시 자동 삭제** (Firestore 비용 + rate limit 절감) |

### 트레이드오프 (사용자에게 정직)
- 장점: 운영 부담 0, 차단 없음, 코드 단순화 (priceStatus 머신 제거), 상품 추가 즉시 동작
- 단점: apiPrice는 즉시할인/쿠폰 미반영 "정가" — 사용자가 보는 가격과 다를 수 있음
- 완화: "기준가격" 라벨 + "실제 결제가는 쿠팡에서 확인하세요" 안내로 기대치 정합
- 핵심 가치 보존: 가격 변동 감지 + 목표가 도달 알림은 그대로 (apiPrice 시계열로도 충분히 작동 — `category_best` / `bestcategories` 큐레이션이 이미 같은 출처로 동작 중)

---

## 1. 가격 데이터 구조

### Firestore `shared_products/{productId}` 스키마

#### 유지 필드
| 필드 | 타입 | 의미 |
|------|------|------|
| `productId` | string | 쿠팡 상품 ID (문서 ID와 동일) |
| `url` / `resolvedUrl` | string | 원본 URL / vp URL |
| `vendorItemId` | string? | SKU 옵션 |
| `productName` | string | 상품명 |
| `thumbnail` | string | 이미지 URL |
| `apiPrice` | number | **단일 가격 진실 출처** (cron이 매 갱신) |
| `currentPrice` | number | `apiPrice`와 동일 (legacy 호환 alias — 점진적으로 제거) |
| `lowestPrice` / `highestPrice` | number | apiPrice 기반 |
| `priceHistory` | `{ date, price }[]` | **apiPrice 시계열** |
| `lastCheckedAt` | number | cron 마지막 갱신 시각 |
| `trackerCount` / `favoriteCount` | number | 카운터 |
| `lastPriceDropAt` / `lastDropRate` | number? | 알림 baseline |
| `createdAt` | number | 신규 생성 시각 |

#### 제거 필드 (마이그레이션 스크립트로 일괄 unset)
- `realPrice`
- `lastRealPriceUpdatedAt`
- `needsCheck`
- `priceStatus`
- `firstRealPriceAt`
- `trackingStartedAt`

### Firestore `users/{uid}/items/{itemId}` 스키마

#### 제거 필드
- `priceStatus`
- `apiPrice` (TrackedItem의 별도 필드 — currentPrice와 동일하므로 alias 제거)
- `firstRealPriceAt`
- `trackingStartedAt`
- `lastWebViewCheckedAt` (WebView 제거로 무의미)

### cron 갱신 주기 (`.github/workflows/` 검증 후 정확)

| 워크플로 | cron 표현식 | KST 시각 | 역할 |
|---------|------------|---------|------|
| `shared-price-check.yml` | `*/10 * * * *` | 10분마다 (04:30~01:00 block zone 가드) | **shared_products apiPrice 갱신** (핵심) |
| `notify-only.yml` | `30 22 * * *` + `0 11 * * *` | 07:30 / 20:00 | 가격 스캔 X + 알림 전용 발사 |
| `category-best-update.yml` | `0 17 * * *` | 02:00 | 카테고리 베스트 19개 |
| `event-best-jigumiya-update.yml` | `35 17 * * *` | 02:35 | D-7 윈도우 이벤트 11개 |
| `goldbox-update.yml` | `30 22 * * *` | 07:30 | 골드박스 1콜/일 |
| `coupangpl-update.yml` | `30 22 * * *` | 07:30 | 쿠팡 PL limit 100 |
| `tracked-backfill.yml` | `workflow_dispatch` only | (수동) | 일회성 백필 도구 |
| `price-check.yml.disabled` | — | — | legacy, 정식 폐기 예정 |

shared-price-check는 코드 내부에서 N값을 결정해 피크/비피크 차등 동작(`docs/020`). 본 작업은 빈도 조정 X, **realPrice 로직만 제거**.

---

## 2. 상품 추가 흐름

### WebView 완전 제거 (1.0.19 §1 유지 + Functions OG 의존 제거)

1.0.19에서 add-item.tsx의 `CoupangScraper`는 이미 제거됨. 본 작업에선 추가로:
- `CoupangScraper` 컴포넌트 자체 삭제
- `app/admin.tsx` / `app/detail/[id].tsx` / `components/PriceChecker.tsx`에서 import 제거
- `services/firebase.ts adminUpdateRealPrice` 삭제

### 신규 흐름 (≤2s 목표 유지)

```
사용자 "다음" 클릭
   ↓
resolveFromUrl()
   ↓
Functions resolveAndGenerateAffiliateUrl 호출
   ↓                                            ↓
ok=true                                      ok=false
   ↓                                            ↓
resolvedUrl + affiliateUrl + (메타 best-effort)  클라이언트 fallback (단축 URL HTML hex 파싱)
   ↓                                            ↓
   └────────────┬───────────────────────────────┘
                ↓
        meta.productImage / meta.apiPrice / meta.productName 확보 여부 점검
                ↓
        하나라도 빈값이면 → searchProducts(productId, 5) 클라이언트 fallback
                ↓
        productId 정확 매칭 시 → productImage + productPrice + productName 채움
                ↓
        target 단계 진입 → "기준가격 28,000원" 표시
                ↓
        handleSave → addItem (즉시 저장, priceStatus 없음)
                ↓
        홈으로 이동 → ProductCard 즉시 정상 표시
```

### Functions 측 변경

`functions/src/index.ts`:
- `fetchVpMetadata` 함수 **유지** (1.0.19 §1과 동일) — OG 파싱 성공 케이스는 cron 호출 절감
- 응답 스키마 그대로: `productName? / productImage? / apiPrice?`
- Akamai 차단 시 빈값 반환 (현 동작 유지)

### 클라이언트 측 변경 (1.0.20 #3)

`app/modal/add-item.tsx resolveFromUrl`:
- Functions 응답 후 fallback 블록 추가:
  ```
  if (!meta.productImage || !meta.apiPrice || !meta.productName) {
    if (ids.productId && meta.productName fallback 가능) {
      const keyword = (meta.productName || parseProductName(sharedText) || '').split(' ').slice(0,4).join(' ');
      if (keyword.length >= 2) {
        const products = await searchProducts(keyword, 5);
        const match = products.find(p => String(p.productId) === ids.productId);
        if (match) {
          meta.productImage = meta.productImage || match.productImage;
          meta.apiPrice = meta.apiPrice || match.productPrice;
          meta.productName = meta.productName || match.productName;
        }
      }
    }
  }
  ```
- `searchProducts`는 이미 `services/coupangApi.ts:92`에 구현되어 있음 (productImage 반환 확인 완료)
- 검색 API rate limit: 1분/50회 — 신규 추가 빈도(분당 1~2건) 대비 안전 마진

### addItem 변경 (1.0.20 #6 + #10)

`store/useAppStore.ts addItem`:
- `priceStatus = 'INIT'` 로직 삭제
- `shared_products` 머지 시 `priceStatus` 상속 로직 삭제
- 단순화된 흐름: `set(local)` + `await saveItemToFirestore` + `upsertSharedProduct` + `addTrackedRef` + `incrementTrackerCount`
- `priceHistory`는 빈 배열로 시작 → 첫 cron 사이클에서 1점 추가됨

---

## 3. 가격 표시 ("기준가격" 라벨)

### 핵심 라벨 룰

| 위치 | 표시 |
|------|------|
| 상세 hero 가격 | `기준가격 28,000원` |
| 상세 hero 안내 | `할인 / 쿠폰 / 카드 혜택 적용 전 가격이에요. 실제 결제가는 쿠팡에서 확인하세요` |
| ProductCard 가격 | `기준가격 28,000원` (한 줄) |
| 목표가 라벨 | `목표 기준가격 25,000원` |
| 추천 목표가 안내 | `추천 목표 기준가격: 25,200원 (10% 할인)` |
| add-item target 단계 | `기준가격 28,000원` + `정확한 결제가는 쿠팡에서 확인하세요` |

### 디자인 권장
- "기준가격" 라벨은 가격 숫자보다 한 단계 작은 폰트(`fontSize: 12 ~ 13`)로 prefix
- 안내 문구는 `theme.subtext` 색 + `fontSize: 11`
- 색상 분기 (변동 색):
  - 하락: 빨강(`#FF4444`)
  - 상승: 파랑(`#3B82F6`)
  - 무변동: subtext

### 제거되는 표현
- "(예상)" 라벨 (INIT 상태 표기 — priceStatus 머신과 함께 폐기)
- "추적 준비 중" / "가격 수집 중" 텍스트 (1.0.19 §2 추가분)

---

## 4. 그래프

### 변경 사항

- 데이터 출처: apiPrice 시계열 (`shared_products.priceHistory`) — 단일 출처
- priceStatus 분기 삭제 → 그래프는 `priceHistory.length` 기반으로만 분기:
  - `length === 0`: "데이터 축적 중 — 첫 갱신을 기다려요" 플레이스홀더 (cron 첫 사이클 후 사라짐)
  - `length === 1`: 점 1개 + "다음 갱신부터 변동 그래프가 표시됩니다"
  - `length >= 2`: 정상 LineChart
- 최고가 / 최저가 / 평균가 표시 유지
- **새로고침 버튼 제거** (`app/detail/[id].tsx` handleRefresh + CoupangScraper)
- 최근 갱신 시각 라벨은 `lastCheckedAt` 기반으로 변경 (1.0.19 §5의 `lastRealPriceUpdatedAt` 대체)

### 그래프 일관성 개선
- cron이 priceHistory에 apiPrice를 누적하는 것이 **정상 동작** (1.0.19 §2 보완에서 priceStatus 가드로 막던 분기 삭제)
- 모든 상품이 추가 즉시 추적 시작 → 그래프 출발 지점이 일관적

---

## 5. 알림 푸시 메시지

### 메시지 템플릿 (확정)

#### 가격 하락
```
[상품명] 기준가격이 내렸어요!
28,000원 → 24,900원 (-11%)
실제 결제가는 쿠팡에서 확인하세요
```

#### 목표가 도달
```
[상품명] 목표 기준가격에 도달했어요!
기준가격 24,900원 (목표 25,000원)
실제 결제가는 쿠팡에서 확인하세요
```

#### 가격 상승 (옵션, 사용자 설정 시)
```
[상품명] 기준가격이 올랐어요
24,900원 → 28,000원 (+12%)
```

### 발송 가드

`priceStatus === 'TRACKING'` 가드 삭제 (priceStatus 자체가 없음). 대체 가드:
- `previousPrice > 0` (baseline 존재)
- `apiPrice > 0`
- 24h productId 가드 (`users/{uid}.lastNotifications.{priceDrop|priceUp|targetReached}[pid]`) — 유지
- 변동률 절댓값 ≥ `NOTIFY_DROPRATE_PCT` (현 정책 유지)
- 변동률 절댓값 ≤ 60% (오매칭 차단, 유지)

### CF 트리거 변경

`functions/src/index.ts onSharedProductRealPriceChange`:
- **트리거 자체 삭제** (`realPrice` 필드 삭제로 발화 조건 사라짐)
- 목표가 도달 알림은 cron으로 일원화 (cron이 apiPrice 변동 감지 시 `events.targets` push)
- `onSharedProductRealPriceChange` deploy 해제 + `functions/src/index.ts`에서 export 제거

### cron 측 변경 (`scripts/shared-price-checker/`)

- `prevRealPrice` 변수 + `usingRealBaseline` 분기 삭제
- `prevPriceForNotif = prevApiPrice` 단일 baseline
- `[Skip-NonTracking]` / `[Skip-NoRealBaseline]` 가드 코드 삭제
- `events.targets` 발송 재활성화 (1.0.16에서 CF 트리거로 인계했던 코드 주석 해제 또는 정식 부활)
- legacy `morning` / `evening` / `broadcast_drop10` / `broadcast_drop20` 정식 삭제

---

## 6. 목표가 (앱 핵심 가치 유지)

### 기능 유지
- 목표가 입력 (선택사항) — 변경 없음
- 추천 목표가 = `apiPrice * 0.9` (10% 할인) — 변경 없음
- 목표가 도달 시 알림 — 메시지 템플릿만 "기준가격" 라벨로 갱신
- 24h 가드 / `lastNotifications.targetReached[pid]` — 유지

### 라벨 변경
| 위치 | 변경 전 | 변경 후 |
|------|---------|---------|
| 입력 placeholder | `목표가 입력 (선택사항)` | `목표 기준가격 (선택사항)` |
| 추천 버튼 | `추천 목표가: 25,200원 (10% 할인)` | `추천 목표 기준가격: 25,200원 (10% 할인)` |
| 안내 | `건너뛰면 최저가 갱신 시 알림을 보내드려요` | `건너뛰면 최저 기준가격 갱신 시 알림을 보내드려요` |
| 상세 참조선 | `목표 25,000원` | `목표 25,000원` (간결 유지) |
| 보조 안내 (target 단계) | (없음) | `(실제 결제가는 더 저렴할 수 있어요)` |

---

## 7. 제거 대상 정리

### 컴포넌트
- `components/CoupangScraper.tsx` **삭제**
- `components/PriceChecker.tsx` **삭제**
- `app/(tabs)/index.tsx`에서 `<PriceChecker active={...}>` 렌더 제거
- `app/detail/[id].tsx`에서 `handleRefresh` / `handleScrapeResult` / `handleScrapeError` / `<CoupangScraper>` 렌더 + 새로고침 버튼 제거
- `app/admin.tsx` — 관리자 모드 화면 **제거 또는 통계 전용으로 축소** (협의 후 결정, 본 문서 §8 참조)

### 함수 / 필드
- `services/firebase.ts`:
  - `adminUpdateRealPrice` 함수 삭제
  - `fetchAllSharedProducts` 유지 (관리자 화면 통계로 활용 가능)
  - `trackedItemToSharedProduct` — `realPrice` / `lastRealPriceUpdatedAt` mirror 분기 삭제, `priceStatus` / `apiPrice` 시드 분기 삭제
- `store/useAppStore.ts`:
  - `updateItemPrice` — priceStatus 전이 로직 전체 삭제. realPrice mirror도 삭제 (호출처 자체가 사라짐)
  - `markChecked` 삭제 (WebView TTL 가드용이라 무의미)
  - `syncFromFirestore` — priceStatus 머지 블록 삭제, `lastWebViewCheckedAt` 보존 블록 삭제
  - `backfillProductIds` 유지 (URL 재추출은 여전히 유효)

### Cloud Functions
- `onSharedProductRealPriceChange` 트리거 deploy 해제 + 코드 삭제
- `resolveAndGenerateAffiliateUrl` **유지** (메타 OG 파싱은 cron 호출 절감 효과로 남김)

### cron
- `scripts/shared-price-checker/index.ts`:
  - `REAL_PRICE_FRESH_MS` 가드 삭제 (라인 ~760)
  - `prevRealPrice` 변수 + realPrice baseline 분기 삭제
  - priceStatus 가드 삭제
  - `events.targets` 발송 코드 부활 (라인 ~904 주석 해제)
- legacy 알림 종류 정식 삭제 (morning / evening / broadcast_drop10 / broadcast_drop20)

### 타입
- `types/index.ts`:
  - `PriceStatus` 타입 삭제
  - `TrackedItem`에서 `priceStatus` / `apiPrice` / `firstRealPriceAt` / `trackingStartedAt` / `lastWebViewCheckedAt` 필드 삭제
  - `SharedProduct`에서 `realPrice` / `lastRealPriceUpdatedAt` / `needsCheck` / `priceStatus` / `firstRealPriceAt` / `trackingStartedAt` 필드 삭제

---

## 8. 관리자 모드 처리 (협의 필요)

### Option A — 화면 완전 제거 (권장)
- `app/admin.tsx` 삭제
- 설정 화면의 관리자 진입 버튼 제거
- `users/{uid}.isAdmin` 필드 deprecated
- 효과: 코드 단순화 최대, 운영 부담 0
- 단점: 향후 데이터 인사이트 화면이 필요하면 다시 만들어야 함

### Option B — 통계 전용으로 축소
- 분배 모드 / 순회 시작 버튼 / nextRunAt 카운트다운 / CoupangScraper 전체 제거
- 남기는 항목:
  - `fetchAllSharedProducts`로 전체 개수 표시
  - `trackerCount=0` 자동 삭제 통계 (얼마나 정리되는지)
  - Functions 응답 시간 / Akamai 차단율 등 모니터링
- 효과: 운영 인사이트는 유지하면서 동작 부담 0

### Option C — 그대로 유지하되 무력화
- 권장 안 함 (사용자 혼란)

**기본 권장: Option A.** 데이터 인사이트가 필요해지면 별도 dashboard 화면을 새로 만드는 게 마이그레이션 비용 대비 명료.

---

## 9. `trackerCount=0` 자동 삭제

### 배경
- 현 cron은 `trackerCount === 0`이면 `skipZero++` 카운트만 증가, 문서 자체는 보존
- 보존 이유: 다른 사용자가 재추가 시 priceHistory 누적 보존
- **그러나** 추적자 0인 상품은 cron이 rate limit + Firestore 비용을 영구히 소모

### 정책 변경
- 사용자가 상품 삭제 → `trackerCount` 감소 → `0`이 되면 **즉시** `shared_products/{productId}` 문서 삭제
- 재추가 시: `searchProducts(productId)`로 apiPrice + 이미지 새로 조회 → 새 priceHistory 시작
- 손실: 과거 priceHistory 영구 손실 (재추가 시 백지부터 출발)
- 이득:
  - cron rate limit 절감 (10분마다 dead 상품 fetch X)
  - Firestore read/write 비용 절감
  - 관리자 순회 대상 정리 (Option B 채택 시)

### 구현 위치
- `store/useAppStore.ts removeItem` — 기존 `incrementTrackerCount(productId, -1)` 호출 후
  - 새 헬퍼 `deleteSharedIfOrphan(productId)` 추가
  - Firestore에서 `trackerCount` read → 0 이하면 `deleteDoc(shared_products/productId)`
  - race 방어: transaction 사용 권장 (`runTransaction`으로 read+delete 원자화)
- 또는 cron 측에서 `trackerCount === 0 && favoriteCount === 0`인 상품을 한 사이클마다 cleanup
- 권장: **클라이언트 즉시 삭제 + cron 측 보조 cleanup** (race fallback)

### 안전 가드
- `favoriteCount > 0`이면 삭제 스킵 (자주사는 사용자 보호)
- `priceHistory.length > 30` 등 가치 있는 상품은 보존 옵션 검토
- 마이그레이션: 기존 `trackerCount=0` 상품 일괄 정리 스크립트

---

## 10. 1.0.20 (bn56/vc56) 통합 빌드 작업 13종

### 선반영 (1.0.19 베타 hot-patch, 커밋 `0b029b4`)
- [x] **1. P1 saveItemToFirestore await** — store/useAppStore.ts addItem에서 await 추가. syncFromFirestore race 차단 (1.0.19 ≤2s 추가 흐름에서 _layout.tsx의 AppState active sync 또는 홈 sync가 Firestore write 완료 전 발화 시 새 item 누락되던 race)
- [x] **2. P2 ProductCard priceStatus 분기** — INIT "추적 준비 중" 회색 + 하단 "가격 수집 중" + trendBadge 자동 null (trend 변수에 isTracking 가드). 다음 1.0.20에서 priceStatus 머신 제거 시 분기 자체도 함께 정리 예정

### 1.0.20 통합 작업

#### A — 즉시 효과 (이미지/가격 표시 + 홈 UX)
- [ ] **3. searchProducts fallback** — `app/modal/add-item.tsx resolveFromUrl`에서 Functions 메타(`productImage` / `apiPrice` / `productName`) 중 하나라도 빈값이면 fallback 진입:
  ```
  if (ids.productId && (parsedKeyword.length >= 2)) {
    const products = await searchProducts(parsedKeyword, 5);
    const match = products.find(p => String(p.productId) === ids.productId);
    if (match) { meta.productImage ??= match.productImage; meta.apiPrice ??= match.productPrice; meta.productName ??= match.productName; }
  }
  ```
  - `searchProducts`는 이미 `services/coupangApi.ts:92`에 구현 (productImage 반환 확인)
  - rate limit 1분/50회 — 신규 추가 빈도(분당 1~2건) 대비 안전
  - 키워드 매칭 실패 시 무영향 (cron이 결국 채움)
- [ ] **4. 홈 화면 여백 재확인** — `app/(tabs)/index.tsx` 1.0.19 §3 `flexGrow:1` 효과 검증 + 필요 시 추가 조정 (콘텐츠 적을 때 / 많을 때 양극단 모두 정상 동작)

#### B — 관리자 모드 통계 대시보드 전환 (§8 Option B 채택)
- [ ] **5. 관리자 모드 통계 화면** — `app/admin.tsx`를 통계 대시보드로 전환:
  - **추적상품수**: `fetchAllSharedProducts().length` + `trackerCount > 0` 분포
  - **가격변동 통계**: 최근 24h `price_drops` 컬렉션 카운트 + 평균 dropRate
  - **알림발송 통계**: `lastNotifications` 분포 또는 Functions 로그 집계 (또는 별도 `meta/notif_stats` 문서)
  - **사용자수**: `users` 컬렉션 `app === 'jigumiya'` count + 활성 사용자(`lastActiveAt` 7일 이내)
  - cron 갱신 시각 / 최근 실행 결과 (`meta/stats` 활용)
  - 분배 모드 / 순회 시작 / nextRunAt / 배치 휴식 / CoupangScraper 렌더 전부 제거
- [ ] **9. 관리자 순회 기능 제거** (#5와 동시) — `services/firebase.ts adminUpdateRealPrice` 삭제 + admin.tsx의 순회 로직 전체 (runOnce / handleStop / scrapeKeyRef / resolverRef / stopRef / countdownTimerRef / runOnceRef / 배치 휴식 등) 삭제

#### C — realPrice 필드 + priceStatus 머신 + WebView 제거
- [ ] **6. realPrice 필드 제거** — `types/index.ts`:
  - `SharedProduct`에서 `realPrice` / `lastRealPriceUpdatedAt` / `needsCheck` / `priceStatus` / `firstRealPriceAt` / `trackingStartedAt` 삭제
  - `TrackedItem`에서 `priceStatus` / `apiPrice` / `firstRealPriceAt` / `trackingStartedAt` / `lastWebViewCheckedAt` 삭제 (currentPrice가 단일 가격)
  - `PriceStatus` 타입 삭제
- [ ] **10. priceStatus 머신 제거** (#6과 통합):
  - `store/useAppStore.ts updateItemPrice` 함수 삭제 (realPrice mirror 경로 자체가 없음)
  - `store/useAppStore.ts addItem` priceStatus 상속 블록 삭제 + 시드 priceStatus='INIT' 삭제
  - `store/useAppStore.ts markChecked` 삭제 (WebView TTL 가드용이라 무의미)
  - `store/useAppStore.ts syncFromFirestore` priceStatus 머지 블록 + `lastWebViewCheckedAt` 보존 블록 삭제
  - `services/firebase.ts trackedItemToSharedProduct` realPrice/lastRealPriceUpdatedAt mirror + priceStatus/apiPrice 시드 분기 전부 삭제
  - `app/modal/add-item.tsx` handleSave에서 priceStatus='INIT' / apiPrice 저장 분기 삭제 (currentPrice만 저장)
  - `app/detail/[id].tsx` priceStatus 변수 + isInit/isSyncing/isTracking + 분기 UI (그래프 영역 / hero 라벨 / priceInsights 가드) 전부 삭제
  - `components/ProductCard.tsx` priceStatus 변수 + 분기 + currentPriceInit 스타일 삭제
- [ ] **8. CoupangScraper / PriceChecker 컴포넌트 제거**:
  - `components/CoupangScraper.tsx` 파일 삭제
  - `components/PriceChecker.tsx` 파일 삭제
  - `app/(tabs)/index.tsx`에서 `<PriceChecker active={checkTrigger > 0} key={checkTrigger}>` + `checkTrigger` state + 관련 useEffect 제거
  - `app/detail/[id].tsx`에서 `<CoupangScraper>` + `handleRefresh` + `handleScrapeResult` + `handleScrapeError` + 새로고침 버튼 제거
  - `app/admin.tsx`에서 CoupangScraper import / 렌더 제거 (#5와 통합)

#### D — "기준가격" 라벨 + 안내 문구
- [ ] **7. apiPrice 단일 출처 + "기준가격" 라벨** — 6개 위치:
  - **ProductCard 가격 행**: "기준가격" prefix (small font) + `{currentPrice.toLocaleString()}원`
  - **상세 hero**: "기준가격 28,000원" + 하단에 "할인 / 쿠폰 / 카드 혜택 적용 전 가격이에요. 실제 결제가는 쿠팡에서 확인하세요" 안내
  - **add-item target 단계 미리보기 카드**: "기준가격 28,000원" + "정확한 결제가는 쿠팡에서 확인하세요"
  - **목표가 입력 placeholder**: "목표 기준가격 (선택사항)"
  - **추천 목표가 버튼**: "추천 목표 기준가격: 25,200원 (10% 할인)"
  - **건너뛰기 안내**: "건너뛰면 최저 기준가격 갱신 시 알림을 보내드려요" + "(실제 결제가는 더 저렴할 수 있어요)"

#### E — trackerCount=0 자동 삭제
- [ ] **11. trackerCount=0 자동 삭제**:
  - `services/firebase.ts`에 신규 헬퍼 `deleteSharedIfOrphan(productId)` 추가
  - Firestore transaction으로 `shared_products/{productId}` read → `trackerCount <= 0 && favoriteCount <= 0`이면 `delete` 원자화
  - `store/useAppStore.ts removeItem`에서 `incrementTrackerCount(productId, -1)` 호출 후 `deleteSharedIfOrphan(productId)` 호출
  - 결정 필요: `favoriteCount=0` 추가 가드 + `priceHistory.length >= 30` 같은 가치 보존 가드 — 본 작업 진입 시 확정

#### F — 알림 메시지 템플릿 + 폐기 코드 정리
- [ ] **12. 알림 메시지 템플릿 적용**:
  - `scripts/shared-price-checker/notifier.ts` 메시지 템플릿 변경:
    - priceDrop: `[상품명] 기준가격이 내렸어요! XX → YY (-Z%) 실제 결제가는 쿠팡에서 확인하세요`
    - targetReached: `[상품명] 목표 기준가격에 도달했어요! 기준가격 YY (목표 ZZ) 실제 결제가는 쿠팡에서 확인하세요`
    - priceUp: `[상품명] 기준가격이 올랐어요 XX → YY (+Z%)`
  - `scripts/shared-price-checker/index.ts`:
    - `REAL_PRICE_FRESH_MS` 가드 (라인 ~760) 삭제
    - `prevRealPrice` 변수 + realPrice baseline 분기 삭제
    - priceStatus 가드 (1.0.19 §2 추가분) 삭제
    - `events.targets` 발송 코드 부활 (라인 ~904 주석 해제)
    - legacy `morning` / `evening` / `broadcast_drop10` / `broadcast_drop20` 코드 정식 삭제
  - `functions/src/index.ts`:
    - `onSharedProductRealPriceChange` 트리거 export 제거 + deploy 해제
    - `clearNeedsCheck` 헬퍼 삭제 (needsCheck 필드 자체 폐기)
    - `resolveAndGenerateAffiliateUrl`은 **유지** — `fetchVpMetadata`도 유지 (cron 호출 절감 효과)

#### G — 마이그레이션
- [ ] **13. 마이그레이션 스크립트** — `scripts/migration/2026-05-realPrice-cleanup.mjs`:
  - dry-run 모드 우선 (영향 받는 문서 수 / 삭제 대상 수 출력)
  - 기존 shared_products에서 `realPrice` / `lastRealPriceUpdatedAt` / `needsCheck` / `priceStatus` / `firstRealPriceAt` / `trackingStartedAt` FieldValue.delete
  - `currentPrice` ← `apiPrice ?? realPrice ?? currentPrice` 정합 보정
  - `trackerCount === 0 && favoriteCount === 0`이고 `priceHistory.length < 30` 문서 일괄 삭제 (가치 보존 가드 확정 후)
  - 결과 로그 검토 후 실 적용

### 1.0.20 빌드 + 배포 시퀀스
- [ ] 버전 bump: `app.config.js` (1.0.20, ios.buildNumber 56, android.versionCode 56) + `android/app/build.gradle` (versionCode 56 / versionName 1.0.20)
- [ ] 코드 변경 작업 위 13종 일괄 완료 + tsc 통과
- [ ] `eas build --local --profile production --platform ios` / `--platform android`
- [ ] TestFlight + Play Console 내부 테스트 배포
- [ ] 베타 검증 (§검증 계획)
- [ ] 통과 시 양 스토어 정식 출시
- [ ] Firestore `meta/config_jigumiya.minRequiredVersion = "1.0.20"` 갱신 (구버전 강제 업데이트)

---

## 검증 계획

### 단위 시나리오

#### bn56 (선행)
1. **이미지 즉시 표시** — 신규 상품 추가 시 (Functions OG 실패해도) searchProducts fallback으로 productImage 채워짐. ProductCard에 fallback 아이콘 대신 실제 이미지
2. **apiPrice 즉시 표시** — target 단계 미리보기 카드에 0원 대신 검색 API의 productPrice 노출
3. **홈 여백** — 추적 1~2개일 때 화면 하단 빈 공간 없음

#### bn57 (전면 전환)
1. **상품 추가 즉시 완료** — 평균 ≤2s + "기준가격 28,000원" 표시 + priceStatus 라벨 흔적 0
2. **첫 cron 갱신 후 그래프 1점 추가** — `priceHistory.length === 1` + "다음 갱신부터 변동 그래프" 안내
3. **두 번째 갱신 후 정상 그래프** — `length >= 2` + LineChart 표시
4. **가격 하락 알림** — "[상품명] 기준가격이 내렸어요! 28,000원 → 24,900원 (-11%) 실제 결제가는 쿠팡에서 확인하세요" 정확 수신
5. **목표가 도달 알림** — cron 발송 (CF 트리거 X) + "목표 기준가격 도달" 메시지
6. **trackerCount=0 자동 삭제** — 사용자가 상품 삭제 후 Firestore 콘솔에서 문서 자체 삭제 확인. 재추가 시 새 priceHistory 시작
7. **상세페이지 라벨** — "기준가격 X원" + "할인 / 쿠폰 / 카드 혜택 적용 전 가격이에요. 실제 결제가는 쿠팡에서 확인하세요"
8. **WebView 잔재 0** — admin/detail/PriceChecker 어디서도 WebView 로드 X, 새로고침 버튼 0

### 모니터링 지표
- 신규 추가 평균 소요시간 (목표: ≤2s 유지)
- 상품 추가 시 productImage 채움률 (목표: ≥95% — Functions OG + searchProducts 합산)
- cron rate limit 사용량 (`trackerCount=0` 정리 후 -20~30% 예상)
- 알림 false positive 사용자 신고 (목표: 1주차 0건)
- "기준가격이 실제와 다르다"는 사용자 문의 (안내 문구 효과 검증)

### 회귀 체크
- 기존 사용자의 그래프 / 현재가 / 알림 정상 동작 (마이그레이션 후)
- 기존 추적 상품의 priceHistory 보존
- 카테고리 베스트 / 이벤트 베스트 / 골드박스 / 쿠팡 PL 큐레이션 정상 동작 (영향 없음 — 동일 출처)

---

## 폐기되는 설계 문서

본 문서가 채택되면 다음 문서는 **historical record**로만 남기고 active 설계에서 제외:

- `docs/023_RealPrice_Architecture.md` — dual-price 분리 설계, 본 문서로 대체
- `docs/025_PriceStateMachine.md` — priceStatus 머신, 본 문서로 폐기

CLAUDE.md의 활성 설계 참조에서 023 / 025 링크는 유지하되 "deprecated, see docs/026" 표기 추가.

---

## 결정 사항 (체크리스트)

| 항목 | 결정 | 비고 |
|------|------|------|
| realPrice 완전 제거 | ✅ 확정 | bn57에서 실행 |
| WebView 전체 제거 | ✅ 확정 | bn57에서 실행 |
| priceStatus 머신 폐기 | ✅ 확정 | bn57에서 실행 |
| "기준가격" 라벨 + 안내 문구 | ✅ 확정 | 6개 위치 적용 |
| trackerCount=0 자동 삭제 | ✅ 확정 | 클라이언트 즉시 + cron 보조 |
| 관리자 모드 처리 | ⏳ Option A vs B 결정 필요 | 사용자 협의 |
| favoriteCount=0 추가 가드 | ⏳ 검토 | 자주사는 미사용 상품 보호 |
| priceHistory.length 보존 가드 | ⏳ 검토 | 가치 있는 시계열 보존 |
| **1.0.20 통합 빌드 (bn56/vc56)** | ✅ 확정 | bn56/bn57 분리 취소, 13종 작업 일괄 처리 |
| 관리자 모드 → 통계 대시보드 | ✅ 확정 (Option B) | 추적상품수 / 가격변동 / 알림발송 / 사용자수 |
| favoriteCount=0 추가 가드 | ⏳ 검토 | trackerCount=0 자동 삭제 진입 시 결정 |
| priceHistory.length 보존 가드 | ⏳ 검토 | length ≥ 30 등 가치 시계열 보존 |
