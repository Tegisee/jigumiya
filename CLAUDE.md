# 지금이야 (Jigumiya) - 메인 컨텍스트

## 중요: 새 대화창 시작 방법
docs/000_MD_사용법.md 와 이 파일을 먼저 읽을 것.
작업할 항목의 sub MD도 함께 읽고 시작할 것.
2026-04-30 이전 작업 이력은 docs/작업이력_archive.md 참조.

## 작업 리스트

### Phase 1 (MVP)
| 번호 | 작업 | 상태 | sub MD |
|------|------|------|--------|
| 001 | 프로젝트 초기화 + 패키지 설치 | ✅ | 001_프로젝트개요.md |
| 002 | 기술스택 + 폴더구조 세팅 | ✅ | 002_기술스택.md |
| 003 | 디자인시스템 + UI 구현 (메인/설정/모달/상세) | ✅ | 003_디자인시스템.md |
| 004 | 수익모델 확정 (쿠팡 파트너스 단일) | ✅ | 004_수익모델.md |
| 005 | UX 플로우 확정 | ✅ | 005_UX플로우.md |
| 006 | 알림 전략 확정 | ✅ | 006_알림전략.md |
| 007 | 데이터 저장 구조 구현 | ✅ | 007_데이터저장구조.md |
| 008 | Share Intent 연동 | ✅ | 008_ShareIntent.md |
| 009 | Firebase 연동 | ✅ | 009_Firebase.md |
| 010 | 상품 정보 스크래핑 (WebView) | ✅ | 010_쿠팡파트너스API.md |
| 011 | EAS 빌드 + 실기기 테스트 | ✅ | 011_EAS빌드_배포.md |

### Phase 2 (가격 추적 + 알림)
| 번호 | 작업 | 상태 | sub MD |
|------|------|------|--------|
| 012 | FCM 푸시 알림 + 가격 체크 봇 | ✅ | 012_FCM푸시알림.md |
| 013 | 쿠팡 파트너스 API 연동 | ✅ | (010, 012에 통합 — 별도 MD 없음) |

### Phase 2.5 (버그 수정 + 개선)
| 번호 | 작업 | 상태 | sub MD |
|------|------|------|--------|
| 015 | 버그 수정 및 개선 | 🔄 | 015_Phase2.5_버그수정_및_개선.md |
| 016 | AppStore 메타데이터 | ✅ | 016_AppStore_메타데이터.md |

### Phase 3 (앱 구조 개편)
| 번호 | 작업 | 상태 | sub MD |
|------|------|------|--------|
| 017 | 앱 구조 개편 (3탭 + shared_products + 피드) | 🔄 3-D MVP 완료 (2026-04-19) | 017_앱구조개편_Phase3.md |
| 018 | Firebase Functions 파트너스 링크 Resolver | ✅ 실기기 검증 완료 (2026-04-24) | 018_FirebaseFunctions_Resolver.md |
| 019 | SharedProducts + 카테고리 베스트 통합 설계 | 🔄 §8-A/§8-B/§5-2 완료, §8-C 대기 | 019_Phase3_SharedProducts.md |

## 진행 경과 요약 (이력 archive: docs/작업이력_archive.md)

- **Phase 3-A/D MVP** (2026-04-18~19): shared_products 이중 쓰기 + 3탭/자주사는/스와이프 삭제/10개 제한
- **018 Functions Resolver** (2026-04-21~24): `resolveAndGenerateAffiliateUrl` 배포 + 3대 버그 수정 + 1.0.5 배포
- **Rate Limit 사고 + 재시도 루프 제거** (2026-04-24): 분당 ~110회 burst → 재시도 루프 제거(`46c20e5`/`840f1ea`)로 -41%
- **019 §8-A/§8-B + 1.0.6 배포** (2026-04-26): category_best 950 상품 + 캐시 + 가격변동 탭 신설(4탭 구조)
- **firestore.rules CLI 배포 전환** (2026-04-27): jigumiya 레포가 단일 소스, 콘솔 직접 편집 금지
- **shared-price-checker cron 신설** (2026-04-27, `62448cc`): scripts/shared-price-checker/ 7파일 + collectionGroup `tracked.productId` 인덱스
- **앱 업데이트 알림 기능** (2026-04-27, `3a5bbc3`): `services/updateChecker.ts` + `meta/config_jigumiya`
- **2026-04-30 종합** (1.0.7 빌드): BUG-42 무한로딩 방어(`5c0b5da`) + 알림 7종 시스템(`ee60516`) + 동적 사이클(`b625f07`) + 알림 라우팅(`c66489f`) + 두 레포 Public 전환

### 2026-05-01 작업 (오늘의 특가 + 하트 fix + 1.0.8 빌드/배포 + cron 활성화)

① **골드박스 → 오늘의 특가 데이터 교체** (커밋 `dd15624`)
- 폐기: `services/coupangApi.ts:fetchGoldbox` + `GOLDBOX_PATH` + `GoldboxProduct` 통째로 제거
- 신규 데이터 출처: ① `subscribePriceDrops(cb, 30, 24)` — 24h, 최대 30개. `dropRate asc` 정렬 → 상위 20개. ② `fetchAllCategoryBest()` 1h AsyncStorage 캐시(`home-deals-best-pool`, 카테고리당 5개 = 95개 후보) — drops 부족분만 채움. productId Set으로 중복 회피
- 빈 상태: 안내 텍스트 "아직 가격 변동 데이터가 부족해요. 가격이 내려가면 바로 알려드릴게요!"
- 클릭: drop은 `deepLink` 직링크, best는 `generateDeepLink(productUrl)` — affiliate 변환 보장

② **하트 버튼 누락 fix + productId 자가 치유** (커밋 `dd15624`)
- 원인: `add-item.tsx:handleSave`의 `extractIds(resolvedUrl)` 정규식 `\/products\/(\d+)` 단일 패턴 → `link.coupang.com/a/...` 단축 URL이 resolve 실패 시 productId 추출 0% → trackedItem `productId=undefined` → `useFavoriteToggle.enabled=false`로 하트 렌더 안 됨
- **추출 정규식 보강** (`services/coupangApi.ts:extractProductId`): `/products/(\d+)` + `productId=(\d+)` + `pId%3D(\d+)` + `pId=(\d+)` 다중 패턴. `extractVendorItemId` 신설
- **다중 URL 후보 시도** (`add-item.tsx:extractIds`): `scraped?.resolvedUrl` → `resolvedUrl` → `affiliateUrl` → `parsedUrlRef.current` 순서
- **자가 치유 액션** (`store/useAppStore.ts:backfillProductIds`): productId 누락 항목을 `resolvedUrl`/`url`에서 재추출 → store + Firestore 갱신. 홈 mount + `syncFromFirestore` 직후 1회 자동 호출
- 한계: 모든 후보가 단축 URL인 극단 케이스는 여전히 추출 불가

③ **1.0.8 (bn42/vc42) 빌드 + 배포 완료**
- iOS App Store: Transporter 업로드 + 심사 제출 완료
- Android Play Console: 프로덕션 업로드 완료
- 1.0.7은 미배포 — 1.0.8에 모든 변경 통합

④ **shared-price-check.yml cron 활성화** (커밋 `46ccb4c`)
- `'30 19 * * *'` (= 04:30 KST) schedule 주석 해제 → 매일 1회 자동 실행
- 호출량 (N=37 기준): 분당 ~4.33회 = 검색 한도 50/분의 8.7%, sleep 하한 1500ms로 분당 절대 40회 상한

⑤ **N=0 자가 치유 + Block zone graceful exit** (커밋 `c0d8859`)
- 문제 1 (N=0): `computeCycleConfig`가 `meta/stats.sharedProductCount`만 read, 카운터 자동 갱신 미구현 → 실제 35개 무시
  - 해결: `computeCycleConfig(actualCount)` 시그니처 변경 — `shared_products` 풀 fetch 길이를 진실 원천으로. `meta/stats`는 `lastCheckedOffset`만 read
- 문제 2 (Block zone 81.8분 sleep 빌링 낭비): workflow_dispatch가 [01:00, 04:30) KST 내부에서 트리거되면 04:30까지 sleep
  - 해결: `main` 진입 직후 Block zone 체크 → 즉시 graceful return. 사이클 진행 중 진입은 기존 동작(04:30까지 sleep + offset 보존) 유지

⑥ **cron 첫 자동 실행 분석 (2026-05-01 05:41 KST, run 25188247734)**
- 카운터: `scanned=35 processed=35 skipZero=11 cacheHits=1 apiCalls=21 drops=2 ups=0 targets=0 notif=0 rateLimited=false elapsed=331.0s`
- GitHub 71분 지연 (정상 범위) — 04:30 예정 → 05:41 시작
- 동적 사이클 정상: `[Cycle] N=35 daily=35 cycles=144 sleep=14642ms offset=0~34 split=false`
- 가격 하락 2건 감지 (price_drops 컬렉션 정상 기록): productId 6570687310 -0.7%, 9080722281 -0.8%
- **🚨 푸시 발송 0건 — 3가지 문제 발견**:
  - **문제 1: cron 04:30 단일 실행 → morning/evening 윈도우 진입 불가** — 실행 KST 05:41 → `morning=false evening=false`. `morning_greeting`/`evening_no_change` 트리거 영원히 0. 즉시 발송형(drop_summary/target/up_summary/broadcast)은 시간대 게이트 없음 (정상)
    - 해결책 (옵션 A): 알림 전용 cron 2개 추가 (07:30 / 20:00 KST) — `shared-price-check.yml`에 schedule 추가 또는 `notify-only.yml` 신설
  - **문제 2: `tracked.productId` 누락으로 사용자 추적상품 알림 발송 0건** — `index.ts:512` `fetchTrackers(productId)` = `collectionGroup('tracked').where('productId', '==', productId)`. tracked 문서에 `productId` 필드 누락 시 매칭 0건 → trackers=[] → payloads 0
    - 1.0.8 클라이언트 `backfillProductIds`는 추가됐지만, 미업그레이드 사용자(1.0.7 이하) + 단축 URL resolve 실패 누락분은 서버 backfill 필요
  - **문제 3: `shared_products.trackerCount` 음수 버그** — 6570687310 로그 `trackers=-1`. addTrackedItem(+1)/removeTrackedItem(-1) 분기 비대칭 의심

### 2026-05-02 작업 (notif=0 사고 직접 해결 + cron 자동화 + docs/020)

① **tracked-backfill 스크립트 신설 + 1회 실행 완료** (커밋 `08009b3`)
- `scripts/tracked-backfill/` 신설 (4파일 + workflow): index.ts / utils.ts / package.json / tsconfig.json + `.github/workflows/tracked-backfill.yml`
- 3단계 backfill 설계:
  - Phase A: `users/{uid}/items/*` 스캔 → productId 누락 문서를 `resolvedUrl`/`url`/`affiliateUrl` 다중 후보 + `extractProductId` 4패턴(/products/, productId=, pId%3D, pId=)으로 재추출 → ① items doc 보강 ② `users/{uid}/tracked/{productId}` doc 생성
  - Phase B: `collectionGroup('tracked')` 스캔 → productId 필드 누락 문서를 doc ID로 보강 (addTrackedRef 규약: doc ID = productId)
  - Phase C: touched productId마다 `collectionGroup` 실측 카운트로 `shared_products.trackerCount` 정정 (음수/불일치 보정)
- DRY_RUN=true 기본값 (workflow_dispatch choice input) — 안전 사전검증 후 `dry_run=false`로 실제 적용
- **실행 결과**: productId 누락 5건 보강 완료. `shared_products.trackerCount` 음수/불일치 정정. 다음 cron 실행에서 `trackers=` 양수 확인 대기

② **notify-only.yml 신설 — 알림 전용 cron 2개** (커밋 `0bdc445`)
- 설계 옵션 A 채택: `morning_greeting`/`evening_no_change` 시간대 윈도우 진입 보장
- `.github/workflows/notify-only.yml`: `'30 22 * * *'` (= 07:30 KST) + `'0 11 * * *'` (= 20:00 KST), timeout 15분
- `scripts/shared-price-checker/index.ts`: `NOTIFY_ONLY=true` env 분기 추가
  - `loadDropsForNotifyOnly()` 신설 — `price_drops` 24h 컬렉션 조회 → productId별 dedup → events.drops/targets/broadcast 재구성
  - 가격 스캔 + Cycle 산출 + Block zone 가드 모두 스킵 (가격체크 모드 전용)
  - flush 단계 그대로 실행 → morning_greeting / evening_no_change / 누적 drop_summary 발송
  - 24h 가드(`lastNotifications`) 두 cron 자연 공유 → 중복 발송 없음
- 효과: 04:30 새벽에 발송되던 drop_summary가 morning(07-09 KST) / evening(19:30-21 KST) 시간대로 미뤄짐 (UX 개선)
- 04:30 cron(가격체크)은 무수정 — 가격 스캔만 담당

③ **shared-price-check.yml 10분 고정 cron + §11 N값 기반 자동화** (커밋 `b49ea2e`)
- docs/020 §11 B안 구현: yml은 10분 고정 트리거, 코드가 매 invocation마다 N값 읽고 §3 매트릭스 기준 최적 간격 결정
- yml schedule: `'30 19 * * *'` (04:30 KST) → `'*/10 * * * *'` (10분 고정, 가장 짧은 간격의 공약수)
- index.ts 신규 컴포넌트:
  - `INTERVAL_MATRIX` 12단계: N≤400→10분, N≤600→15분, N≤800→20분, N≤1200→30분, N≤1800→45분, ..., N≤13200→330분, N>13200→330분 fallback
  - `lookupBaseInterval(n)` / `isPeakHour(hour)` / `computeEffectiveInterval(n, hour)` — 피크(07-22 KST) base 그대로, 비피크 ×2
  - `readLastRunAt()` / `writeLastRunAt(at)` — `meta/stats.lastRunAt` 단일 read/write
  - `countSharedProducts()` — count() 어그리게이트로 사전판정 비용 최소화 (full fetch 회피)
- main() 진입 가드 순서: Block zone → §11 인터벌 → 실행. 첫 실행(`lastRunAt=0`) 즉시 통과
- timeout-minutes 350 유지 (대부분 invocation은 graceful exit 5초, 큰 N에선 단일 cycle 보호)
- 예상 동작 (N=37 기준): 피크 96회/일 (10분 간격 × 16h) + 비피크 ~14회 + Block zone 0회 = **~110회/일** (이전 1회/일 → 110배 갱신 빈도)
- 단일 사이클 버그(cyclesPerDay 계산만 하고 루프 미구현) 우회 — 외부 cron이 사이클 역할 대체

④ **docs/020_PriceChecker_CronDesign.md 신설** (커밋 `4e548aa`)
- §1~§11 정리: 단일 사이클 버그 + Block zone 실측(02:44~03:46 KST, GitHub 지연 44~81분)
- §3 N값별 cron 간격 매트릭스 12단계 + §4~§6 시간대 분산 배치 (피크 집중 + 심야 최소화) + N=1800 27회 예시
- §10 공유상품 중복 효과 (사용자 1,000명 × 20개 추적해도 N=500~1,000 수준 — Phase 3 shared_products 핵심 목적)
- §11 자동화 B안 — yml 10분 고정 + 코드 N값 기반 + lastRunAt graceful exit (③ 구현 근거 문서)

⑤ **CLAUDE.md slim + docs/작업이력_archive.md 분리**
- 573줄/62.6KB → 303줄/25.4KB (60% 감소)
- 2026-04-30 이전 작업 이력은 `docs/작업이력_archive.md`로 이동 (193줄/16.4KB)
- 2026-05-01 이후 + 안정 참조 정보만 유지

⑥ **iOS App Store ID 채움** (커밋 `98bbf69`)
- `services/updateChecker.ts`: `IOS_APP_STORE_ID = '6760587430'` (App Store Connect 발급)
  - 이전 빈 문자열 → iOS 사용자 "업데이트 하기" 누를 때 `itms-apps://itunes.apple.com/app/id6760587430` 정상 이동
  - fallback: `https://apps.apple.com/app/id6760587430`

⑦ **detail 화면 알림 라우팅 productId fallback** (커밋 `09a12f6`)
- 증상: 가격 알림 클릭 → "상품을 찾을 수 없습니다" 빈 화면
- 원인: 서버 notifier가 `data.itemId = p.item.productId`로 보내는데, detail 화면이 `TrackedItem.id`로만 매칭 → `id`(클라이언트 UUID) ≠ `productId`(쿠팡 상품 ID)
- 수정: `app/detail/[id].tsx:30` `find((i) => i.id === id || i.productId === id)` — productId fallback 추가 한 줄
- "구매 후 자동 삭제로 보이던 현상"의 상당수도 이걸로 자연 해소(실제 데이터 존재했으나 detail 화면에서 못 찾았던 케이스)

⑧ **1.0.9 (bn44/vc44) 빌드 + 부분 배포** (커밋 `43c538b`, `38ce556`)
- 첫 빌드 bn43/vc43(`43c538b`) → 재빌드 bn44/vc44(`38ce556`)로 단조 증가
- `app.config.js`: version 1.0.9 / ios.buildNumber 44 / android.versionCode 44
- `android/app/build.gradle`: versionCode 44 / versionName "1.0.9" 동기화 (gitignored)
- 산출물:
  - Android: `~/jigumiya/builds/android/jigumiya-1.0.9-44.aab` (58.7 MB)
  - iOS: `~/jigumiya/builds/ios/jigumiya-1.0.9-44.ipa` (15.9 MB)
- 1.0.9 주요 변경: iOS App Store ID 채움 + 알림 라우팅 매칭 fix(productId fallback)
- 배포 상태:
  - **Android Play Console: 프로덕션 업로드 완료** (단계별 출시 진행)
  - **iOS App Store: Transporter 업로드 + 심사 제출 미완** ← 다음 작업 우선순위

⑨ **`meta/config_jigumiya.minRequiredVersion = "1.0.8"` 갱신 완료** (Firebase Console 직접)
- 1.0.8 Play Store 프로덕션 승급 확인 → 1.0.7 사용자에게 1.0.8 업데이트 알림 표시
- 운영자가 1.0.9 사용 중이면 알림 안 뜸 (1.0.9 ≥ 1.0.8) — 정상 동작
- 1.0.9 → "1.0.9"로 재갱신은 1.0.9 양 스토어 승급 후 진행

⑩ **🚨 20:00 KST evening 알림 미수신** (조사 미완)
- notify-only.yml 첫 자동 실행 예정 시각이었으나 운영자 단말 수신 0건
- 가능한 원인 (내일 조사):
  - cron이 트리거되지 않음 (GitHub Actions 페이지 확인 필요)
  - 트리거됐지만 NOTIFY_ONLY=true 분기에서 graceful exit (활성 사용자 토큰 부재 등)
  - flush 단계에서 24h 가드에 막힘 (오늘 다른 알림 수신했다면 evening_no_change 자동 스킵)
  - tracked-backfill 적용했지만 여전히 productId 누락 사용자 존재
- 다음 cron 자동 실행(2026-05-03 04:30 KST 가격체크 + 07:30 morning + 20:00 evening) 결과 확인 후 원인 파악

⑪ **legacy `price-check.yml` 완전 비활성화 + evening_no_change 가드 완화** (2026-05-02, `fd6afe3`)
- **legacy 워크플로우 폐기**: `.github/workflows/price-check.yml` → `price-check.yml.disabled` 확장자 변경. GitHub Actions 미인식 → schedule + workflow_dispatch 모두 무효화. 파일은 히스토리 보존 목적으로 유지 (재활성화하려면 파일명 되돌리기). Phase 3 shared-price-checker가 가격 체크 전담 → legacy price-checker 정식 폐기 완료
- **evening_no_change 가드 완화** (`scripts/shared-price-checker/index.ts:871`): `hadAlertToday` + `pricedAlertedUids` 두 가드 모두 제거 → 19:30~21:00 KST 활성 사용자 전원에게 발송 (24h evening 가드만 적용). 그날 다른 가격 알림 수신 여부와 무관. 사고 원인이었던 "비추적자도 evening 차단되는 의심 케이스" 차단 경로 제거 — 다음 20:00 KST cron에서 효과 검증

⑫ **morning_greeting 가드 점검 + 07:30 KST 트리거 미발생 원인 규명** (2026-05-02)
- **morning_greeting 점검 결과** (`index.ts:740-748`): **이미 24h 가드만 적용**, 추가 수정 불필요. evening_no_change와 달리 처음부터 `hadAlertToday`/`pricedAlertedUids` 가드 없음 — 코드/문서 변경 0건
- **20:00 KST evening 사고 분석 (run 25251082619)**: schedule cron `'0 11 * * *'` 정상 트리거(11:40 UTC = 20:40 KST). 모든 step(checkout/setup-node/npm install/tsc/node) 정상 실행. `[SharedPriceChecker] 시작 morning=false evening=true notifyOnly=true` → `[NotifyOnly] drops=1 targets=0 bc10=0 bc20=0` → `[Flush] 활성 사용자 54명 payloads 0건` → workflow 자체는 결함 없음. **0건 원인은 flush 단의 evening 가드** — fd6afe3 패치로 차단 경로 제거 완료
- **07:30 KST schedule 트리거 미발생 원인**: `notify-only.yml` 커밋 `0bdc445` push 시각 = **2026-05-02 09:54:18 KST**, 첫 22:30 UTC schedule 시각(= 2026-05-02 07:30 KST)보다 **2시간 24분 늦음** → 파일이 존재하지 않아서 GitHub Actions가 트리거할 수 없었던 단순 타이밍 이슈. cron 표현식 `'30 22 * * *'` 자체는 정상. 11:00 UTC schedule(20:00 KST)은 09:54 push 후 ~1시간 6분 뒤라 정상 등록됨
- **첫 morning 자동 트리거 예정**: 2026-05-03 07:30 KST. 09:00 KST 이후 `gh run list --workflow=notify-only.yml`로 schedule trigger run 확인

## 다음 작업 순서 (2026-05-02 1.0.9 부분 배포 + evening 가드 완화 + morning 트리거 대기)

**최우선** (잔여 작업):
1. **배포**: 1.0.9 (bn44/vc44) iOS App Store Transporter 업로드 + 심사 제출 (Android는 이미 Play Console 프로덕션 업로드 완료)
2. **🚨 검증 (내일 09:00 KST 이후)**: 2026-05-03 07:30 KST morning 첫 자동 트리거 — `notify-only.yml` push 시점 이슈로 오늘은 미발생. `gh run list`로 schedule run 발생 확인 + `morning=true` 로그 + `payloads N건`
3. **🚨 검증 (내일 21:00 KST 이후)**: 2026-05-03 20:00 KST evening 가드 완화(`fd6afe3`) 효과 — `payloads ≈ 활성 사용자 수` 기대. 0건 지속 시 24h evening 가드 의심 → Firestore 직접 조회
4. **갱신**: 1.0.9 양 스토어 승급 후 `meta/config_jigumiya.minRequiredVersion = "1.0.9"` Firebase Console 갱신
5. **검증**: 1.0.9 실기기 — 가격 알림 클릭 시 detail 화면 정상 표시(productId fallback) + iOS "업데이트 하기" → App Store 이동 정상
6. **검증**: 내일(2026-05-03) 가격체크 정상 동작 — §11 자동화 첫 사이클 결과 확인 (`[Schedule]` 로그 + `trackers=` 양수 + `payloads N건` + `lastRunAt`/`lastNotifications` 갱신)
7. **검증**: §11 인터벌 가드 동작 — 매 10분 cron 트리거에서 간격 미달 graceful exit 빈도 확인 (현 N=37 → 피크 10분 / 비피크 20분)
8. **모니터링**: Block zone(01:00~04:30 KST) 트리거 시 graceful exit 정상 작동 — 약 21회/일 즉시 종료 예상

**중기**:
5. **`meta/stats.sharedProductCount` 자동 갱신** (별도 PR) — `services/firebase.ts:upsertSharedProduct` 신규 시 `FieldValue.increment(+1)`, 삭제 -1. N≥50,000 split 모드 진입 판정 신뢰
6. **아이고 cron 활성화** (`~/aigo/aigo` 레포) — 선결: 아이고 1.0.8급 배포 + Functions Resolver 이식
7. **앱 측 price-drops 탭 라우팅 검증** — `router.push('/price-drops')` 1.0.8 실기기 확인
8. **하트 버튼 백필 동작 검증** — 1.0.8 실기기에서 기존 누락 상품 + 신규 추가 시 하트 안정성
9. **`meta/config_jigumiya.minRequiredVersion = "1.0.8"` 콘솔 갱신** — 심사 통과 + Play Store 승급 후
10. **`addTrackedItem`/`removeTrackedItem` increment 비대칭 추적** — 카운터 음수 재발 방지
11. **아이고 Firebase → jigumiya 통합** (§8-C) — 베타 출시 이후
12. **아이고 Functions 수정 이식** — 지금이야 `e69d05e`(HTML redirectWebUrl 파싱 + Secret `.trim()` + `request.auth` 검증 + `allUsers:run.invoker`)
13. **아이고 알림 버그 + 계정 삭제 수정** — 별도 작업
14. **가족 계정 구매 테스트** — Functions 경유 링크 → 파트너스 대시보드 실적 집계 확인

**장기**:
15. **쿠팡 파트너스 문의 답변 수신** — `bestcategories` 호출 카운팅 방식 확정 후 cron 호출량 재산정
16. **category-best 브로드캐스트 큐** (별도 PR) — 갱신 시 10/20% 하락 감지 → `broadcasts/{id}` 큐 → shared-price-checker 소비
17. ~~**legacy `price-check.yml` 정식 폐기** (Phase 3-C)~~ — 2026-05-02 완료 (`.disabled` 확장자)
18. **가격변동 탭 실데이터 검증** — cron 가동 후 `recordPriceDrop` 기록 + UI 표시 확인
19. **Firebase App Check 검토** — Public repo apiKey 노출 후속 보강

## 미완 TODO (확정 작업만)

- [ ] **검증**: 뱃지 카운트 0 초기화 — 다음 푸시 알림 수신 후 foreground 전환 시 뱃지 제거 확인
- [ ] **검증**: 파트너스 실적 — Functions 경유 가족 구매 테스트 집계 확인
- [ ] **합의**: Firebase 공유 구조(jigumiya 프로젝트 기반 통합) — 아이고 베타 출시 이후
- [ ] **이식**: 아이고 Functions에 동일 수정 (HTML redirectWebUrl 파싱 + Secret `.trim()`)
- [ ] **수정**: 아이고 알림 버그 + 계정 삭제 버그
- [ ] **테스트**: shared-price-checker `workflow_dispatch` 수동 실행 → dry-run 검증
- [ ] **배포**: 1.0.7 미배포(1.0.8에 통합) → `meta/config_jigumiya.minRequiredVersion = "1.0.8"` 콘솔 갱신 (심사 통과 + Play Store 승급 후)
- [ ] **검증**: 앱 측 price-drops 탭 라우팅 — `router.push('/price-drops')`가 expo-router에서 `(tabs)/price-drops.tsx`로 정상 이동
- [ ] **검토**: Firebase App Check 활성화 (Public repo 환경 추가 보강)
- [ ] **별도 PR**: category-best 브로드캐스트 큐
- [ ] **대기**: 쿠팡 파트너스 문의 답변 — `bestcategories` 호출 카운팅 방식
- [ ] **검증**: 가격변동 탭 실제 데이터 — cron 재활성화 후 `recordPriceDrop` 동작
- [ ] **검증**: 1.0.8 실기기 — 하트 백필 + 신규 추가 안정성 + 오늘의 특가 빈 상태 + drop/best 카드 클릭 affiliate 변환
- [x] **신설**: 서버 backfill 스크립트 (`scripts/tracked-backfill/`) — productId 누락 보강 + trackerCount 음수 정정 (2026-05-02, `08009b3`). dry_run=false 실행 완료 — productId 누락 5건 보강
- [x] **추가**: 알림 전용 cron 2개 신설 (`notify-only.yml`, 07:30 / 20:00 KST) — `NOTIFY_ONLY` env 분기 + `loadDropsForNotifyOnly()` (2026-05-02, `0bdc445`)
- [x] **구현**: §11 자동화 — `shared-price-check.yml` 10분 고정 cron + `INTERVAL_MATRIX` 12단계 + lastRunAt graceful exit (2026-05-02, `b49ea2e`)
- [x] **신설**: docs/020_PriceChecker_CronDesign.md (2026-05-02, `4e548aa`) — N값 기반 cron 자동화 설계 문서
- [x] **분리**: CLAUDE.md slim + docs/작업이력_archive.md 신설 (2026-05-02) — 60% 감소
- [x] **수정**: `updateChecker.ts` IOS_APP_STORE_ID 채움 (6760587430) (2026-05-02, `98bbf69`)
- [x] **버그수정**: detail 화면 알림 라우팅 매칭 — productId fallback (2026-05-02, `09a12f6`) — "상품을 찾을 수 없습니다" 빈 화면 해소
- [x] **빌드**: 지금이야 1.0.9 (bn44/vc44) 재빌드 — `app.config.js` + `android/app/build.gradle` 동기화, AAB/IPA 산출물 확보 (2026-05-02, `38ce556`). bn43/vc43은 1차 빌드(`43c538b`) 후 재빌드 필요로 폐기
- [x] **배포 (Android)**: 1.0.9 (vc44) Play Console 프로덕션 업로드 완료 — 단계별 출시 진행
- [ ] **배포 (iOS)**: 1.0.9 (bn44) Transporter 업로드 + App Store Connect 심사 제출 ← 잔여
- [x] **갱신**: `meta/config_jigumiya.minRequiredVersion = "1.0.8"` Firebase Console 갱신 완료 (2026-05-02) — 1.0.7 사용자에게 1.0.8 업데이트 알림 표시
- [ ] **갱신**: `meta/config_jigumiya.minRequiredVersion = "1.0.9"` — 1.0.9 양 스토어 승급 후
- [x] **조사**: 20:00 KST evening 알림 미수신 — schedule trigger 발생(run 25251082619, 11:40 UTC) + 모든 step 정상 실행 + flush 단계에서 payloads 0건. workflow 결함 아닌 evening 가드(hadAlertToday/pricedAlertedUids)에 막힘. `fd6afe3` 패치로 차단 경로 제거 → 2026-05-03 20:00 KST cron 결과로 효과 검증
- [x] **점검**: morning_greeting 가드 (2026-05-02) — 원래부터 24h 가드만 적용, 수정 불필요 (evening과 달리 처음부터 `hadAlertToday`/`pricedAlertedUids` 없음)
- [x] **규명**: 07:30 KST 트리거 미발생 원인 — `notify-only.yml` push 시각(09:54 KST)이 첫 schedule(07:30 KST)보다 늦어서 GitHub Actions가 트리거 불가. cron 표현식 자체는 정상. 첫 morning 자동 트리거는 2026-05-03 07:30 KST 예정
- [x] **폐기**: legacy `price-check.yml` → `.yml.disabled` (2026-05-02) — GitHub Actions 미인식
- [x] **완화**: `evening_no_change` 가드 — `hadAlertToday` + `pricedAlertedUids` 제거 (2026-05-02) — 19:30~21:00 KST 활성 사용자 전원 발송 (24h 가드만)
- [ ] **🚨 검증 (내일)**: 2026-05-03 07:30 KST morning 첫 자동 실행 — `gh run list --workflow=notify-only.yml`로 schedule trigger 발생 확인 + `morning=true notifyOnly=true` 로그 + `payloads N건` (24h 가드 통과 사용자 수)
- [ ] **🚨 검증 (내일)**: 2026-05-03 20:00 KST evening 가드 완화 효과 — `fd6afe3` 패치 후 첫 evening cron에서 `payloads ≈ 활성 사용자 수` 확인. 0건 지속 시 24h evening 가드 의심 → Firestore `users/{uid}.lastNotifications.evening` 직접 조회
- [ ] **검증**: 내일 가격체크 + 알림 정상 동작 (§11 자동화 첫 사이클)
- [ ] **검증**: 1.0.9 실기기 — 알림 클릭 시 detail 화면 정상 표시 + iOS App Store 이동 정상
- [ ] **별도 작업**: 아이고 cron 활성화 (`~/aigo/aigo` 레포)
- [ ] **추적**: `addTrackedItem`/`removeTrackedItem` increment 비대칭 원인 (재발 모니터링)
- [ ] **별도 PR**: `meta/stats.sharedProductCount` 자동 갱신
- [ ] 메인 화면에 쿠팡 이동 버튼 추가 (위치/형태 미정)

### 참고 문서 (작업 리스트 외)
- 012_Phase2계획.md — Phase 2 초기 기획 (이력 보존)
- 014_Phase3계획.md — Phase 3 구 로드맵 (017로 대체, 이력 보존)
- 작업이력_archive.md — 2026-04-30 이전 작업 이력

## 수익모델: 쿠팡 파트너스 단일 전략
- 수수료: 3~10% (구매 발생 시 자동 수취)
- ✅ 파트너스 최종 승인 완료 — API Access Key / Secret Key 발급
- EAS Secrets에 EXPO_PUBLIC_COUPANG_ACCESS_KEY / SECRET_KEY 등록 완료
- Functions Secrets(Secret Manager)에 COUPANG_ACCESS_KEY / SECRET_KEY 등록 완료 — 말미 `\n` 문제로 함수 코드에서 `.trim()` 방어 처리
- 파트너스 deeplink API는 `https://link.coupang.com/a/XXXXX` 형태로 shortenUrl 반환 (입력 공유 URL과 동일 prefix라 slug 비교로만 원본/제휴 구분 가능)
- 코드: services/coupangApi.ts (클라이언트 HMAC — fallback용), functions/src/index.ts (서버 HMAC + HTML `redirectWebUrl` 파싱 + 딥링크)

## 현재 상태: 1.0.9 부분 배포 + cron 자동화 완료 (2026-05-02 기준)
- 1.0.9 (bn44/vc44) **Android Play Console 프로덕션 업로드 완료** — iOS Transporter + 심사 제출은 잔여
- 1.0.9 주요 변경: iOS App Store ID 채움(6760587430) + 알림 라우팅 매칭 fix(productId fallback) — "상품을 찾을 수 없습니다" 빈 화면 해소
- `meta/config_jigumiya.minRequiredVersion = "1.0.8"` 갱신 완료 (2026-05-02) — 1.0.7 사용자에게 업데이트 알림 표시
- **20:00 KST evening 알림 미수신 사고 분석 완료** — schedule trigger 발생(11:40 UTC) + step 정상 실행, flush 가드(`hadAlertToday`/`pricedAlertedUids`)에서 차단됨. `fd6afe3`로 두 가드 제거 → 2026-05-03 20:00 KST 결과 검증 대기
- **07:30 KST morning 첫 트리거 미발생** — `notify-only.yml` push(09:54 KST)가 첫 schedule(07:30 KST)보다 늦어서 정상. 2026-05-03 07:30 KST 첫 자동 트리거 예정
- 1.0.8 (bn42/vc42) 배포 진행 중: iOS App Store 심사 제출 + Android Play Console 프로덕션 업로드 (2026-05-01)
- 1.0.8 주요 변경: 골드박스 API 제거 → **오늘의 특가**(price_drops 24h + category_best fallback 1h 캐시) + **하트 버튼 누락 fix**(productId 추출 다중 패턴 + URL 후보 다중 시도) + **backfillProductIds 자가 치유**
- 서버 cron (2026-05-02 §11 자동화 적용 후):
  - `shared-price-check.yml` `'*/10 * * * *'` (10분 고정) **활성** — 코드 N값 기반 간격 결정 + lastRunAt graceful exit
  - `notify-only.yml` 07:30 + 20:00 KST **활성** — morning_greeting + evening_no_change + 누적 drop_summary
  - `category-best-update.yml` 02:00 KST **활성** (Block zone 내부, 무수정)
  - `tracked-backfill.yml` workflow_dispatch only — productId 누락 보강 (1회 적용 완료, 2026-05-02)
  - 비활성: legacy `price-check.yml` (Phase 3-C에서 정식 폐기 예정)
- 1.0.7 (bn41/vc41) 미배포 — 1.0.8에 통합되어 사용자에게는 1.0.8로 전달
- 1.0.6 (bn40/vc40) 배포 완료 (2026-04-26): iOS App Store + Android 프로덕션. 019 §8-A 카테고리 베스트 + 4탭 구조
- 1.0.5 (bn38/vc38) 배포 완료 (2026-04-24): Functions Resolver dual-path, 파트너스 제휴 링크 근본 해결
- `eas.json` `appVersionSource: local` + `autoIncrement` 제거 → `app.config.js`가 버전 source of truth
- `673c601`: `generateDeepLink` 조건 `/vp/|/vm/` → `coupang.com`로 확장 (Functions fallback 경로 유지)
- 카테고리: 쇼핑/유틸리티, 연령등급: 4+
- 개인정보처리방침: https://dafamstore.tistory.com/9
- GitHub 레포: https://github.com/Tegisee/jigumiya (**Public**, 2026-04-30 — Actions 무제한 무료)
- 빌드 전 개발 서버(npx expo start)로 테스트 먼저 진행할 것

## 주요 기술 현황

### shared-price-checker (Phase 3 신규, 019 §5-2 + §12 + docs/020 §11, 활성)
- 위치: `scripts/shared-price-checker/`, 워크플로우: `.github/workflows/shared-price-check.yml` + `notify-only.yml`
- **§11 자동화 (2026-05-02, `b49ea2e`) — 단일 사이클 버그 우회**:
  - yml schedule: `'*/10 * * * *'` (10분 고정 트리거)
  - 코드가 매 invocation마다 N값 read → §3 매트릭스 기준 최적 간격 결정 → 간격 미달이면 즉시 종료
  - `INTERVAL_MATRIX` 12단계: N≤400→10분, N≤600→15분, N≤800→20분, N≤1200→30분, N≤1800→45분, ..., N≤13200→330분, N>13200→330분 fallback
  - 피크(07-22 KST) base 그대로 / 비피크(23-06 KST) ×2 (심야 부하 절감)
  - `meta/stats.lastRunAt` start-to-start 간격 유지
  - `countSharedProducts()` 어그리게이트로 사전판정 비용 최소화 (full fetch 회피)
  - 첫 실행(`lastRunAt=0`) 즉시 통과
- **알림 전용 cron (2026-05-02, `0bdc445`) — `notify-only.yml`**:
  - schedule: `'30 22 * * *'` (07:30 KST) + `'0 11 * * *'` (20:00 KST) — morning/evening 시간대 윈도우 진입 보장
  - `NOTIFY_ONLY=true` env 분기 → 가격 스캔 + Cycle + Block zone + §11 가드 모두 스킵
  - `loadDropsForNotifyOnly()` — `price_drops` 24h 컬렉션 조회 → productId별 dedup → events 재구성 → flush 단계 통과
  - 24h 가드(`lastNotifications`) 가격체크 cron과 자연 공유 → 중복 발송 없음
  - 효과: 04:30 새벽 drop_summary가 morning(07-09) / evening(19:30-21) 시간대로 미뤄짐 (UX 개선)
- **Block zone 자동 대기**: `waitIfInBlockedZone()` — 01:00 ≤ now < 04:30 KST 진입 시 04:30까지 sleep (카테고리 갱신 시간대 충돌 방지). main 진입 직후 진입 시 즉시 graceful exit (`c0d8859`). notify-only 모드는 면제
- **동적 사이클** (`b625f07`, 폐기 예정): `computeCycleConfig(actualCount)` — 단일 사이클만 실행되는 설계 잔재. §11 외부 cron이 사이클 역할 대체 → 향후 단순화 PR 가능. 현재는 sleep 산출용으로 유지
- **N=0 자가 치유** (`c0d8859`): `shared_products` 풀 fetch 길이를 진실 원천으로 사용. `meta/stats`는 `lastCheckedOffset`/`lastRunAt`만 read/write
- **알림 7종 시스템** (`ee60516`): morning_greeting / price_drop_summary / target_reached / price_up_summary / evening_no_change / broadcast_drop10 / broadcast_drop20
  - 각 type 3개 후보 문구 랜덤, `{N}` placeholder
  - 사용자당 합산 (drop/up summary), target 통과 시 drop summary 중복 제외
  - morning(07-09 KST) / evening(19:30-21 KST) 시간대 분기, evening은 19:30~21:00 KST 활성 사용자 전원 (24h evening 가드만, 2026-05-02 hadAlertToday + pricedAlertedUids 가드 제거)
  - 24h 중복 방지: `users/{uid}.lastNotifications` (morning/evening/priceDrop[pid]/priceUp[pid]/targetReached[pid]/broadcast.tier10|tier20)
  - flush 단계 분리: 메모리 누적 → 끝에서 일괄 발송. 24h 통과 productId 0개면 push skip
- createdAt asc, trackerCount=0/당일 추가 스킵, rate-limited 즉시 종료
- category_best 캐시 hit 시 API 스킵 (019 §4-2), collectionGroup `tracked.productId` 인덱스로 추적자 역방향 검색
- 시작 로그: `[Schedule] N=37 interval=10min(peak) since=12.3min — 실행 진행` 또는 `[Cycle] N=37 daily=37 cycles=144 sleep=13851ms offset=0~36 split=false`

### tracked-backfill (1회 실행 보강 스크립트, 2026-05-02 적용 완료)
- 위치: `scripts/tracked-backfill/`, 워크플로우: `.github/workflows/tracked-backfill.yml`
- workflow_dispatch only — `dry_run: true|false` choice input
- Phase A: `users/{uid}/items/*` 스캔 → productId 누락 문서를 `resolvedUrl`/`url`/`affiliateUrl` 다중 후보 + extractProductId 4패턴으로 재추출 → items doc 보강 + tracked doc 생성
- Phase B: `collectionGroup('tracked')` 스캔 → productId 필드 누락 문서를 doc ID로 보강 (addTrackedRef 규약: doc ID = productId)
- Phase C: touched productId마다 collectionGroup 실측 카운트로 `shared_products.trackerCount` 정정 (음수/불일치 보정)
- 500개 batch 분할, DRY_RUN 안전장치
- **2026-05-02 dry_run=false 실행 완료** — productId 누락 5건 보강 + trackerCount 정정. 다음 cron 실행에서 `trackers=` 양수 확인 대기

### legacy price-checker (정식 폐기, 2026-05-02)
- 위치: `scripts/price-checker/` — 파트너스 API 검색 → Firestore → Expo Push
- 워크플로우: `.github/workflows/price-check.yml.disabled` (확장자로 비활성화, GitHub Actions 미인식)
- 재시도 루프 제거 완료 (2026-04-24, `46c20e5`): 상품당 1회 검색, 매칭 실패 시 즉시 스킵
- 폐기 이력: cron 비활성(2026-04-24 야간) → 파일 `.disabled` 확장자(2026-05-02). Phase 3 shared-price-checker가 가격 체크 전담
- 재활성화 시 파일명 되돌리고 schedule 주석 해제 — 단, 019 §4-2 중복 처리 검증 필요
- Secrets: FIREBASE_SERVICE_ACCOUNT_KEY, COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY. Node.js 24
- **쿠팡 파트너스 공식 Rate Limit**: 검색 API 1분/50회, 리포트 API 1시간/500회, 모든 API 합산 1분/100회, 링크 생성 1분/50회

### 클라이언트 CoupangScraper (WebView DOM 스크래핑)
- 상품 추가 시 + 수동 새로고침
- iOS Universal Link 이탈 버그 수정: fetch HTML → WebView에 html 문자열 로드 (네트워크 탐색 없음)
- 쿠팡 앱 다운로드/열기 배너 CSS 차단 (아이고에서 이식)
- iOS 쿠팡 튕김 개선 (2~3회 → 1회): onShouldStartLoadWithRequest 딥링크 차단 + allowsBackForwardNavigationGestures={false} + resolved URL 직접 전달 + iOS HTML fetch
- ⚠️ iOS 쿠팡 앱 열기 팝업 1회 잔존 — 안내문구로 대응 (1.0.4부터 복귀 유도)
- 타임아웃 20초, 단계적 재시도(2초/4초/6초), 실패 시 "다시 시도" 버튼

### 앱 구조 (1.0.6+ 4탭)
- 탭: 홈(추적 10개) / 자주사는(무제한) / 카테고리 베스트 / 가격변동. 설정은 Stack 화면
- 카테고리 베스트(019 §8-A): `category_best/{categoryId}` 구독 → 카테고리 칩 가로 스크롤 + 상품 리스트, 1~3위 민트 랭크 뱃지, 로켓배송 이모지, 쿠팡 파트너스 의무 고지 푸터
- 가격변동: `price_drops` 컬렉션 구독, 필터 칩(전체/-10%/-20%) + 하락률 뱃지
- 자주사는 토글: 홈 카드 우상단 하트 + 상세화면 CTA 옆 — `useFavoriteToggle` 훅 공용, `shared_products` + `favoriteCount` 증감
- 상품 삭제: 스와이프(왼쪽) + 롱프레스 오버레이 + 상세페이지 삭제
- 홈 10개 제한: `MAX_TRACKED_ITEMS = 10` (services/config.ts) — `addItem` 가드 + `modal/add-item.tsx` 선제 가드 이중 적용
- 뱃지 초기화: `services/notifications.ts:clearBadgeCount` + `_layout.tsx`에서 앱 실행 + AppState active 전환 시 호출
- Firebase Auth: onAuthStateChanged로 AsyncStorage 복원 대기 후 UID 판단
- Firebase Config: Platform.OS별 appId 분기, app.config.js로 변환

### 앱 내 딥링크 변환
- **Firebase Functions `resolveAndGenerateAffiliateUrl` 우선** → 실패 시 `coupangApi.ts generateDeepLink` fallback
- Functions: 2세대 callable, asia-northeast3, Node 22, Secrets, `allUsers:run.invoker` + `request.auth` 이중 보안
- 핵심: `link.coupang.com/a/...` 200 HTML에서 `redirectWebUrl='...\x3D...'` JS hex-escape 디코드 → vp URL 추출 → `/deeplink` API 호출 → shortenUrl 반환
- 상세: docs/018_FirebaseFunctions_Resolver.md

### 오늘의 특가 (1.0.8, `dd15624`)
- 데이터 출처: `subscribePriceDrops(cb, 30, 24)` 24h 상위 20개 + `fetchAllCategoryBest()` 1h AsyncStorage 캐시 fallback
- productId Set 중복 회피, 클릭 시 affiliate 변환 보장

## 빌드 아티팩트
- 네이밍: `jigumiya-{version}-{versionCode}[-dev].{aab|apk|ipa}`
- 저장 위치:
  - Android: `~/jigumiya/builds/android/` (AAB, APK)
  - iOS: `~/jigumiya/builds/ios/` (IPA)
- .gitignore에 포함 — 빌드 파일은 커밋하지 않음

## 버전 관리 정책
- `eas.json` `appVersionSource: "local"` — `app.config.js`가 진실 원천, EAS remote 값 무시
- `production.autoIncrement` 제거 — 실패 빌드가 버전을 먹지 않음
- 버전 bump 시 수정 대상:
  1. `app.config.js` — `version`, `ios.buildNumber`, `android.versionCode`
  2. `android/app/build.gradle` — `versionCode`, `versionName` (gitignored, 로컬 동기화)
- `android/`가 로컬에 존재하면 prebuild 스킵 → `build.gradle` 값이 최종 사용 → 양쪽 동기화 필수
- Play Store / App Store는 단조 증가만 허용 — 다운그레이드 불가

## 로컬 빌드 주의사항

### Android
- `app.config.js android.versionCode` + `build.gradle versionCode/versionName` 동기화 확인
- google-services.json은 .gitignore이므로 `.easignore`를 git 루트(`~/jigumiya/`)에 생성해야 로컬 빌드 시 포함
- 빌드: `eas build --local --profile production --platform android`

### iOS
- `app.config.js ios.buildNumber` 확인 (autoIncrement OFF)
- fastlane 필요 — `brew install fastlane`
- `GoogleService-Info.plist`도 `.easignore`에서 제외해야 빌드 포함
- `ios/` 네이티브 디렉토리 있으면 prebuild 스킵 — 네이티브 설정 변경 시 삭제 후 재빌드
- 빌드: `eas build --local --profile production --platform ios`
- 결과물: app-store 서명 IPA → Transporter로 App Store Connect 수동 업로드 (`eas submit` 금지 — §017 §12)

## Firebase 공유 설계 (지금이야 ↔ 아이고)
양쪽 앱이 동일 Firebase 프로젝트(jigumiya) 공유. 아이고 베타 출시 후 통합 예정.

### 확정 cron 스케줄 (KST)
| 시각 | 레포 | 작업 |
|------|------|------|
| 01:00 | 아이고 | event-best-updater (기념일 31개, `minPrice=30000`) |
| 01:15 | 아이고 | baby 1그룹 (장난감 + 의류 16구간) |
| 01:30 | 아이고 | baby 2그룹 (신발 + 도서 + 학습교구 14구간) |
| 02:00 | 지금이야 | category_best (19개, sleep 80초) |
| 03:00 | 아이고 | baby 3그룹 (소모품) |
| 03:20 | 아이고 | baby 4그룹 (나머지) |
| 04:30~01:00 | 지금이야 | shared_products 가격체크 (동적 사이클, N>50,000 분할 + offset, Block zone 자동 대기) |
| 즉시 (가격 변동 시) | 지금이야 | 알림 7종 발송 (24h 중복 방지, morning/evening 시간대 분기 자동 판정) |

### Firebase 공유 컬렉션 구조
- `category_best/{categoryId}` — **지금이야** cron (19 카테고리 × 50 = 950 상품)
- `category_best_baby/{slug}` — **아이고** cron (월령별 baby)
- `event_best/{eventSlug}` — **아이고** cron (기념일 31개, `minPrice=30000`)
- `shared_products/{productId}` — **양쪽** 추가 + 지금이야 04:30~01:00 가격체크가 갱신
- `price_drops/{dropId}` — **지금이야** cron (가격 하락 자동 기록)

### 호출 방식 (공통 정책)
- `limit=10`, 호출당 sleep 2초, 분당 최대 30회 (공식 한도 50회 대비 보수 운영)
- rate-limited 응답 즉시 중단 (재시도 없음)
- `event_best` 전용: `minPrice=30000`

## 형제 앱
- 지금이야와 아이고(`~/aigo/aigo`)는 형제 앱 — 동일 개발자, 동일 기술 스택 (RN + Expo + Firebase)
- 한 앱 노하우는 다른 앱에 이식 (로컬 빌드, Firebase 구조, 파트너스 API 등)
- 향후 cron: **jigumiya 레포 단일 cron**(shared_products 가격체크 04:30~01:00 KST 동적 사이클 + category_best 02:00 KST), 알림은 즉시 발송 7종 + morning/evening 시간대 분기 (2026-04-30 확정)
- **공통 이슈**: 파트너스 실적 미집계(쿠팡 공유 링크 구조) — 아이고도 AQ-4로 동일 → Functions Resolver(018) 동일 적용 예정
- **이식 대기**: 지금이야 Functions 3대 버그 수정(`e69d05e`) — HTML `redirectWebUrl` 파싱, Secret `.trim()`, `request.auth` 검증, `allUsers:run.invoker`
- **Firebase 프로젝트 통합**: jigumiya 기반으로 아이고 통합 — 아이고 베타 출시 이후 (2026-04-20 합의)
- **아이고 전용 설계**: `baby_category` 월령별 구조는 아이고 측에서 별도 (지금이야 범위 외)
- 장기: 파트너스 계정 2개로 키 분리 검토

## 앱 기본 정보
- 앱 이름: 지금이야 (Jigumiya)
- 번들 ID: com.jigumiya.app
- 프로젝트 경로: ~/jigumiya/jigumiya
- Expo 계정: june56189906
- GitHub: Tegisee/jigumiya
- 터미널 단축명령: ji (→ Max Plan으로 자동 접속)
