---
created: 2026-04-26
updated: 2026-04-30
status: §8-A/§8-B 완료 + 1.0.6 배포 + §12 알림 7종 + §5-2 동적 사이클 고도화 + 1.0.7 빌드 (2026-04-30) / §8-C 대기
선행: 017_앱구조개편_Phase3.md (Phase 3-A/3-D 완료), 018_FirebaseFunctions_Resolver.md
---

# 019. Phase 3 — SharedProducts + 카테고리 베스트 통합 설계

> 본 문서는 017 §2 `shared_products` 스키마를 **확장**한다.
> 핵심 추가: ① 카테고리 베스트 컬렉션 `category_best`, ② 지금이야/아이고 Firebase 프로젝트 통합, ③ 단일 cron(지금이야 레포)으로 양 앱 공통 데이터 갱신.

## 구현 진행 (2026-04-30 갱신)

| 단계 | 상태 | 비고 |
|------|------|------|
| §8-A 카테고리 베스트 단독 구현 | ✅ 완료 | 19개 × 50개 = 950개 상품, cron 02:00 KST sleep 80초, feed 탭 UI 교체 (커밋 `833805d`, `9a13363`, `18abcb0`) |
| §8-B shared_products 중복 제거 | ✅ 완료 | `category-best-cache.ts` 신설, 6시간 신선도 + 30% 변동 가드 (커밋 `833805d`) |
| 가격변동 탭 + price_drops 컬렉션 | ✅ 완료 | 4탭 구조 전환, 필터 칩, 하락률 뱃지, `recordPriceDrop` 로직 (커밋 `f8b88e9`) |
| 1.0.6 (bn40/vc40) 배포 | ✅ 완료 | iOS App Store 심사 제출 + Android 프로덕션 승급 (커밋 `986acaf`) |
| §8-C 아이고 Firebase 통합 | ⏸ 대기 | 아이고 베타 출시 이후 진행 합의 |
| §8-D-1 shared-price-checker cron 신설 | ✅ 완료 (2026-04-27) | `scripts/shared-price-checker/`, collectionGroup 인덱스 배포, workflow_dispatch만 활성 (커밋 `62448cc`) |
| §12 알림 7종 + 24h 중복 방지 + 시간대 분기 | ✅ 완료 (2026-04-30) | morning/drop_summary/target/up_summary/evening_no_change/broadcast_drop10/20, `users/{uid}.lastNotifications` (커밋 `ee60516`) |
| §5-2 동적 사이클 고도화 (cycles/sleep 자동, 분할 모드, offset, Block zone) | ✅ 완료 (2026-04-30) | `computeCycleConfig()` + `waitIfInBlockedZone()` + offset 진행도 보존 (커밋 `7d75473` → `b625f07`) |
| BUG-42 쿠팡 공유 무한로딩 방어 | ✅ 완료 (2026-04-30) | Functions 워밍업 + callable 8s/fetch 5s/deeplink 5s timeout (커밋 `5c0b5da`) |
| firestore.rules `price_drops_baby` 규칙 | ✅ 완료 (2026-04-30) | read 인증 / write 차단, CLI 배포 (커밋 `c7fbfb1`) |
| 앱 알림 라우팅 분기 (price-drops/home/detail) | ✅ 완료 (2026-04-30) | `resolveNotificationRoute` 헬퍼 (커밋 `c66489f`). 실기기 검증 미완료 |
| 온보딩 문구 갱신 ("가격 변동 시 즉시 알림") | ✅ 완료 (2026-04-30) | OnboardingScreen Step 1 (커밋 `ffa5154`) |
| 1.0.7 (bn41/vc41) 빌드 완료 | ✅ 완료 (2026-04-30) | AAB/IPA 산출, Play/App Store 업로드 대기 |
| §8-D-2 cron 활성화 (schedule 주석 해제) | ⏸ 대기 | 선결: §8-C 아이고 통합 + workflow_dispatch dry-run + category-best broadcasts 큐 |
| category-best 브로드캐스트 큐 (category-best-updater 측) | ⏸ 별도 PR | 갱신 시 10/20% 하락 감지 → `broadcasts/{id}` 기록 → shared-price-checker가 큐 소비 |
| ~~`category-best-update.yml` 낮 2회 보조 업데이트~~ | ❌ 폐기 | rate-limited 시 당일 중단 원칙(§4-1·§5-2) |

---

## 1. 핵심 결정 (확정)

| 항목 | 결정 | 비고 |
|------|------|------|
| 데이터 출처 | `/products/bestcategories/{categoryId}` | 카테고리별 베스트셀러 API |
| 사용 목적 | 피드 탭(`feed.tsx`) 콘텐츠 | 현재 "곧 출시" 배너 대체 |
| Firebase 구조 | `category_best/{categoryId}` 단일 문서 + `shared_products` 승격 | 클릭/추적 시점에 productId 키로 승격 |
| Firebase 프로젝트 | 아이고(`aigo-a`) → 지금이야(`jigumiya`)로 통합 | `shared_products`, `category_best` 양 앱 공유 |
| cron 관리 | 지금이야 레포 단일 관리 | 아이고 cron 폐기, 알림만 앱별 분리 |
| 골드박스 | **공유상품에서 제외** | 가격 변동 잦아 신뢰도 하락 우려, 파트너스 문의 답변 후 재검토 |

---

## 2. Firebase 통합

### 2-1. 통합 방향
- 아이고 Firebase 프로젝트 `aigo-a` → **지금이야 `jigumiya` 프로젝트로 통합**
- 통합 컬렉션:
  - `shared_products/{productId}` — 양 앱 공유 (이미 Phase 3-A 완료)
  - `category_best/{categoryId}` — 양 앱 공유 (신규)
- 분리 유지:
  - `users/{uid}` — 앱별 분리 (FCM 토큰, tracked, favorites 모두)
  - 카테고리 구성 — 앱별 별도 관리(§7)

### 2-2. 아이고 측 변경 사항
- `aigo` Firebase 프로젝트 → `jigumiya` 프로젝트로 설정 변경
  - `google-services.json` (Android) 교체
  - `GoogleService-Info.plist` (iOS) 교체
  - `app.config.js`의 Firebase 설정 분기(Android/iOS) 갱신
- 기존 아이고 사용자 데이터 마이그레이션 별도 계획 필요 (베타 출시 이후)
- **Firebase Functions Resolver(018)는 jigumiya 프로젝트에 단일 배포** — 아이고도 동일 함수 호출

### 2-3. 보안 규칙 추가
```
match /category_best/{categoryId} {
  allow read: if request.auth != null;
  allow write: if false;  // 서버(GitHub Actions)만 기록
}
```
- `shared_products`, `price_drops` 규칙은 017 §2-4 그대로 유지

---

## 3. Firestore 컬렉션 구조

### 3-1. `category_best/{categoryId}` (신규)
```
category_best/{categoryId}
├── categoryId: number              ← 쿠팡 공식 카테고리 ID (문서 ID와 동일)
├── categoryName: string            ← "여성패션", "식품" 등
├── displayOrder: number            ← 앱 내 정렬 순서
├── updatedAt: Timestamp            ← 마지막 갱신 시각
└── products: [                     ← 상위 50개 (배열, 단일 문서 1MB 한도 충분)
      {
        rank: number,               ← 1~50
        productId: string,
        productName: string,
        productPrice: number,
        productImage: string,
        productUrl: string,
        isRocket: boolean,
        isFreeShipping: boolean
      }
    ]
```

**설계 결정**:
- products 배열 단일 문서 — 카테고리당 50개 × 8필드 ≈ 50KB → 1MB 한도 여유 충분
- 서브컬렉션 X — 50개 묶음을 한 번에 읽는 패턴이 압도적이므로 read 비용 최소화
- `priceHistory` 미보관 — 베스트 스냅샷 용도, 가격 추적은 `shared_products`로 위임

### 3-2. `shared_products/{productId}` (기존 유지)
017 §2-1 스키마 그대로. 카테고리 베스트와 겹치는 productId는 동일 문서로 통합 관리.

### 3-3. 카테고리 베스트 → shared_products 승격
- 트리거: 유저가 베스트 상품을 **추적/자주사는상품으로 추가하는 시점**
- 동작:
  1. `getSharedProduct(productId)` 조회
  2. 미존재 시 → `upsertSharedProduct` (베스트 스냅샷 데이터 활용, API 재호출 없음)
  3. 존재 시 → `incrementTrackerCount` 또는 `incrementFavoriteCount`만 수행

### 3-4. `meta/stats` (신규)
- 단일 문서 `meta/stats` — 운영 카운터 모음
- 필드:
  - `sharedProductCount: number` — `shared_products` 전체 문서 수
- 갱신:
  - `shared_products` 추가 시 `increment(+1)`
  - `shared_products` 삭제(GC) 시 `increment(-1)`
- 용도: 가격 체크 cron 호출량 산정 베이스 + 운영 모니터링 (단일 read로 전체 규모 확인)

---

## 4. cron 통합 구조 (지금이야 레포 단일 관리)

### 4-1. 스케줄
| 시각 (KST) | 작업 | 대상 |
|-----------|------|------|
| 02:00 | 카테고리 베스트 업데이트 | `category_best` 전체 카테고리 |
| 04:30 ~ 01:00 (20.5h) | shared_products 가격 체크 | 분당 최대 40회 순차, `category_best` 중복 productId **제외** |

- **알림은 각 앱 FCM 토큰으로 분리 발송**
- 알림 스케줄:
  - 지금이야: **11:30, 20:30 KST**
  - 아이고: **10:00, 19:00 KST**
- **낮 보조 업데이트 폐기** — rate-limited 시 당일 중단 원칙(§5-2). 다음날 02:00 회차에 갱신 흡수.

### 4-2. 중복 처리 로직 (핵심)
```
shared_products cron 실행 시:
  for each tracked productId:
    if productId in category_best.products[*].productId:
      → category_best에서 가격 데이터 재사용 (API 재호출 없음)
    else:
      → /products/search 호출
```
- 중복 확인 기준: **productId (쿠팡 고유 상품 번호)**
- 효과: 베스트 100개 × 20개 카테고리 = 2,000개 productId 캐싱 → shared_products 가격 체크 호출량 대폭 감소

### 4-3. 폐기되는 구조
- 아이고 `price-check.yml` cron — 폐기 (지금이야 단일 cron으로 통합)
- 기존 시간대 분리 스케줄(지금이야 08/12/20 ↔ 아이고 07/09/11/13/16/19) — 폐기

### 4-4. trackerCount 기반 정리 (신규)
- `shared_products.trackerCount`는 **지금이야 + 아이고 양 앱 합산** 카운터
- 두 앱이 동일 `shared_products/{productId}` 문서를 공유하므로 ref 추가/삭제 시 항상 합산 증감(`incrementTrackerCount`)
- `trackerCount === 0` 도달 시 → **정리 대상**
  - 가격 체크 cron 대상에서 제외
  - 향후 GC cron(미구현)에서 문서 삭제 + `meta/stats.sharedProductCount` `-1`
- `favoriteCount`도 동일 합산 기준 — 단 favorite은 추적과 독립이라 정리 트리거는 아님

---

## 5. API 호출 설계 (보수적 기준)

> **전제**: 쿠팡 공식 확인 대기 중. 보수적으로 추정해 안전 마진 확보.

### 5-1. 카테고리 베스트 (가정)
- `/products/bestcategories/{categoryId}` 1콜로 100개 반환 가정 → **100개 = 100회 호출로 보수적 가정**
- 분당 100회 한도의 **50%만 사용** (분당 50회)
- 카테고리 1개 처리: **2분 소요**
- 카테고리 20개 기준: **40분 완료**

### 5-2. shared_products 가격 체크 (확정 + 동적 사이클 고도화 2026-04-30)
- **실행 시간**: 매일 **04:30 ~ 01:00 KST** (총 20.5시간 = 1230분 = 73,800,000ms = `BUDGET_MS`)
- **호출 속도 하한**: 분당 **최대 40회** = sleep **1500ms 하한** (공식 한도 50회의 80% 마진)
- **방식**: `shared_products` 컬렉션 **createdAt asc 순차 호출** (FIFO)
- **당일 신규 추가 상품**: **다음날 회차부터 체크 대상 편입** (`createdAt >= todayKstMidnight()` 시 스킵)
- `category_best` 중복 productId는 캐시(§8-B) 재사용 → API 재호출 제외
- 상품당 1회 검색 (2026-04-24 재시도 루프 제거 정책 유지)
- **rate-limited(429) 감지 시 즉시 중단, 당일 재실행 없음** — 낮 보조 회차 폐기 원칙(§4-1 비고)

#### 5-2-A. 동적 사이클 산출 (`computeCycleConfig`, 2026-04-30 b625f07)

```ts
const DAILY_CAPACITY = 50_000;   // 하루 처리 가능 상품 수 (분할 모드 임계)
const MAX_CYCLES = 144;           // 일일 최대 사이클 (10분 간격 == 24h × 6)
const BUDGET_MS = 1230 * 60 * 1000;
const DEFAULT_SLEEP_MS = 1500;    // sleep 하한 (분당 40회)
```

| 조건 | 산출 |
|------|------|
| N=0 / read 실패 | dailyCount=0 (no-op), sleepMs=1500 |
| N ≤ 50,000 | cycles = max(1, min(144, ⌊49,200/N⌋)), sleep = max(1500, ⌊BUDGET_MS / (N×cycles)⌋) |
| N > 50,000 | 분할 모드: dailyCount=50,000, cycles=1, sleep=max(1500, ⌊BUDGET_MS/50,000⌋)=1500 |

검산:

| N | dailyCount | cycles/day | sleep/call | 1cycle 소요 | 비고 |
|---|------------|------------|-----------|------------|------|
| 0 | 0 | 1 | 1500 | - | no-op |
| 37 | 37 | 144 | 13,851ms | 8.54분 | 정상 |
| 1,000 | 1,000 | 49 | 1,506ms | 25.1분 | 정상 |
| 10,000 | 10,000 | 4 | 1,845ms | 5.13시간 | 정상 |
| 49,200 | 49,200 | 1 | 1,500ms | 1230분 | 한도 |
| 50,000 | 50,000 | 1 | 1,500ms | 1250분 | overflow 20분 (Block zone에서 흡수) |
| 120,000 | 50,000 | 1 | 1,500ms | 1250분 | split, 3일에 1순환 |

#### 5-2-B. 분할 모드 + offset 진행도 보존

- `meta/stats.lastCheckedOffset?: number` (optional, 기본 0) — split 모드 진입 시점에 read/write
- 슬라이스 산출:
  ```ts
  const start = config.startOffset % all.length;
  const end = start + config.dailyCount;
  slice = end <= all.length
    ? all.slice(start, end)
    : [...all.slice(start), ...all.slice(0, end - all.length)];   // 래핑
  ```
- **option (b) 진행도 보존**: `processedCount` 매 iteration 시작 시 `i+1` 낙관 증가, rate-limited break 시 `i`로 롤백 (현재 item 미평가). 종료 시 `(startOffset + processedCount) % totalCount`로 `lastCheckedOffset` 갱신. 부분 진행 보존 → 다음 run 이어서 처리.

#### 5-2-C. Block zone 대기 (`waitIfInBlockedZone`)

```ts
01:00 ≤ KST < 04:30  →  04:30 KST 까지 sleep
```

- 매 iteration 직전 1회 체크 — 카테고리 갱신 시간대(`category_best` 02:00, baby 01:15/01:30/03:00/03:20, event 01:00) 충돌 방지
- 자연 overflow 흡수 (50,000개 1.5s = 1250분 vs 1230분 → 20분 자동 대기)

#### 5-2-D. 시작 로그 형식

```
[Cycle] N=37 daily=37 cycles=144 sleep=13851ms offset=0~36 split=false
[Cycle] N=120000 daily=50000 cycles=1 sleep=1500ms offset=50000~99999 split=true
```

### 5-3. 안전 장치
- 분당 호출 카운터 + sleep 기반 throttle
- 429 응답 시 즉시 중단 + 다음 cron 회차로 이월
- Rate Limit 초과 발생 시 cron 자동 비활성화 알림 (Slack/이메일 검토)

### 5-4. 미확정 (쿠팡 파트너스 문의 답변 대기)
- `/products/bestcategories` 1콜 = 1회 vs 100회 카운트 여부
- 골드박스 호출량 산정
- 카테고리 ID 전체 목록 (현재 공식 문서 미공개로 추정)

---

## 6. 골드박스 처리

- **현 시점 공유상품 컬렉션에서 제외**
- 이유:
  1. 가격 변동이 시간 단위로 잦음 → 알림 신뢰도 저하 우려
  2. 카테고리 베스트와 중복되는 상품 다수
  3. 호출량 산정 불확실
- 재검토 시점: 쿠팡 파트너스 공식 문의 답변 수신 후
- 기존 `services/coupangApi.ts:fetchGoldbox` 함수는 코드 유지 (UI 미연결, 향후 활용 대비)

---

## 7. 카테고리 선정

### 7-1. 지금이야 (확정 — 2026-04-26)
- **공식 카테고리 19개** (probe 없이 쿠팡 공식 문서로 확정, ID 1001~1030 범위)
- 카테고리 19개 × 베스트 50개 = **950개 상품** Firebase 저장 운영 중
- 카테고리 ID 매핑: `scripts/category-best-updater/categories.ts` 참조

### 7-2. 아이고
- **기존 아이고 앱의 월령별 카테고리 구조** 그대로 따름
- 별도 확인 필요 (아이고 레포 `~/aigo/aigo` 측 `baby_category` 구조 참조)
- 지금이야 범위 외 — 아이고 측 작업으로 분리

### 7-3. 운영 원칙
- 두 앱 **Firebase 공유**하되 **카테고리 구성은 각자 별도 관리**
- 클라이언트가 자기 앱에 해당하는 categoryId 목록만 화면에 표시
- 서버 cron은 양쪽 카테고리 합집합 갱신

---

## 8. 작업 순서 (제안)

### 8-A. 카테고리 베스트 단독 구현 (지금이야 우선) — ✅ 완료 (2026-04-26)
1. ✅ `services/coupangApi.ts`에 `fetchBestCategories(categoryId, limit)` 추가
2. ✅ **공식 카테고리 19개 확정** — probe 없이 쿠팡 공식 문서로 확정 (1001~1030)
3. ✅ `types/index.ts`에 `CategoryBest`, `BestProductItem` 타입 추가
4. ✅ `services/firebase.ts`에 `getCategoryBest(categoryId)`, `subscribeCategoryBest(categoryId)` 추가
5. ✅ `firestore.rules`에 `category_best` 규칙 추가 + Console 게시 완료
6. ✅ cron 스크립트 신설: `scripts/category-best-updater/`
   - 19개 카테고리 순회, 카테고리 사이 **sleep 80초** (분당 50회 한도 보수 운영)
   - `.github/workflows/category-best-update.yml` — **매일 02:00 KST 1회**
   - Firebase 저장: 19개 × 50개 = **950개 상품**
7. ✅ `app/(tabs)/feed.tsx` "곧 출시" 배너 → 카테고리 베스트 리스트로 교체
   - 카테고리 칩 가로 스크롤 + 선택 카테고리 상품 리스트
   - 1~3위 민트 랭크 뱃지, 로켓배송 이모지
   - 쿠팡 파트너스 의무 고지 푸터
8. ❌ **폐기**: 낮 2회 보조 업데이트 — rate-limited 시 당일 중단 원칙으로 폐기 (§4-1 비고, §5-2)

### 8-A-bis. 가격변동 탭 신설 (4탭 구조) — ✅ 완료 (2026-04-26)
- 탭 구성: **홈 / 자주사는 / 카테고리 베스트 / 가격변동** (기존 3탭 → 4탭)
- `price_drops` 컬렉션 설계 + `subscribePriceDrops` 구독 추가
- 필터 칩(전체/-10%/-20%) + 하락률 뱃지
- `scripts/price-checker/`에 `recordPriceDrop` 로직 추가
- 실데이터: cron 비활성 상태라 cron 재활성화 후 채워짐 (커밋 `f8b88e9`)

### 8-B. shared_products 통합 (중복 제거) — ✅ 완료 (2026-04-26, 커밋 `833805d`)
1. ✅ `scripts/price-checker/category-best-cache.ts` 신설
2. ✅ shared_products 가격 체크 시 `category_best` 캐시 조회 → 중복 productId 시 API 재호출 없이 캐시 가격 재사용
3. ✅ 가드: **6시간 신선도** + **30% 변동 가드** (캐시값과 너무 차이나면 캐시 무시)
4. ⏸ 1주일 이중 관찰 — cron 재활성화 후 진행

### 8-C. 아이고 Firebase 통합 (베타 출시 이후) — ⏸ 대기
1. 아이고 Firebase 설정을 jigumiya 프로젝트로 교체
2. 아이고 카테고리(`baby_category`) 정의 + cron에 합집합 추가
3. 기존 아이고 유저 데이터 마이그레이션 계획 별도 수립

### 8-D. shared-price-checker cron — 신설 + 활성화

#### 8-D-1. cron 코드 신설 — ✅ 완료 (2026-04-27, 커밋 `62448cc`)
1. ✅ `types/SharedProduct.createdAt?: number` 추가 (당일 추가 스킵용, optional로 기존 문서 호환)
2. ✅ `services/firebase.ts:upsertSharedProduct` — 신규 생성 분기 시 `createdAt: Date.now()` 기록 (read+write 분기)
3. ✅ `firestore.indexes.json` 신설 — collectionGroup `tracked.productId` 인덱스 배포 (`firebase deploy --only firestore:indexes`)
4. ✅ `scripts/shared-price-checker/` 신설 (7개 파일):
   - `index.ts`: shared_products 풀 fetch + createdAt asc + trackerCount=0/당일 추가 스킵 + 캐시 hit 시 API 스킵 + sleep 1500ms + rate-limited 즉시 종료 + collectionGroup 추적자 수집 + Expo 푸시
   - `coupang-api.ts`: `SearchResult`/`FetchPriceResult` 도입 — rateLimited 명시 분기 (HTTP 429 + rMessage 휴리스틱)
   - `price-drop.ts`: `recordPriceDrop` 분리 (db 인자 받는 형태)
   - `category-best-cache.ts`, `notifier.ts`: 기존 `price-checker`에서 복사
5. ✅ `.github/workflows/shared-price-check.yml`: cron `'30 19 * * *'` 주석, workflow_dispatch만 활성, timeout 350분(GitHub 6h 한도 안전 마진)

#### 8-D-2. cron 활성화 — ⏸ 대기
- 선결: §8-C 아이고 통합 + 쿠팡 파트너스 문의 답변(`bestcategories` 호출 카운팅 방식)
- 활성화 작업: `shared-price-check.yml`의 `schedule.- cron` 주석 해제
- 기존 `price-check.yml`(users-based legacy) — 변경 없이 비활성 유지, Phase 3-C에서 정식 폐기

---

## 9. 미확정 / 후속 검토 항목

- [ ] **대기**: 쿠팡 파트너스 공식 문의 답변 — `/products/bestcategories` 호출 카운팅 방식(1콜 = 1회 vs 100회) + 카테고리 ID 전체 공식 목록
- [ ] 골드박스 재검토 (파트너스 답변 후)
- [ ] 카테고리 베스트 갱신 실패 시 fallback 정책 (이전 스냅샷 유지 vs 빈 화면)
- [x] 피드 탭 UX: **카테고리 칩 가로 스크롤** 채택 (2026-04-26)
- [ ] 카테고리 베스트 → 추적 추가 시 10개 한도 도달 시 UX
- [ ] 아이고 `baby_category` 구조 확인 + 통합 시점 (베타 출시 이후)
- [ ] cron 알림 분리: 같은 productId가 양 앱 유저 모두 추적 시 알림 중복 방지
- [x] ~~`category-best-update.yml` 낮 2회 보조 업데이트~~ — 폐기 (rate-limited 시 당일 중단 원칙, §4-1·§5-2)
- [ ] 가격변동 탭 실데이터 검증 — cron 재활성화 후 `recordPriceDrop` 동작 확인

---

## 10. 비고

- 본 문서는 017 §2를 **확장**하는 신규 설계 — 017은 이력 보존
- 구현은 **카테고리 베스트 우선 → shared_products 통합 → 아이고 통합** 순
- cron 재활성화 선결 조건: §8-A + §8-B 완료
- Firebase 통합(§8-C)은 아이고 베타 출시 이후 진행 (CLAUDE.md 합의 사항)

---

## 11. 앱 내 검색 기능 (신규 설계)

### 11-1. 검색 대상
- **Firebase 내부 데이터만** 검색 — **쿠팡 API 호출 없음**
- 검색 컬렉션:
  - `category_best/{categoryId}.products[*]` — 지금이야 19개 × 50 = 950개
  - `category_best_baby/{slug}.products[*]` — 아이고 월령별 베스트
  - `event_best/{eventSlug}.products[*]` — 아이고 기념일 31개 (`minPrice=30000`)
  - `shared_products/{productId}` — 양 앱 추적/자주사는 합집합

### 11-2. 검색 방식
- 클라이언트 측 `productName` 부분 일치 필터링
- 카테고리/이벤트 베스트는 단일 문서 fetch 후 메모리 필터 (읽기 비용 최소)
- `shared_products`는 별도 쿼리 (이름 인덱싱 추후 검토) 또는 클라이언트 필터

### 11-3. 미검색 상품 (없는 상품)
- 검색 결과 0건 시 **"이 상품 추적 요청"** 버튼 노출
- 유저 입력(쿠팡 URL 또는 키워드) → 운영자 검토 후 `shared_products` 편입
- **쿠팡 API 직접 호출은 운영자 cron 경유로만 처리** (호출량 통제)

### 11-4. 운영 의도
- 쿠팡 파트너스 API 호출량을 검색 트래픽에 의해 늘리지 않음 (Rate Limit 방어)
- `shared_products` 풀이 커질수록 검색 적중률 자연 상승
- 베스트 컬렉션은 cron 갱신 주기(매일)와 동기화된 결과 반환

---

## 12. 알림 설계 (7종, 2026-04-30 확정 + 구현 완료)

### 12-1. 결정 배경
- 2026-04-28 1차 설계: "하루 3회 고정 시간대 누적 발송" + 시간대 미확정
- 2026-04-30 재설계: **"즉시 발송 + morning/evening 시간대 분기"** — 가격 변동 감지 즉시 발송 (스캔 사이클 ~1분 내 일괄 flush) + 시간대 안내성 알림 분리
- 폐기: 기존 AlertType (`lowest_ever`, `lowest_no_target`, `no_change`) — `price_drop_summary` / `evening_no_change`에 흡수

### 12-2. 7종 타입 + 트리거 + 대상

| # | type 키 | 트리거 | 대상 | 합산 |
|---|---------|--------|------|------|
| 1 | `morning_greeting` | cron 진입 시간대가 07:00~09:00 KST | 활성 사용자 전체 | n/a |
| 2 | `price_drop_summary` | 가격 하락 감지 (사이클 끝) | 추적자 | **사용자당 1개**, N개 합산 |
| 3 | `target_reached` | 목표가 ≤ newPrice 진입 (사이클 끝) | 해당 추적자 | 상품별 1개 (즉시성 우선) |
| 4 | `price_up_summary` | 가격 상승 감지 (사이클 끝) | 추적자 | **사용자당 1개**, N개 합산 |
| 5 | `evening_no_change` | cron 진입 시간대 19:30~21:00 KST | 그날 가격 알림 미수신 활성 사용자 | n/a |
| 6 | `broadcast_drop10` | shared 풀에서 -10%~-19% 하락 감지 | 활성 사용자 전체 | 단일 푸시 (영향 상품 N) |
| 7 | `broadcast_drop20` | -20% 이하 폭락 감지 | 활성 사용자 전체 | 단일 푸시 |

### 12-3. 24시간 중복 방지 — `users/{uid}.lastNotifications`

```ts
lastNotifications: {
  morning?: number,                              // 마지막 morning 발송 ms
  evening?: number,                              // 마지막 evening 발송 ms
  priceDrop?:     { [productId]: number },       // 상품별 마지막 푸시 시각
  priceUp?:       { [productId]: number },
  targetReached?: { [productId]: number },
  broadcast?:     { tier10?: number, tier20?: number },
}
```

규칙:
- 발송 직전 `now - lastSent < 24h` 면 해당 productId/tier 스킵
- 합산 알림은 24h 내 알림 받은 productId를 카운트에서 제외 → N=0 되면 푸시 자체 스킵
- target_reached 가드 통과 시 같은 (uid, productId) drop_summary에서 중복 제외 (`targetedSet`)
- flush 끝에서 dotted-path FieldValue update로 사용자당 1회 일괄 반영

### 12-4. 발송 순서 (사이클 끝 flush)

1. `morning_greeting` (시간대 매치 시, 활성 사용자 순회)
2. `target_reached` 상품별 1개씩 (가드 통과한 (uid, productId)는 `targetedSet`에 등록)
3. `price_drop_summary` 사용자당 1개 (drops 비어있으면 skip, target 통과 상품 제외)
4. `price_up_summary` 사용자당 1개
5. `broadcast_drop20` → `broadcast_drop10` (전체 활성 사용자, tier별 24h 별도 가드)
6. `evening_no_change` (시간대 매치 + 그날 가격 알림 (drop/up/target) 미수신자만)
7. `lastNotifications` 일괄 dotted-path update

### 12-5. 메시지 빌드 (notifier.ts)

- 각 type 3개 후보 문구 → `pickRandom()` 매번 다른 문구 (신선도)
- `{N}` placeholder → `fillN()`로 합산 갯수 치환
- `data.screen` 라우팅:
  - `target_reached`, summary items.length===1 → `{screen:'detail', itemId:pid}`
  - summary items.length>1 → `{screen:'home'}`
  - broadcast → `{screen:'price-drops'}`
  - morning/evening → `{screen:'home'}`

### 12-6. 시간대 분기 (KST)

```ts
isMorningTime():  hour >= 7 && hour < 9        // [07:00, 09:00)
isEveningTime():  (hour===19 && minute>=30) || hour===20    // [19:30, 21:00)
```

- cron 진입 시점 1회 체크 — `morningMode` / `eveningMode` 부울 변수
- 한 cron 인스턴스가 두 시간대에 걸치면 진입시각 기준만 발송 (스킵 우선)
- 실제 활성화 시 schedule이 진입 시각 분리 결정 (§8-D-2)

### 12-7. 브로드캐스트 데이터 소스

- **이번 PR 범위 (shared-price-checker)**: shared_products 사이클 중 dropRate ≤ -10% 발생 시 → 메모리 buffer에 누적 → 사이클 끝 발송
- **별도 PR (category-best-updater 측)**: 갱신 시 직전 스냅샷 비교 → 10/20% 하락 감지 → `broadcasts/{id}` 큐 기록 → shared-price-checker가 매 사이클 끝에서 미발송 broadcasts 처리

### 12-8. 파일 (구현 완료, 2026-04-30 ee60516)

- `scripts/shared-price-checker/notifier.ts` — `PushPayload` discriminated union, MESSAGES 상수, buildMessage, sendSmartNotifications
- `scripts/shared-price-checker/index.ts` — 스캔 단계 events 누적, flush 단계 24h 가드 + 합산 + lastNotifications dotted-path update
- `app/_layout.tsx` + `services/notifications.ts` — `resolveNotificationRoute` 헬퍼로 알림 클릭 라우팅 분기 (커밋 `c66489f`)
