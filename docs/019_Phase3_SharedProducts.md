---
created: 2026-04-26
updated: 2026-04-26
status: §8-A 구현 완료 + §8-B 통합 완료 + 1.0.6 배포 / §8-C(아이고 Firebase 통합) 대기
선행: 017_앱구조개편_Phase3.md (Phase 3-A/3-D 완료), 018_FirebaseFunctions_Resolver.md
---

# 019. Phase 3 — SharedProducts + 카테고리 베스트 통합 설계

> 본 문서는 017 §2 `shared_products` 스키마를 **확장**한다.
> 핵심 추가: ① 카테고리 베스트 컬렉션 `category_best`, ② 지금이야/아이고 Firebase 프로젝트 통합, ③ 단일 cron(지금이야 레포)으로 양 앱 공통 데이터 갱신.

## 구현 진행 (2026-04-26)

| 단계 | 상태 | 비고 |
|------|------|------|
| §8-A 카테고리 베스트 단독 구현 | ✅ 완료 | 19개 × 50개 = 950개 상품, cron 02:00 KST sleep 80초, feed 탭 UI 교체 (커밋 `833805d`, `9a13363`, `18abcb0`) |
| §8-B shared_products 중복 제거 | ✅ 완료 | `category-best-cache.ts` 신설, 6시간 신선도 + 30% 변동 가드 (커밋 `833805d`) |
| 가격변동 탭 + price_drops 컬렉션 | ✅ 완료 | 4탭 구조 전환, 필터 칩, 하락률 뱃지, `recordPriceDrop` 로직 (커밋 `f8b88e9`) |
| 1.0.6 (bn40/vc40) 배포 | ✅ 완료 | iOS App Store 심사 제출 + Android 프로덕션 승급 (커밋 `986acaf`) |
| §8-C 아이고 Firebase 통합 | ⏸ 대기 | 아이고 베타 출시 이후 진행 합의 |
| §8-D cron 재활성화 | ⏸ 대기 | 아이고 통합 + 파트너스 문의 답변 후 |
| `category-best-update.yml` 낮 2회 보조 업데이트 | ⏸ 대기 | 현재 02:00 KST 1회만 |

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

### 5-2. shared_products 가격 체크 (확정)
- **실행 시간**: 매일 **04:30 ~ 01:00 KST** (총 20.5시간)
- **호출 속도**: 분당 **최대 40회** (공식 한도 50회 대비 80% 마진)
- **방식**: `shared_products` 컬렉션 **순번 기준 순차 호출** (FIFO)
- **당일 신규 추가 상품**: **다음날 회차부터 체크 대상 편입** (당일 진행 중 회차에는 미포함)
- `category_best` 중복 productId는 캐시(§8-B) 재사용 → API 재호출 제외
- 상품당 1회 검색 (2026-04-24 재시도 루프 제거 정책 유지)
- **rate-limited(429) 감지 시 즉시 중단, 당일 재실행 없음** — 낮 보조 회차 폐기 원칙(§4-1 비고)

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

### 8-D. cron 재활성화 (Phase 3 완료 후) — ⏸ 대기
- 선결: §8-C 아이고 통합 + 쿠팡 파트너스 문의 답변(`bestcategories` 호출 카운팅 방식)
- 확정 스케줄(§4-1) 적용
- 기존 지금이야/아이고 개별 cron 폐기 확인

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
