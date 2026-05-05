# 지금이야 (Jigumiya) - 메인 컨텍스트

## 중요: 새 대화창 시작 방법
docs/000_MD_사용법.md 와 이 파일을 먼저 읽을 것.
작업할 항목의 sub MD도 함께 읽고 시작할 것.
2026-04-30 이전 작업 이력은 docs/작업이력_archive.md 참조.

## 가장 최근 (2026-05-05): 알림 사고 → 긴급 수정 → cron 재활성화 → 1.0.11 양 스토어 업로드

5/4 A~H 배포 후 5/5 새벽 cron에서 가짜 가격 변동 폭주 → 긴급 cron 비활성화 → 원인 분석 → 수정 → 1.0.11 빌드 + Functions minInstances:1 + cron 재활성화 → **1.0.11 iOS 심사 요청 + Android 내부 테스트 업로드 완료**. 1.0.10은 심사 중 상태 유지. 상세는 "### 2026-05-05 작업" 참조.

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

### 2026-05-03 작업 (알림 0건 사고 직접 해결 + price_drops 중복 fix + iOS 무한로딩 + Android 콜드 스타트 + 1.0.10 빌드)

① **🚨 알림 0건 사고 — Expo batch 거절 + markUpdate 순서 버그** (커밋 `096c69a`)
- **사고 상황 (run 25263678929 / 5/3 07:40 KST)**: payloads 111건 빌드됐으나 Expo가 batch 전체 거절. 에러: `"All push notification messages in the same request must be for the same project; check the details field to investigate conflicting tokens"`. `users` 컬렉션에 서로 다른 EAS projectId 토큰이 혼재(아이고 토큰 누수 추정)
- **2차 피해**: `markUpdate`가 `sendSmartNotifications` 호출 전에 `lastNotifications.morning`을 먼저 등록 → 0건 발송에도 Firestore에 24h 가드 박힘 → 후속 cron(08:08 morning notify-only 등) 전부 차단되어 알림 0건
- **연쇄 영향**: 같은 메커니즘이 모든 알림 type(drop/up/target/evening/broadcast)에 동일 적용됨. 20:30 KST priceUp이 1건만 발송된 이유 = 매칭 사용자 1명 → batch에 토큰 1개 → projectId 충돌 미발생 우연
- **Fix 1 (notifier.ts)**: `sendSmartNotifications` 반환을 `{ successfulTokens, invalidTokens }`로 변경. chunk 단위 try/catch + batch 거절 시 1건씩 재시도 (다른 projectId 격리). 단건 실패는 `ProviderError` sentinel로 cleanup 회피 (만료 토큰 X, 다음 cron 재시도). `ticket.status === 'ok'` 응답 토큰만 successfulTokens에 등록
- **Fix 2 (index.ts)**: `successfulTokens` → `activeUsers` 역방향 매핑으로 `successfulUids` 산출. updates 일괄 커밋 단계에서 `successfulUids` 미포함 uid 스킵 → 발송 0건이면 lastNotifications도 0건 갱신. 새 로그 형식 `[Flush] lastNotifications 업데이트 N명 (발송 성공 M명 / 미발송 가드 스킵 K명)`
- **Fix 3 (cleanup-morning-20260503.ts)**: 1회성 정리 — 5/2 22:30~23:30 UTC(= 5/3 07:30~08:30 KST) 범위 morning 가드 unset. DRY_RUN 안전장치, FIREBASE_SERVICE_ACCOUNT_KEY env 사용. 실행: scanned=142 candidates=55 updated=55 — 잘못 박힌 5/3 07:47:14 UTC morning 타임스탬프 55명분 모두 제거 완료

② **price_drops 중복 표시 버그 fix** (커밋 `2dc12c3`)
- **증상**: 홈 "오늘의 특가" / 가격변동 탭에 같은 상품이 N번 표시 (사용자 확인 결과 한 상품 3장)
- **원인**: `recordPriceDrop`이 `db.collection('price_drops').add({...})` autoId로 기록 → 같은 productId가 cron마다 별도 문서로 누적. 24h window 내 변동 횟수만큼 중복. `loadDropsForNotifyOnly`는 productId별 dedup 했으므로 알림 발송 영향 없음 — UI 표시 한정 버그
- **Fix A (price-drop.ts)**: `add()` → `doc(productId).set()` 멱등 upsert. 같은 상품은 같은 문서 덮어쓰기. 24h window 내 productId당 항상 1문서 보장. 마지막 변동 정보만 보존 (누적 변동 폭 필요해지면 별도 priceHistory 컬렉션 분리)
- **Fix A2 (wipe-price-drops-20260503.ts)**: 1회성 wipe — 옛 autoId 문서 전체 삭제. DRY_RUN 안전장치, productId별 중복 통계 출력. 실행: 총 9개 / 고유 productId 6개 / 중복 그룹 2개 (`8522615082` → 3건, `8957561934` → 2건) → 9개 모두 batch delete. 다음 cron이 새 키 체계로 채움

③ **iOS 공유 무한로딩 fix** (커밋 `9de8269`)
- **원인 3종 콤보**: ① `startScrape` iOS HTML fetch에 timeout 부재 → link.coupang.com 또는 vp URL fetch가 행 걸리면 `await` 무한 대기. 부모 30s 가드 + 1s 재시도 + 30s = 최대 60s까지 스피너. ② Universal Link로 쿠팡 앱이 떠 사용자가 이탈/복귀하는 흐름에 가이드 부재. ③ `useFocusEffect`가 매 focus마다 state 리셋 — scraping/target 진행 중에 쿠팡 갔다 돌아오면 'url' 단계로 강제 복귀
- **Fix 1 (handleNext 분리 + iOS 공유 가이드 Alert)**: 사전 검증(쿠팡 도메인/10개 한도) 통과 후 `Platform.OS === 'ios' && isFromShare`면 Alert 노출. 확인 시 `proceedFromUrl(parsedUrl)` 호출, 취소 시 step 'url' 유지. Alert 문구: "쿠팡 앱이 잠깐 열릴 수 있어요 / 확인 후 지금이야 앱으로 돌아와주세요". 안드로이드와 비공유 진입은 즉시 `proceedFromUrl`로 진행 (기존 UX 유지)
- **Fix 2 (useFocusEffect step 보존)**: `stepRef`로 최신 step 추적 (stale closure 회피). `step !== 'url'`이면 초기화 스킵 — 스크래핑/저장 진행 중 쿠팡 앱 이탈/복귀 안전
- **Fix 3 (startScrape iOS fetch timeout)**: `fetch(...)` → `fetchWithTimeout(..., 8000)`. 8s 후 throw → `setScrapeUrl` 폴백 진입. 무한 대기 차단. 최악 시나리오 ~50s에 scrapeFailed 화면 노출 (이전 무한)

④ **Android 상품 추가 콜드 스타트 완화 — A+D+E 적용** (커밋 `601b166`)
- **배경**: Android 첫 호출 딜레이 보고 (Functions 콜드 스타트 의심). 기존 워밍업은 `_layout.tsx` launch 시 1회만(인증 후 fire-and-forget) — idle timeout으로 인스턴스 종료된 경우 / launch 직후 진입 케이스에 효과 부족
- **A. `add-item.tsx` 모달 mount 시 warmup 추가**: `useEffect(() => { warmupResolveAffiliate(); }, [])` — 사용자가 URL 확인/다음 누르는 1~2s 동안 컨테이너 init 진행. 다른 탭 보다가 공유 진입한 케이스도 커버
- **D. proceedFromUrl Functions 응답시간 로그**: `[AddItem] Functions resolve {ms}ms ok={bool}` — 실측 데이터로 콜드 vs warm 분포 확인 (향후 `minInstances: 1` 검토 근거)
- **E. `_layout.tsx` AppState active 전환 시 warmup 재발사**: 앱 background→active 시 `clearBadgeCount`와 함께 `warmupResolveAffiliate()` 호출 — idle timeout(~15분) 후 인스턴스 종료된 케이스 회복
- **B (`minInstances: 1`) 보류**: 월 ~$5~10 비용 → 실측 데이터 보고 다음 회차 결정

⑤ **1.0.10 (bn45/vc45) 빌드 + 배포 완료** (커밋 `b88976d`)
- `app.config.js`: version 1.0.10 / ios.buildNumber 45 / android.versionCode 45
- `android/app/build.gradle`: versionCode 45 / versionName "1.0.10" 동기화 (gitignored)
- 산출물:
  - Android: `~/jigumiya/builds/android/jigumiya-1.0.10-45.aab`
  - iOS: `~/jigumiya/builds/ios/jigumiya-1.0.10-45.ipa`
- 1.0.10 주요 변경: ①~④ 모두 통합 (알림 batch 거절 방어 + markUpdate 순서 fix + price_drops 멱등 upsert + iOS 무한로딩 fix + Android 콜드 스타트 완화)
- 배포 상태:
  - **Android: Play Store 프로덕션 검토 중**
  - **iOS: App Store 심사 대기 중**

⑥ **수동 cron 검증 (run 25281593187, 23:19 KST)** (5/3 야간)
- 코드 변경 후 첫 검증 실행 — 새 로그 형식 확인:
  - `[Schedule] N=51 interval=20min(offPeak) since=22.2min — 실행 진행` (§11 가드 정상)
  - `[Flush] 활성 사용자 55명 / payloads 0건 / lastNotifications 업데이트 0명 (발송 성공 0명 / 미발송 가드 스킵 0명)` ← Fix 2 새 로그 형식 출력 정상
  - `완료 mode=price-check scanned=51 ups=0 drops=0 notif=0 elapsed=393.1s`
- `shared_products` 풀 51개 (직전 47 → +4 증가, wipe 이후 신규 등록분)
- 가격 변동 0건이라 batch try/catch 실동작 검증 미완 — 다음 가격 변동 시 `[Push] batch 거절 → 1건씩 재시도` 로그 발생으로 검증 가능

### 2026-05-04 작업 (알림 시스템 종합 fix A~H + 카테고리 round-robin 가격체크 도입)

단일 커밋 `de856a6` (6 files, +947/-146). A~H 8종 일괄 적용. 1.0.11 빌드 대기.

① **A. 고정 알림 폭탄 방지 — pickRandom 강화 + 후보 풀 정리** (`notifier.ts`)
- 진단: `pickRandom(MESSAGES.morning)` 등은 이미 후보 풀에서 1개만 pick하는 구조 (코드상 폭탄 원인 아님)
- 조치: `priceDropSummary`/`priceUpSummary` 복수형 후보의 `{N}` placeholder 누락 항목 정리 — 단일/복수 분기 일관성. 명시적 코멘트로 의도 보존

② **B. 관심상품 drop 알림 상품별 각각 발송** (`index.ts` flush)
- 변경: drop 사용자당 1건 통합 → 상품별 각각 1건씩 push (target/up은 통합 유지)
- 예: 관심상품 A(target) + B/C/D(drop) 동시 변동 → target 1건 + drop 3건 = 4건 도달
- target 통과 (uid, productId)는 drop bucket 자동 제외 → 같은 상품 중복 차단
- 단일 형식 `{name} {prev}원 → {curr}원 ↓` + detail 라우팅 (notifier.ts items.length===1 분기 자동 적용)
- 24h productId별 가드 유지

③ **C. 앱 필터링 — jigumiya/aigo 사용자 분리** (서버 + 클라이언트)
- **클라이언트** (`services/firebase.ts:savePushToken`): `app: 'jigumiya' as const` 필드 같이 저장 — 1.0.11+ 발급 토큰부터 자동 백필
- **서버** (`shared-price-checker/index.ts:fetchActiveUsers`): 모든 활성 사용자 picking + `app` 필드 보존 (legacy 미설정 → `'jigumiya'` 가정 / `'aigo'` → `'aigo'`)
  - flush 단에서 `jigumiyaUsers` / `aigoUsers` 분리 맵 구성
  - 지금이야 전용 알림(morning/evening/target/drop/up): `jigumiyaUsers`만 picking
  - 로그: `[ActiveUsers] jigumiya=N aigo=M (총 X명)` — 누수 토큰 가시화
- 5/3 batch 거절 사고 방어 효과 유지 (잘못된 토큰은 cleanup으로 자연 제거)

④ **D. 알림 문구 상품명 + 변동 금액 포함** (`notifier.ts:buildMessage`)
- 단일 (`n===1`): `{name} {prev}원 → {curr}원 ↓` (drop) / `↑` (up) — detail 라우팅
- 복수 (`n>1`): `n개 상품 가격 하락! 확인해보세요` — home 라우팅
- target_reached: `{name} {prev}원 → {cur}원 🎯` (단일 전용)

⑤ **E. 고정 알림 미발송 — KST 날짜 가드로 전환** (`index.ts`)
- 원인 추정: 24h ms 가드 + GitHub Actions schedule jitter ±10분 → 어제 20:10 발송 → 오늘 20:00 cron이 23h50m로 차단 → 다음날 evening 알림 0건
- fix: `LastNotifications.morning/evening` (number ms) → `morningKstDate/eveningKstDate` (string `'YYYY-MM-DD'`)
  - `formatKstDate(ms): string` 헬퍼 신설
  - 비교: `if (user.lastNotifications.eveningKstDate === todayKstStr) continue` — 같은 KST 날짜면 스킵
  - `markUpdate` 시그니처 `value: number` → `value: number | string`
- legacy `morning`/`evening` 필드는 read 안 함 (자동 마이그레이션, 별도 cleanup 불필요)

⑥ **F. shared_products sleep 단순화 — 10초 → 2초** (`index.ts`)
- 원인: 폐기된 §5-2 단일 사이클 설계 잔재 (`BUDGET_MS / (N×cyclesPerDay)` 균등 분산 산식)
- fix:
  - `DEFAULT_SLEEP_MS = 1500` → `2000` (분당 24~30회 = 검색 한도 50/분의 48~60%)
  - `computeCycleConfig`에서 sleep 산식 제거 → `sleepMs: DEFAULT_SLEEP_MS` 단일값
  - `cyclesPerDay`는 로그/통계용으로만 산출 (분당 30회 가정 → `actualCount / 30`분 기준)
- 효과:
  - N=51 1회 실행 ~393초 → **~70초** (실 API 34회 × 2초 sleep + Firestore I/O)
  - 호출량 동일 (sleep은 실행 시간만 영향, 호출 횟수와 무관)
  - GitHub Actions runtime ~80% 절감

⑦ **G. 카테고리 round-robin 가격체크 — 카테고리 단위 2개씩** (`category-cycle.ts` 신규)
- shared_products 순회 끝난 후 매 사이클 1회 호출 (notify-only 모드 스킵, rate-limited 시 스킵)
- **호출 단위**: 카테고리 1개 = 1콜 (50상품 한 번에 응답)
  - `category_best`: `bestcategories` API (categoryId 기반)
  - `category_best_baby`: `search` API (keyword 기반)
  - `event_best`: `search` API (keyword + minPrice 30000 클라이언트 필터)
- **사이클당 6콜** (3 컬렉션 × 2 카테고리, sleep 2초)
- **포인터**: `meta/stats.categoryCyclePointers` (set-merge nested map):
  - `{ category_best: 4, category_best_baby: 6, event_best: 2 }` — 끝까지 가면 0 자동 초기화 (round-robin)
- **카테고리 정의 동적 read** — 별도 categories.ts 의존성 없음:
  - `category_best/{categoryId}` → `categoryId`, `categoryName`, `displayOrder`
  - `category_best_baby/{slug}` → `keyword`, `category`, `displayOrder`
  - `event_best/{slug}` → `keyword`, `eventName`, `type`
  - 컬렉션 비어있으면 즉시 스킵 (jigumiya 프로젝트에 baby/event 비어있는 현 상태 자연 대응)
- **가격 비교 흐름**: 기존 문서 `loadPrevPrices` → 새 fetch → productId 매칭 → 변동 시 `events.drops/ups` 추가 + `price_drops` 멱등 upsert + 카테고리 문서 통째 갱신 (다음 사이클 prev 정정)
- **추적자 매핑**: `fetchTrackersByProductId` (collectionGroup `tracked.productId`) → 추적자 있으면 `events.drops/ups`로 §B drop 상품별 발송 흐름 진입
- **커버리지**: 950상품 / 1.5시간(10 사이클 × 19카테고리) — 이전 1.4일 대비 약 22배 빠른 갱신
- **호출량**: 일일 109 사이클 × 6콜 = **약 654 카테고리 API 호출/일** (shared 약 3,706 + G 654 = **약 4,360/일**)
- **새 함수** (`coupang-api.ts`): `fetchBestCategoryProducts(categoryId, limit=50)`, `searchKeywordCategoryProducts(keyword, limit=50, minPrice=0)`

⑧ **H. category_best 10% 급락 broadcast — 부활 + 컬렉션별 분기** (`notifier.ts` + `index.ts` + `category-cycle.ts` + 클라이언트)
- C 정책으로 폐기됐던 broadcast를 카테고리 베스트 출처로 부활 (shared_products 출처는 폐기 유지)
- **범위**:
  - `category_best` → 지금이야 사용자 전체 broadcast (추적자 제외)
  - `category_best_baby` / `event_best` → broadcast 발송 X (아이고 앱에 가격변동 탭이 없어 클릭 후 확인할 화면이 없음 — 추적자에게만 §B 도달)
- **새 type**: `category_broadcast` (`notifier.ts`)
- **메시지 후보 3개 랜덤** (placeholder `{name}`/`{rate}`/`{prev}`/`{curr}`):
  - `⚡ 급락 알림 / {name} {rate}% 급락! 지금 확인해보세요`
  - `🔥 특가 알림 / {name} 특가! {prev}원 → {curr}원`
  - `📉 가격 하락 / {name} {rate}% 내려갔어요`
- **추적자 중복 방지**: `trackerUidsByProductId` 집합으로 이미 §B에서 drop 알림 받는 사용자 자동 제외
- **24h productId별 가드**: `lastNotifications.categoryBroadcast.{productId}`
- **클라이언트 라우팅** (`services/notifications.ts:resolveNotificationRoute`): `screen === 'price_change'` 추가 → `/price-drops` 탭 (가격변동) 동일 처리
- 로그: `[CategoryBroadcast] items=N 발송 M건 (추적자/24h 가드 통과만)`

⑨ **legacy 통계 + 방어적 코드**
- `shared_products` 출처 broadcast 발송 폐기 유지 (events.broadcastTier10/20는 카운팅만)
- `flush` 단의 `targetMap = item.app === 'jigumiya' ? jigumiyaUsers : aigoUsers` 분기 — 현재 categoryBroadcasts에는 jigumiya만 들어오지만 향후 아이고 가격변동 탭 추가 시 부활 대비

### 2026-05-05 작업 (1.0.11 빌드 + Functions minInstances + 🚨 가짜 가격 변동 폭주 사고 + 긴급 수정)

① **Functions `minInstances: 1` 적용 + 배포** (커밋 `44c9176`)
- `functions/src/index.ts:resolveAndGenerateAffiliateUrl` onCall 옵션에 `minInstances: 1` 추가
- 첫 배포 시 billing 증가 안전 가드로 거절 → `firebase deploy --only functions:resolveAndGenerateAffiliateUrl --project jigumiya --force` 재시도 성공
- Cloud Run 검증: minScale=1 / maxScale=20 / cpu=1 / memory=256Mi
- 효과: Android 첫 호출 딜레이 + iOS 공유 무한로딩 위험 제거 (1.0.10 응답시간 로그 분포 본 후 결정)
- 비용: 월 ~$5~10 (asia-northeast3 인스턴스 1개 24h 상시)

② **1.0.11 (bn46/vc46) 빌드** (커밋 `756bd20`)
- `app.config.js` version 1.0.11 / ios.buildNumber 46 / android.versionCode 46
- `android/app/build.gradle` versionCode 46 / versionName "1.0.11" 동기화 (gitignored)
- EAS local 빌드 (production profile, asia-northeast3):
  - iOS: `~/jigumiya/builds/ios/jigumiya-1.0.11-46.ipa` (16.1 MB)
  - Android: `~/jigumiya/builds/android/jigumiya-1.0.11-46.aab` (58.7 MB)
- 1.0.11 = A~H 통합 + 클라이언트 변경(`savePushToken` `app:'jigumiya'` + `notifications.ts` `price_change` 라우팅) 적용 빌드

③ **🚨 가짜 가격 변동 폭주 사고 — A~H 배포 후 새벽 cron**
- 증상: A~H cron 첫 자동 실행 후 추적 상품에 가짜 가격 변동 알림 폭주
- 즉시 조치: `shared-price-check.yml` schedule 주석 처리 + push (커밋 `f9e71c1`)
- **트리거**: G round-robin이 `category_best` 문서를 매 사이클(10분)마다 set merge로 갱신
- **원인**: `bestcategories` API와 `search` API가 **같은 productId에 대해 서로 다른 productPrice를 반환**
  - `bestcategories`: 베스트 노출가 (대표 옵션 또는 할인가)
  - `search`: 키워드 검색 매칭 (4단어 → 5개 fetch → productId 매칭, 다중 매칭 시 currentPrice 휴리스틱)
- **메커니즘**: G가 bestcategories 가격으로 category_best 통째 갱신 → shared-price-checker 본 흐름이 cache hit 시 bestcategories 가격을 prev로 사용 → 다음 cycle에서 search 결과와 비교 → ±5~25% 가짜 변동 (30% 가드 통과) → 추적자에게 알림 폭탄

④ **가격 비교 코드 분석 (사고 후속)**
- 모든 코드가 단일 필드 `productPrice`만 사용 — `salePrice`/`originalPrice`/`discountPrice` 등 분기 없음
- search API는 키워드 4단어 → 5개 fetch → productId 매칭. 다중 매칭 시 currentPrice에 가장 가까운 가격 선택 (`fetchCurrentPrice` 휴리스틱) — 사용자가 보는 옵션과 다를 위험
- `vendorItemId` / `itemId` 추출은 raw 로그만 찍힘, 매칭 미사용
- 30% 변동 가드만 안전장치 — bestcategories↔search 갭은 보통 30% 이내라 무력
- API 출처별 분리 표시 X — shared_products.currentPrice가 어떤 API로 갱신됐는지 history에 안 남음

⑤ **fix 1: category_best 문서 갱신 중단** (커밋 `093f7ad`)
- `category-cycle.ts:393`: `if (cfg.name !== 'category_best')` 분기 추가
- `category_best` → 갱신 스킵 (`02:00 KST category-best-updater` 단독 갱신, 24h 안정 baseline 유지)
- `category_best_baby` / `event_best` → 갱신 유지 (별도 updater 없음)
- 가격 비교 + 알림 발송 로직은 모든 컬렉션 그대로 동작
- bestcategories↔search productPrice 출처 mismatch 가짜 변동 차단

⑥ **users 컬렉션 분석 — 충격 발견** (`scripts/shared-price-checker/analyze-users.mjs`)
- jigumiya Firebase 프로젝트가 **jigumiya/aigo 사용자 혼재 운영 중** (5/3 batch 거절 사고 진짜 원인 확정)
- 총 150명 / token 보유 65명. `app` 필드 분포:
  - `app === 'jigumiya'`: 1명 (1.0.11 첫 실행자)
  - `app === 'aigo'`: 1명
  - `app == null` (legacy): **148명**
- 아이고 전용 필드 보유 사용자: `vaccinationRecords` 26명, `vaccinationHospitals` 26명, `children` 6명, `selectedChildId` 6명, `babyName/babyGender/babyBirthDate` 5명, `parentInfo` 1명
- jigumiya 식별 서브컬렉션: `items` 22명, `tracked` 7명, `favorites` 6명
- 5/3 batch 거절 사고 진짜 원인: aigo 토큰(다른 EAS projectId)이 jigumiya users 컬렉션에 박힘 + C 정책(legacy null → jigumiya 가정)이 26+ 명을 jigumiya로 잘못 분류 → batch 거절 재발 위험

⑦ **fix 2-1: backfill 스크립트 + 실행** (커밋 `093f7ad`, `users-app-backfill-20260505.mjs`)
- 분류 규칙 (우선순위, dry-run + --apply 2단계):
  1. app 필드 이미 있음 → 스킵
  2. AIGO 식별 필드 1개라도 보유 → `'aigo'` (8개 필드 OR)
  3. JIGUMIYA 서브컬렉션 1개라도 보유 → `'jigumiya'` (items/tracked/favorites OR)
  4. 둘 다 없음 → `'unknown'` (스킵, 1.0.11 자연 회복 대기)
  - aigo + jigumiya 단서 동시 보유 → aigo 우선 (사용자 사양 순서)
- 적용 결과: aigo 30명 / jigumiya 18명 / unknown 102명 스킵 / 실패 0
  - aigo 토큰 보유 3명 (이전 fetchActiveUsers 통과 → batch 거절 원인 확정)
  - jigumiya 토큰 보유 18명 (모두 정상)
  - unknown 토큰 보유 42명 (식별 단서 없음 — 1.0.11 후 jigumiya 자동 회복 또는 영구 미발송)

⑧ **fix 2-2: `fetchActiveUsers` strict 변경** (커밋 `093f7ad`)
- 이전: `app === 'aigo' ? 'aigo' : 'jigumiya'` (legacy null도 jigumiya 가정 — 위험)
- 변경: **`app === 'jigumiya'` strict picking**
- `aigo` / `unknown` / `null` / 그 외 모두 발송 제외
- 새 로그: `[ActiveUsers] jigumiya=N (발송 대상) | skip: aigo=N unknown=N other=N`
- 1.0.11 배포 후 기존 jigumiya 사용자가 앱 실행 시 `savePushToken`이 자동 `app:'jigumiya'` 박음 → 자연 회복
- aigo 사용자는 1.0.11 안 깔므로 영구 unknown — jigumiya cron 발송 영구 제외 (정확 동작)

⑨ **cron 재활성화** (커밋 `11a83d2`)
- `shared-price-check.yml` schedule 주석 해제 → `'*/10 * * * *'` 트리거 복귀
- 다음 자동 트리거: 10분 단위 + `lookupBaseInterval(N=51)` 가드 → 피크 10분 / 비피크 20분
- `notify-only.yml` (07:30/20:00 KST), `category-best-update.yml` (02:00 KST) — 변경 없이 활성 유지

⑩ **사고 사후 정리 — 분석/마이그레이션 스크립트 보존**
- `scripts/shared-price-checker/analyze-users.mjs` (1회 분석, 보존 — 향후 분포 재확인용)
- `scripts/shared-price-checker/users-app-backfill-20260505.mjs` (1회 마이그레이션, 보존 — 적용 이력)
- service account JSON: `~/jigumiya/builds/jigumiya-firebase-adminsdk-fbsvc-14daa5f617.json` (gitignored, 로컬 전용)

⑪ **1.0.11 (bn46/vc46) 양 스토어 업로드 완료** (2026-05-05)
- **iOS App Store: 심사 요청 완료** — Transporter로 IPA 업로드 + App Store Connect 심사 제출
- **Android Play Store: 내부 테스트 트랙 업로드 완료** — 프로덕션 승급은 내부 테스트 검증 후 진행
- 1.0.10 (bn45/vc45)은 **심사 중 상태 유지** — 양 스토어 승급 전까지 1.0.11이 후속 적용 대기
- 다음 단계: ① iOS 심사 통과 → App Store 출시 ② Android 내부 테스트 → 프로덕션 승급 ③ 양 스토어 승급 후 `meta/config_jigumiya.minRequiredVersion` 갱신

## 다음 작업 순서 (2026-05-06 이후)

**최우선** (잔여 작업):
1. **🚨 검증**: 5/5 cron 재활성화 후 첫 자동 실행 (사고 수정 검증):
   - `[ActiveUsers] jigumiya=18 (발송 대상) | skip: aigo=N unknown=N other=N` — strict 동작 확인
   - `[CategoryCycle] category_best ...` 처리 시 **category_best 문서 갱신 X** (Firestore에서 updatedAt 변경 없음 확인)
   - `[CategoryBroadcast] items=N 발송 M건` (H 발생 시)
   - 추적 상품에 가짜 변동 알림 0건 — bestcategories↔search mismatch 해소 확인
   - batch 거절 로그 사라짐 — 모든 발송 토큰 단일 EAS projectId
2. ~~**배포**: 1.0.11 (bn46/vc46) Play Store / App Store 업로드~~ → ✅ 완료 (5/5): iOS 심사 요청 / Android 내부 테스트 트랙 업로드. **다음**: Android 내부 테스트 → 프로덕션 승급 + iOS 심사 통과 대기
3. **갱신**: 1.0.10 양 스토어 승급 → `meta/config_jigumiya.minRequiredVersion = "1.0.10"`. 1.0.11 양 스토어 승급 → `"1.0.11"`로 재갱신
4. **🚨 검증**: 1.0.11 실기기 — ① drop 상품별 N건 도달 (B) ② 단일 형식 `{name} {prev}원 → {curr}원 ↓` (D) ③ category_broadcast 알림 → 가격변동 탭 (H) ④ KST 날짜 가드 (E) ⑤ savePushToken `app:'jigumiya'` 자동 박힘 검증 (Firestore 직접 확인)
5. **🚨 검증**: 1.0.10 실기기 (이전 잔여) — ① iOS 가이드 Alert ② Android 응답시간 로그 분포 ③ price_drops 단일 표시 ④ 알림 클릭 detail 라우팅
6. **모니터링**: Functions 응답시간 로그 분포 — `minInstances: 1` 적용 후 콜드 스파이크 사라짐 확인 (이전 1~5s 콜드 → 0.3~0.5s 일정 분포 예상)
7. **모니터링**: 카테고리 round-robin 첫 1순환 — `category_best: 0` 복귀 (10 사이클 ≈ 1.5시간)
8. **모니터링**: unknown 사용자 자연 회복 — 1.0.11 배포 후 Firestore에서 `app:'jigumiya'` 추가 카운트 증가 추적 (analyze-users.mjs 재실행)

**뒤로 미뤄둔 작업** (2026-05-04 이후 일정 배정):
- **그래프 Y축 가격 표시 버그**: 1~2일 추가 관찰 후 패턴 확인 (재현 조건 불명확 — 일별 데이터 변동 폭 영향 의심)
- **공지사항 팝업 + 전체 푸시 기능 추가**: 지금이야/아이고 별도 구현. 운영자가 Firebase Console에서 공지 등록 → 활성 사용자 전체 broadcast. cron 별도 분리 검토
- **category-best 브로드캐스트 큐**: `category-best-updater`에 직전 스냅샷 비교 → 10/20% 하락 감지 → `broadcasts/{id}` 큐. `shared-price-checker`가 매 사이클 끝에서 미발송 broadcasts 처리 (별도 PR)
- **cron schedule 최적화 §8-D-2**: morning/evening 시간대별 분리 인스턴스 검토. 현재 `notify-only.yml`이 07:30 + 20:00 두 시각 스케줄 한 파일. 분리 시 morning 전용 / evening 전용 yml 가능 → 운영성 ↑
- **Functions `minInstances: 1`**: 1.0.10 실측 데이터(2번 항목) 본 후 결정. 평균 응답시간 + 콜드 분포 기반 판단
- **shared_products 가격체크 cron dry-run 검증**: workflow_dispatch로 dry-run 모드 추가 — 실제 Firestore write 안 하고 가격 비교만 진행하는 옵션. 디버깅 + 변경 전 사전 검증용

**중기**:
8. **`meta/stats.sharedProductCount` 자동 갱신** (별도 PR) — `services/firebase.ts:upsertSharedProduct` 신규 시 `FieldValue.increment(+1)`, 삭제 -1. N≥50,000 split 모드 진입 판정 신뢰
9. **users 컬렉션 다른 EAS projectId 토큰 조사** — Expo batch 거절 근본 원인 파악. 어느 사용자가 어느 projectId 토큰 보유 중인지 식별 → 해당 사용자 토큰 재발급 유도 또는 cleanup
10. **아이고 cron 활성화** (`~/aigo/aigo` 레포) — 선결: 아이고 1.0.8급 배포 + Functions Resolver 이식
11. **하트 버튼 백필 동작 검증** — 1.0.10 실기기에서 기존 누락 상품 + 신규 추가 시 하트 안정성
12. **`addTrackedItem`/`removeTrackedItem` increment 비대칭 추적** — 카운터 음수 재발 방지
13. **아이고 Firebase → jigumiya 통합** (§8-C) — 베타 출시 이후
14. **아이고 Functions 수정 이식** — 지금이야 `e69d05e`(HTML redirectWebUrl 파싱 + Secret `.trim()` + `request.auth` 검증 + `allUsers:run.invoker`)
15. **아이고 알림 버그 + 계정 삭제 수정** — 별도 작업
16. **가족 계정 구매 테스트** — Functions 경유 링크 → 파트너스 대시보드 실적 집계 확인

**장기**:
17. **쿠팡 파트너스 문의 답변 수신** — `bestcategories` 호출 카운팅 방식 확정 후 cron 호출량 재산정
18. **Firebase App Check 검토** — Public repo apiKey 노출 후속 보강

## 미완 TODO (확정 작업만)

### 2026-05-03 완료
- [x] **🚨 사고 해결**: Expo batch 거절 방어 — `notifier.ts` chunk try/catch + 1건씩 fallback (2026-05-03, `096c69a`)
- [x] **🚨 사고 해결**: markUpdate 순서 버그 — `index.ts` successfulTokens 기반 lastNotifications 업데이트 (2026-05-03, `096c69a`)
- [x] **신설**: cleanup-morning-20260503.ts — 잘못 박힌 morning 가드 55명 unset 완료 (DRY_RUN 안전장치 + 실행)
- [x] **버그수정**: price_drops 중복 표시 — `add()` → `doc(productId).set()` 멱등 upsert (2026-05-03, `2dc12c3`)
- [x] **신설**: wipe-price-drops-20260503.ts — 옛 autoId 문서 9건 batch delete 완료
- [x] **버그수정**: iOS 공유 무한로딩 — 가이드 Alert + step 보존 + iOS fetch 8s timeout (2026-05-03, `9de8269`)
- [x] **개선**: Android 콜드 스타트 완화 — 모달 mount warmup + AppState active warmup + 응답시간 로그 (2026-05-03, `601b166`)
- [x] **빌드**: 지금이야 1.0.10 (bn45/vc45) — `app.config.js` + `android/app/build.gradle` 동기화 (2026-05-03, `b88976d`). AAB/IPA 산출물 확보
- [x] **배포 (Android)**: 1.0.10 (vc45) Play Store 프로덕션 검토 중 (단계적 출시 대기)
- [x] **배포 (iOS)**: 1.0.10 (bn45) App Store 심사 대기 중

### 2026-05-04 완료
- [x] **신규 기능 + 버그 fix**: A~H 알림 시스템 종합 fix + 카테고리 round-robin 가격체크 (커밋 `de856a6`)
  - A: 고정 알림 폭탄 방지 (랜덤 1개 pick 강화)
  - B: 관심상품 drop 알림 상품별 각각 발송 (사용자당 통합 → 상품별 1건씩)
  - C: 앱 필터링 (jigumiya/aigo 사용자 분리, fetchActiveUsers + savePushToken)
  - D: 알림 문구 상품명 + 변동 금액 포함 (`{name} {prev}원 → {curr}원 ↓`)
  - E: 고정 알림 미발송 KST 날짜 가드 (24h ms → KST 'YYYY-MM-DD' 비교)
  - F: shared sleep 10초 → 2초 (cyclesPerDay 산식 잔재 제거)
  - G: 카테고리 round-robin (`category-cycle.ts` 신규, 6콜/사이클, 포인터 round-robin)
  - H: category_best 10% 급락 broadcast (`category_broadcast` type, 추적자 제외)

### 2026-05-05 완료
- [x] **인프라**: Functions `minInstances: 1` 적용 + 배포 (커밋 `44c9176`) — Cloud Run minScale=1, 콜드 스타트 제거, 월 ~$5~10
- [x] **빌드**: 1.0.11 (bn46/vc46) iOS IPA 16.1 MB / Android AAB 58.7 MB (커밋 `756bd20`)
- [x] **🚨 사고 해결 1**: shared-price-check cron 긴급 비활성화 (커밋 `f9e71c1`) — 가짜 가격 변동 폭주 즉시 차단
- [x] **분석**: 가격 비교 코드 정밀 점검 — bestcategories↔search productPrice 출처 mismatch 확정
- [x] **분석**: users 컬렉션 분포 (`analyze-users.mjs`) — jigumiya/aigo 혼재 운영 확정
- [x] **마이그레이션**: backfill 적용 (`users-app-backfill-20260505.mjs`) — aigo 30 / jigumiya 18 / unknown 102 스킵
- [x] **🚨 사고 해결 2**: category_best 갱신 중단 + fetchActiveUsers strict (커밋 `093f7ad`)
- [x] **재가동**: shared-price-check cron 재활성화 (커밋 `11a83d2`)
- [x] **배포 (iOS)**: 1.0.11 (bn46) App Store **심사 요청 완료** — Transporter 업로드 + 심사 제출
- [x] **배포 (Android)**: 1.0.11 (vc46) Play Store **내부 테스트 트랙 업로드 완료**

### 2026-05-06 이후 미완
- [ ] **🚨 승급 대기**: 1.0.11 iOS 심사 통과 → App Store 출시 / Android 내부 테스트 → 프로덕션 승급
- [ ] **🚨 검증**: 1.0.11 실기기 — drop 상품별 N건(B) + 단일 형식 메시지(D) + category_broadcast 라우팅(H) + KST 날짜 가드(E)
- [ ] **🚨 검증**: 5/5 첫 cron 자동 실행 — `[ActiveUsers]` / `[CategoryCycle]` / `[CategoryBroadcast]` 새 로그 형식 일괄 확인
- [ ] **🚨 검증**: 1.0.10 실기기 (잔여) — iOS 가이드 Alert + Android 응답시간 로그 + price_drops 단일 표시 + 알림 클릭 detail
- [ ] **🚨 검증**: 가격 변동 발생 시 `[Push] batch 거절 → 1건씩 재시도` 로그로 Fix 1 실동작 확인
- [ ] **갱신**: `meta/config_jigumiya.minRequiredVersion = "1.0.10"` (1.0.10 승급 후) → `"1.0.11"` (1.0.11 승급 후)
- [ ] **모니터링**: Functions 응답시간 로그 분포 — `minInstances: 1` 검토 근거 (최소 20회 표본)
- [ ] **모니터링**: 카테고리 round-robin 첫 1순환 — 10 사이클 후 `category_best: 0` 복귀
- [ ] **조사**: users 컬렉션 다른 EAS projectId 토큰 분포 — batch 거절 근본 원인. `[ActiveUsers] aigo=M` 카운트로 1차 가시화
- [ ] **관찰**: 그래프 Y축 가격 표시 버그 — 1~2일 추가 데이터로 재현 조건 확인
- [ ] **신규 기능**: 공지사항 팝업 + 전체 푸시 broadcast — 지금이야/아이고 별도 구현
- [ ] **별도 PR**: category-best 브로드캐스트 큐 → 본 PR(H)이 흡수했지만 category-best-updater 갱신 시점 비교는 미구현 — 사이클 round-robin 도달 전 발송 X
- [ ] **검토**: cron schedule 최적화 §8-D-2 — morning/evening 시간대별 yml 분리 검토
- [ ] **검토**: shared_products 가격체크 cron dry-run 모드 — workflow_dispatch input으로 변경 검증

### 누적 미완 (이전부터)
- [ ] **검증**: 뱃지 카운트 0 초기화 — 다음 푸시 알림 수신 후 foreground 전환 시 뱃지 제거 확인
- [ ] **검증**: 파트너스 실적 — Functions 경유 가족 구매 테스트 집계 확인
- [ ] **합의**: Firebase 공유 구조(jigumiya 프로젝트 기반 통합) — 아이고 베타 출시 이후
- [ ] **이식**: 아이고 Functions에 동일 수정 (HTML redirectWebUrl 파싱 + Secret `.trim()`)
- [ ] **수정**: 아이고 알림 버그 + 계정 삭제 버그
- [ ] **검증**: 앱 측 price-drops 탭 라우팅 — `router.push('/price-drops')`가 expo-router에서 `(tabs)/price-drops.tsx`로 정상 이동
- [ ] **검토**: Firebase App Check 활성화 (Public repo 환경 추가 보강)
- [ ] **대기**: 쿠팡 파트너스 문의 답변 — `bestcategories` 호출 카운팅 방식
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

## 현재 상태: 1.0.11 양 스토어 업로드 완료 + 사고 수정 완료 + cron 재활성화 (2026-05-05 기준)
- **1.0.11 (bn46/vc46) 양 스토어 업로드 완료 (5/5)**:
  - **iOS App Store: 심사 요청 완료** (Transporter 업로드 + 심사 제출)
  - **Android Play Store: 내부 테스트 트랙 업로드 완료**
  - 빌드 산출물:
    - iOS: `~/jigumiya/builds/ios/jigumiya-1.0.11-46.ipa` (16.1 MB)
    - Android: `~/jigumiya/builds/android/jigumiya-1.0.11-46.aab` (58.7 MB)
- Functions `resolveAndGenerateAffiliateUrl` `minInstances: 1` 배포 완료 — Cloud Run minScale=1, 콜드 스타트 제거 (월 ~$5~10)
- 5/5 알림 사고 수정 완료 + cron 재활성화:
  - category_best 매 사이클 갱신 → `02:00 KST cron 단독 갱신`으로 복귀 (출처 mismatch 차단)
  - fetchActiveUsers strict (`app === 'jigumiya'` 단일 발송) — aigo/unknown/null 모두 제외
  - users 컬렉션 backfill 적용 (aigo 30 / jigumiya 18 / unknown 102 스킵)
- **1.0.10 (bn45/vc45) Play Store 프로덕션 검토 중 / App Store 심사 대기 중 (상태 유지)** — 양 스토어 승급 시 1.0.11이 후속 적용
- A~H 8종 일괄 적용 (커밋 `de856a6`):
  - A: 고정 알림 폭탄 방지 (pickRandom 강화 + 후보 풀 정리)
  - B: 관심상품 drop 알림 상품별 각각 발송 (사용자당 통합 → 상품별 1건씩)
  - C: 앱 필터링 (jigumiya/aigo 사용자 분리) — `[ActiveUsers] jigumiya=N aigo=M` 가시화
  - D: 알림 문구 상품명+변동 금액 (`{name} {prev}원 → {curr}원 ↓`)
  - E: 고정 알림 미발송 KST 날짜 가드 (24h ms → KST 'YYYY-MM-DD' 비교 → GitHub Actions jitter ±10분 흡수)
  - F: shared sleep 10초 → 2초 (실행 시간 ~393초 → ~70초, 호출량은 동일)
  - G: 카테고리 round-robin (`category-cycle.ts` 신규, 사이클당 6콜, 950상품 1.5h 1순환)
  - H: category_best 10% 급락 broadcast (`category_broadcast` type, 추적자 제외, 가격변동 탭 라우팅)
- 1.0.10 주요 변경 (이전):
  - 🚨 알림 0건 사고 fix: Expo batch 거절 방어 (chunk try/catch + 1건씩 fallback) + markUpdate 순서 교정
  - 🚨 잘못 박힌 lastNotifications.morning 55명 정리 (cleanup-morning-20260503)
  - 🐛 price_drops 중복 표시 fix: `add()` → `doc(productId).set()` 멱등 upsert + 옛 autoId 문서 9건 wipe
  - 🐛 iOS 공유 무한로딩 fix: 가이드 Alert + useFocusEffect step 보존 + startScrape 8s timeout
  - ⚡ Android 콜드 스타트 완화: 모달 mount warmup + AppState active warmup 재발사 + 응답시간 로그
- 1.0.9 (bn44/vc44) Android 프로덕션 업로드 완료, iOS 심사 제출 미완 — 1.0.10에 통합되어 1.0.9는 부분 배포 상태로 종결
- `meta/config_jigumiya.minRequiredVersion = "1.0.8"` 유지 (2026-05-02 갱신) — 1.0.10 양 스토어 승급 후 "1.0.10"으로 갱신
- 1.0.8 (bn42/vc42) 배포 완료 (2026-05-01)
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
- **알림 8종 시스템** (`ee60516` + `de856a6` 2026-05-04): morning_greeting / price_drop_summary / target_reached / price_up_summary / evening_no_change / broadcast_drop10 / broadcast_drop20 (legacy 통계) / **category_broadcast** (2026-05-04 신설, H)
  - 각 type 3개 후보 문구 랜덤. drop/up `{N}` placeholder, category_broadcast `{name}/{rate}/{prev}/{curr}` placeholder
  - **drop은 상품별 각각 1건씩 발송** (B, 2026-05-04) — 사용자당 통합 정책에서 분리. target/up은 통합 유지. target 통과 시 drop bucket 자동 제외
  - **앱 필터링** (C, 2026-05-04): `users/{uid}.app` 필드 (`'jigumiya'`/`'aigo'`) 보존 + flush 단에서 `jigumiyaUsers`/`aigoUsers` 분리. 지금이야 전용 알림은 `jigumiyaUsers`만, category_broadcast는 컬렉션별 app 매칭
  - **단일 형식 메시지** (D, 2026-05-04): `n===1` 시 `{name} {prev}원 → {curr}원 ↓` 형식 + detail 라우팅. `n>1` 시 합산 형식 + home 라우팅
  - morning(07-09 KST) / evening(19:30-21 KST) 시간대 분기. **KST 날짜 가드** (E, 2026-05-04): `lastNotifications.morningKstDate/eveningKstDate` 'YYYY-MM-DD' 비교 — GitHub Actions schedule jitter ±10분 흡수
  - 24h productId 가드: `users/{uid}.lastNotifications` (priceDrop[pid]/priceUp[pid]/targetReached[pid]/categoryBroadcast[pid]/broadcast.tier10|tier20[legacy])
  - flush 단계 분리: 메모리 누적 → 끝에서 일괄 발송. 24h/날짜 가드 통과 0개면 push skip
- **F sleep 단순화** (2026-05-04): `DEFAULT_SLEEP_MS = 2000` 단일값 (이전 1500 + cyclesPerDay 산식 잔재 제거). N=51 1회 ~393초 → ~70초
- **G 카테고리 round-robin** (2026-05-04, `category-cycle.ts`): shared_products 순회 끝난 후 매 사이클 1회. 3 컬렉션(`category_best`/`category_best_baby`/`event_best`) 각 2개씩 = 6콜/사이클. 포인터 `meta/stats.categoryCyclePointers`. 카테고리 정의 Firestore 문서에서 동적 read. 950상품 1.5h 1순환
- **H category_broadcast** (2026-05-04): category_best -10% 급락 → jigumiya 사용자 전체 broadcast (추적자 제외). category_best_baby/event_best는 발송 X (아이고 가격변동 탭 부재). 클라이언트 라우팅 `screen: 'price_change'` → `/price-drops` 탭
- createdAt asc, trackerCount=0/당일 추가 스킵, rate-limited 즉시 종료
- category_best 캐시 hit 시 API 스킵 (019 §4-2), collectionGroup `tracked.productId` 인덱스로 추적자 역방향 검색
- 시작 로그: `[Schedule] N=37 interval=10min(peak) since=12.3min — 실행 진행` / `[Cycle] N=37 daily=37 cycles=144 sleep=2000ms offset=0~36 split=false` / `[ActiveUsers] jigumiya=N aigo=M` / `[CategoryCycle] category_best 0~1 처리 완료 api=2 drops=K` / `[CategoryBroadcast] items=N 발송 M건`

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
