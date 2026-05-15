# 022 — 미해결 이슈 트래커

해결되지 않은 이슈와 잠재적 위험 요소만 모아두는 단일 파일. 해결되면 changelog로 이동시키고 여기서 삭제한다.

---

> Issue 1 / Issue 2-A / Issue 2-C는 모두 해결되어 `changelog.md`로 이동. 1.0.16 RealPrice 아키텍처(`docs/023`) 전체 구현 완료로 그래프/알림 출처 불일치 자체가 해소됨.

---

> Issue NEW-A (Android Push Token null)은 1.0.16 google-services Gradle plugin 적용으로 해결되어 changelog(2026-05-12)로 이동.

---

## Issue 3 — 상품 추가 / 가격 조회 실패 (Akamai Bot Manager 챌린지)

**상태 (2026-05-16 갱신)**: **Android는 1.0.17에서 해소 확인** (상품 추가 / 관리자 순회 43개 / 알림 모두 정상). iOS는 1.0.17에서 incognito race로 실패 → 1.0.18 incognito=false fix가 **1.0.19 (bn55/vc55) 빌드에 통합되어 TestFlight 배포 완료** → 베타 검증 진행 중.

**증상 (이력)**:
- 1.0.16: 상품 URL 추가 또는 관리자 모드 가격 조회 시 CoupangScraper 무한로딩 또는 onError. Akamai 챌린지 페이지가 1차 응답
- 1.0.17 Android: 정상화 ✅
- 1.0.17 iOS: 상품 추가 + 상세 새로고침 + 관리자 순회 전체 실패 (5/14 베타) ❌

**근본 원인 (3중 트리거 + iOS race)**:
- (a) IP 봇 분류 — 단시간 다수 호출 / 동시 실행으로 IP reputation 하락
- (b) 쿠팡 로그인 세션 — Akamai BM이 인증 세션을 더 엄격하게 검사 (5/13 갤럭시 베타로 확인)
- (c) 기기 핑거프린트 — UA + canvas + WebGL 단위 차단 (아이패드 5/13 의심)
- (d) **iOS WKWebView nonPersistentDataStore race** — `incognito={true}` 시 Akamai sec_cpt Set-Cookie 응답을 받아도 디스크 영속화 안 되어 같은 인스턴스 reload 사이에 cookie 헤더 누락 가능성. 매 WebView 인스턴스(자동 재시도 포함)마다 새 챌린지 → timeout 누적 → 100% 실패

**1.0.17 fix (Android 검증 완료, iOS는 실패)**:
- `components/CoupangScraper.tsx` SCRAPE_JS: `detectChallenge()` + 30s 재인젝션 + 60s timeout — Android는 챌린지 통과 잘 됨
- UA 풀(iOS/Android 각 4개) + sharedCookies=false + incognito=true + cacheEnabled=false — 양 플랫폼
- admin 3~8s 지터 + 20개 5분 휴식 — 양 플랫폼
- productId fallback URL (`getCoupangProductUrl`) — 양 플랫폼

**1.0.18 fix (1.0.19에 통합 배포 — 2026-05-16 TestFlight + Play Console 등록 완료)**:
- `components/CoupangScraper.tsx`: `incognito={Platform.OS === 'android'}` — iOS만 false로 변경
- iOS는 `incognito=false` + `cacheEnabled=false` + `sharedCookies=false` 조합 → `WKWebsiteDataStore.defaultDataStore` 사용 (앱 프로세스 공유 persistent)
- 효과: 챌린지 1회 통과 후 cookie 영속 → 다음 호출 / 자동 재시도 / 다음 상품 추가 시 cookie 재사용 → 매번 새 챌린지 부담 제거
- 1.0.17 목표(쿠팡 로그인 세션 격리)는 `sharedCookiesEnabled=false`가 그대로 처리 — NSHTTPCookieStorage 동기화 차단은 incognito와 무관

**1.0.19 베타 모니터링 항목** (1.0.18 통합 fix 검증):
- iOS 상품 추가 / 상세 새로고침 / 관리자 순회 정상화 (incognito=false 효과)
- iOS CHALLENGE 60s timeout 0건 목표 — 1회 통과 후 영속 재사용 가정
- Android 회귀 없는지 확인 (incognito=true 유지이므로 정상 예상)
- 양 플랫폼 챌린지 발생 빈도 / UA 분포 / 관리자 완주율
- 1.0.19 추가 모니터링: WebView 제거로 상품 추가 자체는 Akamai 종속 X → 관리자/자동새로고침 경로만 영향

---

## Issue 4 — 1.0.16 검증 잔여 항목

- [x] ~~**검증** 관리자 모드 분배~~ — 2026-05-12 실기기 "담당 ~42 / 전체 84" 정상 확인 (orderBy documentId fix + createdAt 백필 효과). changelog 이동.
- [x] ~~**검증** 가격 그래프 (1A/3 머지)~~ — 2026-05-12 신규/기존 사용자 모두 정상 표시 확인. changelog 이동.
- [x] ~~**검증** Android Push Token null 케이스~~ — 2026-05-12 google-services plugin 적용 후 정상 발급 확인. changelog 이동 (Issue NEW-A 종결).
- [x] ~~**검증** iOS 상품 추가 무한로딩 해소~~ — 1.0.16 4가지 케이스 정상.
- [ ] **검증** RealPrice 트리거(`onSharedProductRealPriceChange`) — token 보유 사용자가 target 도달 시 실제 push 수신 + `lastNotifications.targetReached.{pid}` 가드 박힘 + needsCheck 클리어 (token=YES 케이스 표본)
- [ ] **검증** cron 변경 — `skipRecentRealPrice=N` 카운트 / `[needsCheck]` 마크 / `payloads` target_reached 0건 / lastRealPriceUpdatedAt 1h 가드 효과 (로그 표본 5회 이상)
- [ ] **모니터링** Functions 응답시간 (`minInstances:1` 콜드 스파이크 사라짐, 표본 20회)
- [ ] **확인** category_best.products[0].productUrl raw vs affiliate (Firebase Console)

---

## Issue 5 — 다음 빌드 (1.0.17) 정리

> 2026-05-13~14 5단계 작업으로 다음 항목 모두 완료 — changelog로 이동:
> Akamai 완화 4종(쿠키 자동 초기화 / 지터 3~8s / 20개 휴식 5분 / UA 로테이션) /
> 자동 새로고침 2종(TTL 6h + viewport + 콜드 스타트 sync) /
> 앱 공유 양쪽 링크 / 아이고 productId fallback URL /
> cron 알림 realPrice baseline 전환 / 앱구조 개편(추적중 탭 + 홈 개편 + 한도 20)

### 잔여 — 빌드 검증 후 또는 별도 PR

- [ ] **chore** expo-image 마이그레이션 잔여 사용처 점검
- [ ] **chore** Android proguard 설정
- [ ] **cleanup** cron `events.targets.push` / flush target 분기 정식 삭제 (베타 검증 후)
- [ ] **feat** 크라우드소싱 — 사용자 앱 오픈 시 타인 상품 3~5개 추가 realPrice 업데이트
- [ ] **feat** 관리자 모드 — 3대+ 확장 시 deviceId hash 기반 modulo 분배

---

## Issue 6 — 아이고 이식 작업 (별도 레포 `~/aigo/aigo`)

- [ ] **port** 지금이야 1.0.12~1.0.15 변경 일괄 이식 — 상세 항목은 `~/aigo/aigo/docs/021_Jigumiya_Migration.md` 참조 (5/8 신설)

---

## Issue 7 — 누적 미완 (이전부터)

- [ ] **검증** 뱃지 카운트 0 초기화 — 다음 푸시 수신 후 foreground 전환 시 뱃지 제거 확인
- [ ] **검증** 파트너스 실적 — 가족 계정 구매 테스트 + 대시보드 집계
- [ ] **합의** Firebase 공유 구조 — 아이고 베타 출시 이후
- [ ] **이식** 아이고 Functions에 동일 수정 (HTML redirectWebUrl + Secret `.trim()`)
- [ ] **수정** 아이고 알림 버그 + 계정 삭제 버그
- [ ] **검증** 앱 측 price-drops 탭 라우팅 (`router.push('/price-drops')` expo-router 동작)
- [ ] **검토** Firebase App Check 활성화 (Public repo 환경 보강)
- [ ] **대기** 쿠팡 파트너스 문의 답변 (`bestcategories` 카운팅 방식)
- [ ] **별도 작업** 아이고 cron 활성화 (`~/aigo/aigo` 레포)
- [ ] **추적** `addTrackedItem`/`removeTrackedItem` increment 비대칭 (재발 모니터링)
- [ ] **별도 PR** `meta/stats.sharedProductCount` 자동 갱신 (FieldValue.increment)
- [ ] 메인 화면에 쿠팡 이동 버튼 추가 (위치/형태 미정)

---

## Issue 9 — 1.0.19 (가격 상태 머신 + 상품 추가 WebView 제거)

**상태 (2026-05-16 갱신)**: 🔨 §1~§5 코드 + 빌드(bn55/vc55) + 베타 배포(TestFlight + Play Console 내부 테스트) 완료. **베타 시나리오 6종 검증 진행 중**. 상세 [docs/025_PriceStateMachine.md](./025_PriceStateMachine.md).

**배경**:
- 1.0.16 RealPrice 아키텍처(`docs/023`) 이후에도 상품 추가 시 WebView로 realPrice를 동기 수집 → Akamai 챌린지/iOS race로 추가 자체 실패 (1.0.17 iOS)
- 첫 realPrice 수신을 변동으로 오탐 → 상세페이지 "가격 하락 감지" 오표시 + false positive 알림
- cron(apiPrice)/CF 트리거(realPrice) baseline 불일치로 알림 가드 일관성 부재

**완료 항목 (커밋 `9c57cbc` §1, `5d8727b` §2, `2886f52` §2 보완, `6d38776` §3~§5, `10a8968` version bump)**:

### 1순위 — 상품 추가 UX 개선 (WebView 제거) ✅
- [x] `app/modal/add-item.tsx` `CoupangScraper` 의존 완전 제거 — `'url' → 'resolving' → 'target'` 흐름
- [x] Functions `resolveAndGenerateAffiliateUrl` 응답 스키마 확장 — `productName/productImage/apiPrice` 포함, vp HTML OG 태그 정규식 파싱 (5s timeout, Akamai 챌린지 감지 시 빈 결과)
- [x] `callDeeplinkApi` + `fetchVpMetadata` Promise.all 병렬화

### 2순위 — 가격 상태 머신 도입 ✅
- [x] `shared_products` + `TrackedItem`에 `priceStatus` / `firstRealPriceAt` / `trackingStartedAt` 추가
- [x] realPrice write 경로 priceStatus 전이 — store `updateItemPrice` + `adminUpdateRealPrice`
- [x] cron + CF 트리거 priceStatus !== 'TRACKING' 알림 가드 + cron priceHistory 누적 가드
- [x] 상세페이지 INIT/SYNCING/TRACKING별 그래프/배지 분기, "(예상)" 라벨, statusText 분기
- [x] `syncFromFirestore` priceStatus 머지(TRACKING > SYNCING > INIT)
- [x] cron `prevRealPrice <= 0` apiPrice fallback baseline 차단

### 3순위 — 홈 화면 여백 ✅
- [x] `app/(tabs)/index.tsx` ScrollView `contentContainerStyle.flexGrow: 1`

### 4순위 — 관리자 모드 순회 옵션 ✅
- [x] `app/admin.tsx` 분배 모드 chip (auto/odd/even/all) + AsyncStorage `admin.distributionMode` 영속
- [x] 동적 라벨 / myProducts useMemo / 순회 중 chip 비활성

### 5순위 — 모니터링 (부분 완료) 🔨
- [x] `app/detail/[id].tsx` "N시간 전 업데이트" — `getSharedProduct(productId)` mount + currentPrice 변경 시 재조회, 6h 이상 노란색 + ⚠️
- [ ] `price_update_logs` 컬렉션 통계 (attempted/succeeded/challengeFailed/domFailed/avgDurationMs) — 베타 검증 후 별도 PR

### 알림 푸시 구조 확정 ✅
- [x] cron + CF 트리거 모두 `priceStatus === 'TRACKING'` 가드
- [x] apiPrice fallback baseline 차단 (`prevRealPrice <= 0`)
- [ ] legacy `morning`/`evening`/`broadcast_drop10/20` 정식 삭제 — 베타 검증 후

**베타 배포 (2026-05-16)**:
- iOS: TestFlight 업로드 완료 (`~/jigumiya/builds/ios/jigumiya-1.0.19-55.ipa`)
- Android: Play Console 내부 테스트 등록 완료 (`~/jigumiya/builds/android/jigumiya-1.0.19-55.aab`)
- 출시노트 작성 완료

**잔여 항목 (베타 검증 후)**:

### 베타 검증 시나리오 6종 (진행 중)
- [ ] **시나리오 1** 신규 상품 추가 → Firestore `shared_products/{pid}.priceStatus === 'INIT'` 확인 + 그래프 미표시 + 현재가 "(예상)" 라벨 노출 + 추가 소요 ≤2s
- [ ] **시나리오 2** 첫 realPrice 수신 (cron 또는 사용자 수동 새로고침) → `SYNCING` 전이 + `firstRealPriceAt` 기록 + 그래프 1점 + 알림 미발송 + 상세 "현재가 X원 / 최저가 도달 시 알림이 시작됩니다"
- [ ] **시나리오 3** 두 번째 realPrice 수신 → `TRACKING` 전이 + `trackingStartedAt` 기록 + 알림 미발송 (baseline 변동 X)
- [ ] **시나리오 4** 세 번째+ realPrice (≥10% 하락 또는 lowest 갱신) → 가격 하락 알림 발송 + `lastNotifications.priceDrop[pid]` 가드 박힘
- [ ] **시나리오 5** 목표가 도달 → CF 트리거 알림 발송 + `lastNotifications.targetReached[pid]` 박힘 + `needsCheck` 클리어 + 24h 가드 효과
- [ ] **시나리오 6** 상세 "N시간 전 업데이트" 정확 표시 + 6h 이상 노란색 ⚠️ + 관리자 분배 chip 4종(자동/홀수/짝수/전체) 동작 + 순회 중 chip 비활성

### 베타 통과 후 정식 출시 + 후속
- [ ] **release** 양 스토어 정식 출시 + `meta/config_jigumiya.minRequiredVersion = "1.0.19"` 갱신
- [ ] **migration** `scripts/migration/2026-05-priceStatus-backfill.mjs` 작성 + dry-run + 실행 (기존 ~93개 문서)
- [ ] **chore** cron priceHistory에 apiPrice 누적되던 잔여 케이스 완전 정리 (TRACKING 가드 적용 후 잔존 여부 검증)
- [ ] **feat** price_update_logs 통계 wire (5순위 잔여)
- [ ] **cleanup** legacy 알림 종류 코드 정식 삭제

**진입 조건**: ~~1.0.18 베타 검증 통과~~ → 1.0.18+1.0.19 통합 빌드로 진행 (bn55/vc55). 베타 검증 통과 시 정식 출시.

> ⚠️ **방향 전환 (2026-05-16)**: 1.0.19 베타 운영 중 Functions OG 파싱이 Akamai에 막혀 이미지/가격 누락 빈발 → realPrice 자체를 폐기하는 [docs/026](./026_ApiPriceOnly_Redesign.md) 채택. Issue 9의 priceStatus 머신 / WebView / 관리자 순회 / CF 트리거는 **bn57에서 전부 제거 예정**. Issue 10 참조.

---

## Issue 10 — 1.0.20 통합 빌드 (apiPrice 단일 출처 전환)

**상태 (2026-05-16 갱신)**: 📋 설계 확정, 작업 13종 중 P1/P2 선반영 완료. bn56/bn57 분리 계획 취소 후 **1.0.20 (bn56/vc56) 단일 통합 빌드로 진행**. 상세 [docs/026_ApiPriceOnly_Redesign.md](./026_ApiPriceOnly_Redesign.md).

**배경**:
- 1.0.16~1.0.19에 걸쳐 도입한 realPrice(WebView 스크래핑) 방식이 Akamai Bot Manager로 인해 구조적으로 불안정
- 1.0.19 §1에서 상품 추가 경로의 WebView를 Functions OG 파싱으로 우회했으나 Functions IP 풀도 Akamai에 봇 분류되어 이미지/가격 누락 빈발
- 관리자 기기 순회 운영 부담 (안드로이드 + 아이패드 상시 + 차단 시 대기)
- dual-price(apiPrice + realPrice) 정합성 관리 복잡도 (priceStatus 머신 / sync race / 마이그레이션 부채)

**결정**: realPrice 개념 완전 제거 → apiPrice 단일 출처(쿠팡 파트너스 API)로 전환. "기준가격" + "실제 결제가는 쿠팡에서 확인" 안내로 정직하게 운영. 분리 빌드 비용/리스크 대비 통합 빌드가 유리해 1.0.20 단일 출시.

### 1.0.20 작업 13종

#### 선반영 (1.0.19 베타 hot-patch, 커밋 `0b029b4`)
- [x] **1. P1 saveItemToFirestore await** — store/useAppStore.ts addItem에서 await 추가. syncFromFirestore race 차단
- [x] **2. P2 ProductCard priceStatus 분기** — INIT "추적 준비 중" 회색 + trendBadge 자동 null 가드

#### 1.0.20 통합 작업
- [ ] **3. searchProducts fallback** — `app/modal/add-item.tsx resolveFromUrl`에서 Functions 메타 빈값 시 `services/coupangApi.ts searchProducts(keyword, 5)` → productId 정확 매칭 → productImage / productPrice / productName 채움. 이미지 표시율 80%+ 목표
- [ ] **4. 홈 화면 여백 재확인** — `app/(tabs)/index.tsx` 1.0.19 §3 `flexGrow:1` 효과 검증 + 필요 시 추가 조정
- [ ] **5. 관리자 모드 통계 대시보드** — `app/admin.tsx`를 순회 기능에서 통계 화면으로 전환 (추적상품수 / 가격변동 통계 / 알림발송 통계 / 사용자수). docs/026 §8 Option B 채택
- [ ] **6. realPrice 완전 제거** — `types/index.ts` SharedProduct/TrackedItem에서 `realPrice` / `lastRealPriceUpdatedAt` / `needsCheck` / `priceStatus` / `firstRealPriceAt` / `trackingStartedAt` / `lastWebViewCheckedAt` 필드 삭제. `store/useAppStore.ts updateItemPrice` / `markChecked` / `syncFromFirestore priceStatus 머지` 삭제
- [ ] **7. apiPrice 단일 출처 + "기준가격" 라벨** — ProductCard / 상세 hero / add-item target / 목표가 입력 placeholder / 추천 목표가 / 안내 문구 6개 위치 + "실제 결제가는 쿠팡에서 확인하세요" 안내. docs/026 §3 참조
- [ ] **8. CoupangScraper / PriceChecker 컴포넌트 제거** — `components/CoupangScraper.tsx` + `components/PriceChecker.tsx` 파일 삭제 + admin/detail/홈 인덱스에서 import / 렌더 / 새로고침 버튼 제거
- [ ] **9. 관리자 순회 기능 제거** — `services/firebase.ts adminUpdateRealPrice` 삭제 + admin.tsx의 분배 모드 chip / 순회 시작·정지 / 자동 반복 / nextRunAt 카운트다운 / 배치 휴식 전체 제거 (통계 화면 #5와 동시 적용)
- [ ] **10. priceStatus 머신 제거** — 전이 로직 + UI 분기 전부 삭제 (#6과 통합 작업)
- [ ] **11. trackerCount=0 자동 삭제** — `store/useAppStore.ts removeItem` + 신규 `services/firebase.ts deleteSharedIfOrphan` 헬퍼. `favoriteCount=0` 가드 + `priceHistory.length` 보존 정책 결정 필요
- [ ] **12. 알림 메시지 템플릿** — `scripts/shared-price-checker/notifier.ts`에 "기준가격이 내렸어요" / "목표 기준가격 도달" / "기준가격이 올랐어요" 적용. cron `index.ts` realPrice baseline 분기 + priceStatus 가드 삭제 + `events.targets` 발송 부활. legacy `morning`/`evening`/`broadcast_drop10/20` 정식 삭제. CF `functions/src/index.ts onSharedProductRealPriceChange` 트리거 deploy 해제 + 코드 삭제
- [ ] **13. 마이그레이션 스크립트** — `scripts/migration/2026-05-realPrice-cleanup.mjs` 작성 + dry-run + 실행. 기존 ~93개 shared_products에서 realPrice 관련 필드 unset + `currentPrice` ← `apiPrice ?? realPrice ?? currentPrice` 정합 + `trackerCount=0 && favoriteCount=0` 일괄 삭제

### 결정 필요 항목
- [x] 관리자 모드 처리 — **Option B(통계 전용 축소) 채택** (#5)
- [ ] `favoriteCount=0` 추가 가드 (자주사는 미사용 상품 보호) — #11
- [ ] `priceHistory.length` 보존 가드 (가치 있는 시계열 보존) — #11

### 1.0.20 빌드 + 배포 시퀀스
- [ ] 버전 bump (app.config.js + android/app/build.gradle: 1.0.20 / bn56 / vc56)
- [ ] `eas build --local --profile production --platform ios` / `--platform android`
- [ ] TestFlight + Play Console 내부 테스트 배포
- [ ] 베타 검증 8종 시나리오 (docs/026 §검증 계획)
- [ ] 통과 시 양 스토어 정식 출시 + `meta/config_jigumiya.minRequiredVersion = "1.0.20"` 갱신

### 검증 시나리오 (1.0.20 베타)
1. 신규 추가 ≤2s + "기준가격 X원" 표시
2. 첫 cron 갱신 후 그래프 1점 추가
3. 두 번째 갱신 후 정상 LineChart
4. 가격 하락 알림 — "기준가격이 내렸어요 ... 실제 결제가는 쿠팡에서 확인하세요"
5. 목표가 도달 알림 — cron 발송 (CF 트리거 X)
6. trackerCount=0 자동 삭제 + 재추가 시 새 priceHistory 시작
7. 상세 라벨 + 안내 문구
8. WebView 잔재 0 (관리자/상세/PriceChecker/admin) + 관리자 모드는 통계 화면으로만 동작

### 폐기되는 설계 문서
- [docs/023_RealPrice_Architecture.md](./023_RealPrice_Architecture.md) — dual-price 분리, docs/026로 대체
- [docs/025_PriceStateMachine.md](./025_PriceStateMachine.md) — priceStatus 머신, docs/026로 폐기

---

## Issue 8 — shared_products 컬렉션에 아이고 상품 혼재

**상태**: 신규 발견 (2026-05-12). 아이고 이식 작업(Issue 6) 시 별도 처리.

**증상**: `shared_products` 컬렉션에 아이고 앱 사용자가 추가한 상품 10개 혼재. cron 가격 체크는 무차별 진행되지만 알림 발송은 `users.app === 'jigumiya'` 필터로 분리되어 잘못 알림은 안 가는 상태.

**위험**:
- 관리자 모드 순회 대상에 아이고 상품도 포함 → 불필요한 쿠팡 API/WebView 호출 + 분배 인덱스 변동
- 1.0.16 관리자 모드 "전체 84개"에 아이고 상품 ~10개 포함된 수치
- 향후 아이고 이식 시 명시적 분리 필요

**해결 방향 (Issue 6 아이고 이식 트랙)**:
- `shared_products` 문서에 `app: 'jigumiya' | 'aigo'` 또는 `apps: string[]` 필드 추가
- `fetchAllSharedProducts` (관리자 모드) + cron 모두 app 필터 적용
- 또는 컬렉션 분리 (`shared_products_jigumiya` / `shared_products_aigo`)

---

## 운영 주의사항

### iOS 1.0.17 — 상품 추가 / 새로고침 / 관리자 순회 전체 실패 (2026-05-14 발견 → 1.0.19로 fix 배포 2026-05-16)

**증상**: iOS 1.0.17 (bn53/vc53) 베타에서 상품 추가 + 상세 새로고침 + 관리자 순회 모두 실패.

**원인**: `incognito={true}` + WKWebView `nonPersistentDataStore` 조합에서 Akamai sec_cpt Set-Cookie 응답이 디스크에 영속화되지 않음. 같은 인스턴스 reload 사이에 cookie 헤더 누락 가능성(WKWebView 알려진 race) + 매 WebView 인스턴스마다 새 dataStore라 자동 재시도 시 매번 새 챌린지 → timeout 누적 → 100% 실패.

**fix (1.0.18 → 1.0.19에 통합 배포, 2026-05-16)**: `CoupangScraper.tsx` `incognito={Platform.OS === 'android'}` — iOS만 false. `defaultDataStore` 사용으로 챌린지 1회 통과 후 영속 재사용. `sharedCookiesEnabled=false`로 NSHTTPCookieStorage 격리는 그대로(쿠팡 앱 로그인 세션 차단). 추가로 1.0.19 §1에서 상품 추가 자체가 WebView를 사용 안 함 → Akamai 종속 X.

**운영 가이드 (1.0.19 배포 전 기간 참고용)**:
- iOS는 1.0.16 ipa로 유지 권장
- Android 1.0.17은 정상 작동 — 베타 계속

### 관리자 모드 — 쿠팡 로그아웃 (1.0.17 Android 이상 자동화)

**과거 (1.0.16 이하)**: 쿠팡 로그인 상태에서 관리자 순회 시 Akamai BM 차단 임계 ↓. 갤럭시 5/13 베타에서 로그인 = 실패 / 로그아웃 = 성공 확인.

**1.0.17 이상**: `sharedCookiesEnabled=false`로 NSHTTPCookieStorage 동기화 차단 → 쿠팡 앱 로그인 세션이 WebView로 흘러들지 않음. 사용자가 쿠팡 앱에 로그인되어 있어도 무관. Android 1.0.17에서 정상 동작 검증 완료.

### 관리자 모드 — 기기 핑거프린트 단위 차단 (2026-05-13 추가)

**증상**: 아이패드는 쿠팡 로그아웃 상태 + 다른 IP에서도 추가/순회 실패. 갤럭시는 같은 조건에서 성공.

**원인 추정**: Akamai의 기기 핑거프린트(UA + canvas + WebGL + WebView 빌드) 단위 차단. IP/세션 회복돼도 핑거프린트 자체가 블랙리스트화되면 즉시 차단됨.

**운영 가이드**:
- 차단 의심 기기는 시간 경과 후 재시도 (Akamai TTL 자체 해제 대기, 통상 수 시간~1일)
- 즉시 복구 필요 시 다른 단말 사용
- 1.0.17 UA 로테이션 + 1.0.18 default dataStore로 핑거프린트 변동성/cookie 영속 확보. 효과 검증 진행 중

### 관리자 모드 — 같은 Wi-Fi에서 두 기기 동시 실행 금지

**증상**: 동일 공인 IP에서 두 관리자 기기(Android + iPad)가 동시 WebView 호출 시 쿠팡 IP 차단 발생. 모든 상품 추가/새로고침 1시간가량 실패.

**원인**: 쿠팡은 단시간 다수 동일 IP 트래픽을 봇으로 판정. 두 기기가 각자 30~40개 상품을 sequential하게 처리(상품당 3~5초) → 분당 12~24회 호출 × 2 = 24~48회/분 → 차단 임계 초과.

**운영 가이드**:
- 한 기기씩 순차 실행 (다른 기기는 대기시간 중)
- **두 기기 운영 시 네트워크 분리 유지** (한 대는 Wi-Fi, 다른 한 대는 LTE — 공인 IP 분산)
- 대기시간 30분 이상 설정 권장 (현재 admin UI: 10/15/30/60/120분 chip)
- 3대+ 확장 시(Issue 5 1.0.17) deviceId hash modulo + 시간차 staggered 호출 검토

---

## 운영 정책

- 이슈가 해결되면 이 파일에서 삭제하고 `docs/changelog.md` 상단에 해결 내용을 기록
- 새로 발견된 이슈는 이 파일에 추가 (CLAUDE.md에 직접 쓰지 않음)
- CLAUDE.md는 미해결 이슈를 1줄 요약 + 이 문서 링크로만 표시
