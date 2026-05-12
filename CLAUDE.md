# 지금이야 (Jigumiya) - 메인 컨텍스트

## ⚠️ 운영 원칙 (필수)

**CLAUDE.md에 날짜별 작업 이력 추가 금지.** 작업 완료 시:
- 작업 내역은 `docs/changelog.md` 상단에 추가
- 새 미해결 이슈는 `docs/022_Issues.md`에 추가
- 해결된 이슈는 `022_Issues.md`에서 삭제하고 `changelog.md`에 기록

CLAUDE.md는 **현재 상태 / 미해결 이슈 1줄 요약 / 다음 할 일 / 핵심 원칙 / 참조 파일**만 유지한다.

## 새 대화창 시작 방법

`docs/000_MD_사용법.md` 와 이 파일을 먼저 읽을 것. 작업할 항목의 sub MD도 함께 읽고 시작할 것.

## 세션 재시작 기준

다음 중 하나라도 해당되면 작업 완료 후 세션 재시작 권장:
- 수정 파일 10개 이상 / 신규 파일 5개 이상 / 연속 작업 30분 이상

기준 초과 시: "⚠️ 세션이 길어졌어요. 다음 작업 전에 새 세션 시작을 권장합니다." 출력.

---

## 현재 상태 (2026-05-13 기준)

- **버전**: 1.0.15 (bn50/vc50) 양 스토어 출시. **1.0.16 (bn52/vc52) 빌드 완료 — 베타 검증 완료, 스토어 업로드 대기.**
- **1.0.16 작업 (2026-05-11~12 완료)**: RealPrice 아키텍처(docs/023) 8개 + iOS 무한로딩 fix + 관리자 모드 UI + admin `fetchAllSharedProducts` orderBy fix(createdAt → documentId + 78개 백필) + **Android `com.google.gms.google-services:4.4.2` Gradle plugin 적용**(FCM 토큰 정상 발급 확인) + 그래프 스크롤(오늘=오른쪽 끝) + syncFromFirestore realPrice 분리 머지. 상세 [docs/changelog.md](./docs/changelog.md)
- **빌드 산출물**: `~/jigumiya/builds/ios/jigumiya-1.0.16-52.ipa` / `~/jigumiya/builds/android/jigumiya-1.0.16-52.aab`
- **강제 업데이트 팝업**: Firestore `meta/config_jigumiya.minRequiredVersion = "1.0.15"`. 1.0.16 출시 후 갱신 예정.
- **활성 cron**: shared-price-check (`*/10` + lastRealPriceUpdatedAt 1h 가드 + apiPrice mirror + needsCheck 플래그) / category-best (02:00) / event-best-jigumiya (02:35) / goldbox + coupangPL + notify-only (07:30) / notify-only (20:00)
- **Functions**: `resolveAndGenerateAffiliateUrl` `minInstances:1` + `onSharedProductRealPriceChange` v2 Firestore 트리거 (asia-northeast3, 배포 + 발화 검증 완료)
- **2026-05-13 베타 추가 발견**: Akamai 봇 탐지 **근본 트리거 = 쿠팡 로그인 세션** 확인 (갤럭시 로그아웃 상태에서 추가/순회 성공). 아이패드는 로그아웃 + 다른 IP에서도 실패 → 기기 핑거프린트 단위 차단 의심, 2026-05-14 재테스트 예정. 상세 [022_Issues.md Issue 3](./docs/022_Issues.md)

## 미해결 이슈

상세는 [docs/022_Issues.md](./docs/022_Issues.md) 참조.

- ⚠️ **Issue 3** — Akamai 봇 차단. 1차 트리거(IP)는 1.0.17 detectChallenge로 우회. **근본 트리거(로그인 세션 + 기기 핑거프린트)는 1.0.17 쿠키 자동 초기화 + UA 로테이션으로 추가 대응**
- 📦 **Issue 4** — 1.0.16 검증 잔여 (CF 트리거 token 보유자 push 도달 / cron skipRecentRealPrice 카운트 / Functions 응답시간 모니터링)
- 📦 **Issue 5** — 1.0.17 빌드 정리 항목 (**Akamai 완화 4종**: 쿠키 자동 초기화 / 관리자 지터 3~8s / 20개 끊고 5분 휴식 / UA 로테이션, **자동 새로고침 2종**: TTL+viewport PriceChecker / 포그라운드 syncFromFirestore, **기타**: 공유 링크 양 스토어, 아이고 resolvedUrl fallback, proguard, expo-image 잔여, cron target_reached 정식 삭제, 크라우드소싱, 관리자 3대+ 확장)
- 🔄 **Issue 6** — 아이고 이식 (`~/aigo/aigo/docs/021_Jigumiya_Migration.md`)
- 🆕 **Issue 8** — `shared_products`에 아이고 상품 10개 혼재 — 아이고 이식 시 `app` 필드 분리

> Issue 1 / Issue 2 / **Issue NEW-A**는 1.0.16 작업으로 해결되어 [docs/changelog.md](./docs/changelog.md)로 이동.

> ⚠️ **운영 주의 (2026-05-13 갱신)**: ① 관리자 순회 / 상품 추가 전 **쿠팡 로그아웃 필수** (자동화 1.0.17 적용 전까지 수동). ② 두 기기 운영 시 **네트워크 분리** (한 대 Wi-Fi + 다른 한 대 LTE). ③ 아이패드 등 핑거프린트 의심 차단은 시간 경과 후 재시도. 상세 [022_Issues.md 운영 주의사항](./docs/022_Issues.md).

## 다음 할 일

**🔨 우선순위 1 — 1.0.16 스토어 업로드**:
- iOS: Transporter로 `jigumiya-1.0.16-52.ipa` 수동 업로드 → App Store Connect 심사
- Android: Play Console 내부 테스트 → 단계적 출시
- 출시 후 `meta/config_jigumiya.minRequiredVersion = "1.0.16"` 갱신

**📋 후속**:
- cron `events.targets.push` / flush target 분기 **정식 삭제** (베타 검증 완료, 코드 제거 단계)
- Issue 4 잔여 검증 (CF 트리거 token 보유자 실제 push 도달, cron skipRecentRealPrice 카운트, Functions 응답시간 표본)
- 1.0.17 정리 항목(Issue 5) 착수 — **Akamai 완화 4종 + 자동 새로고침 2종 우선**
- 2026-05-14 아이패드 Akamai 차단 시간 경과 재테스트 → 핑거프린트 차단 TTL 확인

**🔄 별도 트랙**: 아이고 이식 (Issue 6) — `shared_products` app 필드 분리 (Issue 8) + 아이고 측 resolvedUrl fallback 포함

---

## 핵심 원칙 / 운영 규칙

### 코딩
- 글로벌 토큰 절약 원칙 + 한국어 응답 (글로벌 CLAUDE.md 참조)
- 변경 코드만 출력, 전체 파일 출력 금지

### 빌드 / 버전 관리
- `eas.json` `appVersionSource: "local"` — `app.config.js`가 진실 원천
- `production.autoIncrement` 제거 — 실패 빌드가 버전 먹지 않음
- 버전 bump 시: ① `app.config.js` (version, ios.buildNumber, android.versionCode) ② `android/app/build.gradle` (versionCode, versionName) 동기화 필수
- `android/`가 로컬 존재하면 prebuild 스킵 → `build.gradle` 값이 최종 사용
- Play Store / App Store는 단조 증가만 허용

### 로컬 빌드
- Android: `eas build --local --profile production --platform android`. `google-services.json`은 EAS Secret(FILE_BASE64) `GOOGLE_SERVICES_JSON`으로 빌드 시 주입. `android/build.gradle` + `android/app/build.gradle`는 git 추적(.gitignore exception, 2026-05-11) — `com.google.gms.google-services:4.4.2` plugin 적용 상태 보존 필수 (미적용 시 FCM 토큰 발급 실패, 1.0.15 사고).
- iOS: `eas build --local --profile production --platform ios`. fastlane 필요 (`brew install fastlane`). `GoogleService-Info.plist`는 .gitignore 미포함이라 archive에 그대로 포함. app-store 서명 IPA → Transporter 수동 업로드 (`eas submit` 금지 — §017 §12)
- 빌드 산출물 네이밍: `jigumiya-{version}-{versionCode}[-dev].{aab|apk|ipa}` → `~/jigumiya/builds/{android,ios}/`. .gitignore 포함

### 수익모델
- 쿠팡 파트너스 단일 (수수료 3~10%). EAS Secrets `EXPO_PUBLIC_COUPANG_ACCESS_KEY`/`SECRET_KEY` + Functions Secrets `COUPANG_ACCESS_KEY`/`SECRET_KEY`. Secret 말미 `\n` 방어 위해 `.trim()` 필수
- deeplink: `link.coupang.com/a/XXXXX` shortenUrl. Functions(`resolveAndGenerateAffiliateUrl`) 우선 → 클라이언트 fallback

### Firebase 공유 (지금이야 ↔ 아이고)
- 양쪽 동일 jigumiya 프로젝트 공유 (아이고 베타 출시 후 통합)
- 공유 컬렉션: `category_best`, `category_best_baby`, `event_best`, `event_best_jigumiya`, `shared_products`, `price_drops`, `goldbox`, `coupang_pl`
- 분리 유지: `users/{uid}` — `app` 필드 strict (`'jigumiya'` / `'aigo'`)

### Rate Limit (쿠팡 파트너스 공식)
- 검색 API 1분/50회, 리포트 API 1시간/500회, 모든 API 합산 1분/100회, 링크 생성 1분/50회
- 호출당 sleep 2초, 분당 최대 30회 (보수)
- rate-limited 응답 시 즉시 중단 (재시도 없음)
- ⚠️ **파트너스 실적 상세 리포트 페이지 접속 금지** (Rate Limit 사고 재발 방지, 기간별 리포트만 사용)

---

## 작업 리스트 (Phase별 sub MD)

### Phase 1 (MVP) — 모두 완료 ✅
| 번호 | 작업 | sub MD |
|------|------|--------|
| 001 | 프로젝트 초기화 | 001_프로젝트개요.md |
| 002 | 기술스택 + 폴더구조 | 002_기술스택.md |
| 003 | 디자인시스템 + UI | 003_디자인시스템.md |
| 004 | 수익모델 (쿠팡 파트너스) | 004_수익모델.md |
| 005 | UX 플로우 | 005_UX플로우.md |
| 006 | 알림 전략 | 006_알림전략.md |
| 007 | 데이터 저장 구조 | 007_데이터저장구조.md |
| 008 | Share Intent | 008_ShareIntent.md |
| 009 | Firebase 연동 | 009_Firebase.md |
| 010 | 상품 정보 스크래핑 | 010_쿠팡파트너스API.md |
| 011 | EAS 빌드 + 실기기 테스트 | 011_EAS빌드_배포.md |

### Phase 2 (가격 추적 + 알림) — 완료 ✅
- 012 FCM 푸시 + 가격 체크 봇 (012_FCM푸시알림.md)
- 013 쿠팡 파트너스 API 연동 (010, 012 통합)

### Phase 2.5 (버그 수정 + 개선)
- 015 버그 수정 및 개선 🔄 (015_Phase2.5_버그수정_및_개선.md)
- 016 AppStore 메타데이터 ✅ (016_AppStore_메타데이터.md)

### Phase 3 (앱 구조 개편)
- 017 앱 구조 개편 (3탭 + shared_products) 🔄 3-D MVP 완료 (017_앱구조개편_Phase3.md)
- 018 Firebase Functions Resolver ✅ 실기기 검증 완료 (018_FirebaseFunctions_Resolver.md)
- 019 SharedProducts + 카테고리 베스트 통합 설계 🔄 §8-C 대기 (019_Phase3_SharedProducts.md)

---

## 주요 기술 현황 (요약)

### shared-price-checker (Phase 3, 활성)
- 위치: `scripts/shared-price-checker/`, 워크플로우: `shared-price-check.yml` + `notify-only.yml`
- §11 자동화: yml `*/10 * * * *` 고정 + 코드가 N값 read → §3 매트릭스 기반 간격 결정. 피크(07-22 KST) base, 비피크 ×2. `meta/stats.lastRunAt` start-to-start 간격 유지
- 알림 전용 cron (`notify-only.yml`): `'30 22 * * *'`(07:30 KST) + `'0 11 * * *'`(20:00 KST). `NOTIFY_ONLY=true` 분기로 가격 스캔 스킵
- Block zone 자동 대기: 01:00 ≤ KST < 04:30 → 04:30까지 sleep
- 활성 알림 4종 (1.0.16): price_drop_summary / price_up_summary (cron 측). **`target_reached`는 Cloud Functions `onSharedProductRealPriceChange` 트리거가 인계** — cron 측 코드는 주석 처리 (검증 완료 후 정식 삭제). (legacy: morning/evening/broadcast_drop10/20 폐기 또는 통계만)
- 24h productId 가드: `users/{uid}.lastNotifications` (priceDrop[pid] / priceUp[pid] / targetReached[pid])
- successfulTokens 기반 dotted-path update (발송 실패 시 가드 미박힘)
- 앱 필터링: `users/{uid}.app === 'jigumiya'` strict
- 카테고리 round-robin (`category-cycle.ts`): fetch + 문서 갱신만, 알림 push 없음. 6콜/사이클

### 신규 cron (2026-05-05~06 신설)
- **goldbox-updater** (07:30 KST): 1콜/일, `goldbox/{YYYY-MM-DD KST}`
- **coupangpl-updater** (07:30 KST): 1콜/일 limit 100, `coupang_pl/{YYYY-MM-DD KST}`
- **event-best-jigumiya-updater** (02:35 KST): 11개 이벤트 D-7 윈도우 매칭 시만 갱신, 4~8콜/일

### 활성 cron 타임라인 (KST)
| 시각 | 워크플로 | 역할 |
|------|---------|------|
| 01:00 | event-best (아이고) | 31개 슬러그 |
| 01:15~03:20 | baby1~baby4 (아이고) | 월령별 |
| 02:00 | category-best-update.yml | 19개 |
| 02:35 | event-best-jigumiya-update.yml | D-7 윈도우 |
| 04:30~01:00 | shared-price-check.yml `*/10` | shared 가격체크 (Block zone 가드) |
| 07:30 | goldbox + coupangPL + notify-only(morning) | 골드박스 1콜 + PL 1콜 + morning 발송 |
| 20:00 | notify-only.yml | evening 발송 |

비활성: legacy `price-check.yml.disabled` (Phase 3-C에서 정식 폐기 예정)

### 클라이언트 CoupangScraper (WebView DOM)
- **1.0.16 무한로딩 fix**: iOS HTML fetch 폐기 → iOS/Android 공통 vp URL 직접 로드 통일. link.coupang.com는 startScrape 진입 시 + handleShouldStartLoadWithRequest 호스트 차단 2중 가드 (Universal Link 흡수 차단)
- **1.0.16 SCRAPE_JS 내부 폴링**: 0.5s × 20회(10초) setInterval, `price > 0 && image` 충족 시 즉시 postMessage. window.__coupangPollHandle 글로벌로 외부 재시도 시 중복 정리
- iOS 쿠팡 튕김 개선: onShouldStartLoadWithRequest 딥링크 차단 + allowsBackForwardNavigationGestures={false}
- 외부 타임아웃 20초, 단계적 재시도(2초/4초/6초), 실패 시 즉시 onError() 호출 (1.0.14)

### 앱 구조 (1.0.12+ 4탭)
- 탭: 홈(추적 10개) / 자주사는(무제한) / 가격변동 / 설정
- 신규 화면: today-best / coupang-pl / event-best (Stack)
- 카테고리 베스트(019 §8-A): `category_best/{categoryId}` 구독 + 1~3위 민트 랭크 뱃지
- 자주사는 토글: 홈 카드 우상단 하트 + 상세 CTA 옆 (`useFavoriteToggle` 공용)
- 홈 10개 제한: `MAX_TRACKED_ITEMS = 10` (`services/config.ts`)
- 뱃지 초기화: `services/notifications.ts:clearBadgeCount` + `_layout.tsx`에서 앱 실행 + AppState active 시 호출

---

## 앱 기본 정보

- 앱 이름: 지금이야 (Jigumiya)
- 번들 ID: com.jigumiya.app
- 프로젝트 경로: `~/jigumiya/jigumiya`
- Expo 계정: june56189906
- GitHub: Tegisee/jigumiya (Public, Actions 무제한 무료)
- 터미널 단축: `ji`
- Firebase 프로젝트: jigumiya (지금이야 ↔ 아이고 공유 예정)
- iOS App Store ID: 6760587430
- Android Play Store: com.jigumiya.app

## 형제 앱

- **아이고** (`~/aigo/aigo`): 동일 개발자, 동일 기술 스택 (RN + Expo + Firebase). Firebase 프로젝트 통합 예정 (베타 출시 이후)
- 한 앱 노하우는 다른 앱에 이식 (Functions Resolver 등)

---

## 주요 참조 파일

### 운영 / 이력
- [docs/changelog.md](./docs/changelog.md) — 날짜별 작업 이력 (2026-05-01~)
- [docs/작업이력_archive.md](./docs/작업이력_archive.md) — 2026-04-30 이전 이력
- [docs/022_Issues.md](./docs/022_Issues.md) — 미해결 이슈 트래커

### 설계 / Phase
- [docs/000_MD_사용법.md](./docs/000_MD_사용법.md)
- [docs/017_앱구조개편_Phase3.md](./docs/017_앱구조개편_Phase3.md)
- [docs/018_FirebaseFunctions_Resolver.md](./docs/018_FirebaseFunctions_Resolver.md)
- [docs/019_Phase3_SharedProducts.md](./docs/019_Phase3_SharedProducts.md)
- [docs/020_PriceChecker_CronDesign.md](./docs/020_PriceChecker_CronDesign.md)
- [docs/023_RealPrice_Architecture.md](./docs/023_RealPrice_Architecture.md) — apiPrice/realPrice 분리 아키텍처 (1.0.16 작업)

### 기타
- 글로벌 지시: `~/.claude/CLAUDE.md`
- 형제 앱: `~/aigo/aigo/CLAUDE.md`
