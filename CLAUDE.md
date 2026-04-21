# 지금이야 (Jigumiya) - 메인 컨텍스트

## 중요: 새 대화창 시작 방법
docs/000_MD_사용법.md 와 이 파일을 먼저 읽을 것.
작업할 항목의 sub MD도 함께 읽고 시작할 것.

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
| 018 | Firebase Functions 파트너스 링크 Resolver | 🔄 2026-04-21 착수 예정 | 018_FirebaseFunctions_Resolver.md |

**진행 경과**:
- Phase 3-A 완료 (2026-04-18): shared_products 이중 쓰기 + 중복 가드 검증 성공
- Phase 3-D MVP 완료 (2026-04-19): 3탭 구조, 자주사는 토글(홈 카드 + 상세), 스와이프 삭제, 피드 정적 배너, 10개 제한, 뱃지 초기화
- 파트너스 실적 미집계 원인 공식 확정 (2026-04-20): 쿠팡 공식 가이드 p.13 "공유 기능 링크 수익 집계 안 됨" → Firebase Functions resolve 필수 (018)
- 파트너스 API Rate Limit 2회 초과 (2026-04-21): 지금이야/아이고 cron 양쪽 긴급 비활성화. 최유력 원인은 파트너스 공식 사이트 실적 상세 리포트 페이지 내부 API 자동 호출로 추정 (cron/앱 배제). 2026-04-22 07:21 KST 해제 후 재활성화 테스트 예정. 상세: docs/010 §Rate Limit 초과 사건.
- 다음: 018 Firebase Functions Resolver (2026-04-21) → 파트너스 실적 검증 → Phase 3-B/3-C

### 참고 문서 (작업 리스트 외)
- 012_Phase2계획.md — Phase 2 초기 기획 문서 (이력 보존)
- 014_Phase3계획.md — Phase 3 구 로드맵 (017로 대체됨, 이력 보존)

### TODO (미정)
- [ ] 메인 화면에 쿠팡 이동 버튼 추가 (위치/형태 미정)
- [x] 쿠팡 공유하기 진입 시 쿠팡 앱 이탈 버그 수정 (resolved URL + HTML fetch + onShouldStartLoadWithRequest 차단)
- [x] **원인 확정**: 파트너스 실적 미집계 — 쿠팡 공식 가이드 p.13 "공유 기능 링크 수익 집계 안 됨" (2026-04-20). 아이고 AQ-4 동일 문제.
- [ ] **검증**: 뱃지 카운트 0 초기화 — 다음 푸시 알림 수신 후 foreground 전환 시 뱃지 제거 확인 (1.0.4 37/37)
- [ ] **실행**: 018 Firebase Functions Resolver 구현 (2026-04-21 착수, 상세: docs/018)
- [ ] **검증**: 파트너스 실적 — 2026-04-21 15:00 KST 이후 Functions 경유 가족 구매 테스트 집계 확인
- [x] **해소**: 아이고 cron 시간 충돌 — 지금이야(08/14/21) ↔ 아이고(07/10/13/16/19/22) 겹침 없음 확인 (2026-04-20)
- [ ] **합의**: Firebase 공유 구조(jigumiya 프로젝트 기반 통합) — 아이고 베타 출시 이후 진행
- [ ] **검토**: 가격 체크 3회 중 마지막 회차에만 알림 발송 구조로 개선 (파트너스 실적 검증 후)
- [x] **긴급 조치**: price-check cron 양쪽 앱 비활성화 — 지금이야 `a1765f6`, 아이고 `23033de` (2026-04-21, Rate Limit 2회 초과)
- [ ] **검증**: 2026-04-22 07:21 KST 이후 cron 재활성화 테스트 → 403 재현 여부로 원인 가설(파트너스 사이트 리포트 페이지 내부 호출) 확정

## 수익모델: 쿠팡 파트너스 단일 전략
- 수수료: 3~10% (구매 발생 시 자동 수취)
- ✅ 파트너스 최종 승인 완료 — API Access Key / Secret Key 발급됨
- EAS Secrets에 EXPO_PUBLIC_COUPANG_ACCESS_KEY / SECRET_KEY 등록 완료
- API 딥링크 정상 작동 확인 (link.coupang.com/re/... 형태)
- 코드: services/coupangApi.ts (HMAC 서명 + 딥링크 + 상품 검색), services/config.ts (키 초기화)

## 현재 상태: 1.0.4 로컬 빌드 대상 (2026.04.20 기준)
- 현재 빌드 타겟: **iOS 1.0.4 buildNumber 37 / Android 1.0.4 versionCode 37** (`cdfa7b5`로 통일)
- `673c601`: `generateDeepLink` 조건 `/vp/|/vm/` → `coupang.com`로 확장 (임시 수정, 018 배포 후 원복 검토)
- `eas.json` `appVersionSource: local` + `autoIncrement` 제거 → `app.config.js`가 버전 source of truth
- iOS 이전 출시: 1.0.1 App Store 정식 출시 ✅, 1.0.2 buildNumber 28 심사 제출 이력 있음
- Android 이전 출시: 1.0.1 versionCode 17 프로덕션 승급 제출 이력 있음
- 1.0.4 주요 변경: Phase 3-D MVP(3탭/자주사는/피드 배너), 뱃지 초기화, 홈/상세 하트 토글, 스와이프 삭제, 10개 제한, 하트 시인성 개선
- 카테고리: 쇼핑/유틸리티, 연령등급: 4+
- 개인정보처리방침: https://dafamstore.tistory.com/9
- GitHub 레포: https://github.com/Tegisee/jigumiya (private)
- 빌드 전 개발 서버(npx expo start)로 테스트 먼저 진행할 것

## 주요 기술 현황
- 서버사이드 가격 체크: scripts/price-checker/ (파트너스 API 검색 → Firestore 업데이트 → Expo Push)
  - ✅ Puppeteer 삭제 → 파트너스 API searchProducts()로 교체 완료
  - ✅ GitHub Actions 정상 실행 확인 (Access Denied 해결)
  - ✅ 알림 로직 개선: 가격 무변동 시 매 체크마다 no_change 알림 발송 + price_drop 오탐 방지
  - ✅ 만료 토큰 cleanup: 유저 삭제 → expoPushToken 필드만 제거 (상품 데이터 보존)
  - GitHub Actions cron: 08:00/14:00/21:00 KST (3회/일), Node.js 24
  - Secrets 등록 완료: FIREBASE_SERVICE_ACCOUNT_KEY, COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY
  - 호출 방식: **완전 순차 for-of + 상품당 1초 딜레이** (scripts/price-checker/index.ts L204) → 실측 **분당 ~35회**, /products/search 분당 50회 한도 대비 30% 여유 (상세: docs/010 §Rate Limit)
  - 개선 검토: 1~2회차는 가격 DB 갱신만, 21:00 회차에만 알림 발송 → 알림 피로 감소 (파트너스 실적 검증 후 착수)
- 클라이언트: CoupangScraper (WebView DOM 스크래핑) — 상품 추가 시 + 수동 새로고침
  - ✅ iOS Universal Link 이탈 버그 수정: fetch로 HTML 획득 → WebView에 html 문자열 로드 (네트워크 탐색 없음)
  - ✅ 쿠팡 앱 다운로드/열기 배너 CSS 차단 추가 (아이고에서 이식)
  - ✅ iOS 쿠팡 튕김 개선 (2~3회 → 1회): onShouldStartLoadWithRequest 딥링크 차단 + allowsBackForwardNavigationGestures={false} + resolved URL 직접 전달 + iOS HTML fetch 방식
  - ⚠️ iOS 쿠팡 앱 열기 팝업 1회 잔존: "쿠팡 앱이 열리면 지금이야 앱으로 돌아와서 계속해주세요." 안내문구로 대응 (취소 유도 → 복귀 유도로 1.0.4에서 변경)
  - 타임아웃 20초, 단계적 재시도(2초/4초/6초), 실패 시 "다시 시도" 버튼
- Phase 3-D 탭 구조: 홈(추적 10개) / 자주사는(무제한) / 가격변동(정적 배너, 3-C 대기), 설정은 Stack 화면으로 이동
- 자주사는 토글: 홈 카드 우상단 하트(반투명 원형 배경) + 상세화면 CTA 옆 — `useFavoriteToggle` 훅 공용, `shared_products` 보장 + `favoriteCount` 증감
- 상품 삭제: 스와이프 삭제 (왼쪽) + 롱프레스 삭제 오버레이 + 상세페이지 삭제 (홈 카드 + 자주사는 카드 동일 패턴)
- 홈 10개 제한: `MAX_TRACKED_ITEMS = 10` (services/config.ts) — `addItem` 가드 + `modal/add-item.tsx` 선제 가드로 이중 적용
- 뱃지 초기화: `services/notifications.ts` `clearBadgeCount` + `_layout.tsx`에서 앱 실행 + AppState active 전환 시 호출 (iOS 앱 아이콘/Android 알림 센터)
- Firebase Auth: onAuthStateChanged로 AsyncStorage 복원 대기 후 UID 판단 (UID 불일치 해결)
- Firebase Config: Platform.OS별 appId 분기 (iOS/Android), app.config.js로 변환
- 앱 내 딥링크 변환: coupangApi.ts generateDeepLink() (클라이언트 HMAC)

## 빌드 아티팩트
- 네이밍: `jigumiya-{version}-{versionCode}[-dev].{aab|apk|ipa}`
  - 예: `jigumiya-1.0.1-11.aab` (프로덕션), `jigumiya-1.0.1-10-dev.apk` (개발)
- 저장 위치:
  - Android: `~/jigumiya/builds/android/` (AAB, APK)
  - iOS: `~/jigumiya/builds/ios/` (IPA)
- .gitignore에 포함 — 빌드 파일은 커밋하지 않음

## 버전 관리 정책 (2026-04-19 변경)
- `eas.json` `appVersionSource: "local"` — `app.config.js`가 진실 원천, EAS remote 값 무시
- `production.autoIncrement` 제거 — 실패 빌드가 버전을 먹지 않음 (이전에는 실패해도 증가했던 함정 제거)
- 버전 bump 시 수정 대상:
  1. `app.config.js` — `version`, `ios.buildNumber`, `android.versionCode`
  2. `android/app/build.gradle` — `versionCode`, `versionName` (gitignored, 로컬 동기화만)
- `android/`가 로컬에 존재하면 prebuild 스킵되어 `build.gradle` 값이 최종 사용됨 → 양쪽 동기화 필수
- Play Store / App Store는 단조 증가만 허용 — 다운그레이드 불가

## 로컬 빌드 주의사항 (Android)
- 빌드 전 `app.config.js` `android.versionCode` + `build.gradle` `versionCode`/`versionName` 동기화 확인
- 빌드 파일명은 app.config.js versionCode 기준 (예: `jigumiya-1.0.4-36.aab`)
- google-services.json은 .gitignore에 있으므로 `.easignore` 파일을 git 루트(`~/jigumiya/`)에 생성해야 로컬 빌드 시 포함됨
- 빌드 명령: `eas build --local --profile production --platform android`

## 로컬 빌드 주의사항 (iOS)
- 빌드 전 `app.config.js` `ios.buildNumber` 확인 (autoIncrement OFF 상태라 자동 증가 없음)
- fastlane 필요 — 미설치 시 `brew install fastlane`
- `GoogleService-Info.plist`도 .gitignore에 있으므로 `.easignore`에서 제외해야 빌드 포함됨 (Android와 동일 `.easignore` 사용)
- `ios/` 네이티브 디렉토리가 이미 있으면 prebuild 스킵됨 — 네이티브 설정 변경 시 `ios/` 삭제 후 재빌드
- 빌드 명령: `eas build --local --profile production --platform ios`
- 결과물: app-store 서명된 IPA → Transporter로 App Store Connect 수동 업로드 (`eas submit` 금지 — §017 §12 빌드/배포 정책)

## 형제 앱
- 지금이야와 아이고(~/aigo/aigo)는 형제 앱 관계
- 동일 개발자, 동일 기술 스택 (React Native, Expo, Firebase)
- 한 앱에서 해결한 문제/노하우는 다른 앱에 이식 가능
- 로컬 빌드 세팅, Firebase 구조, 파트너스 API 등 공유
- **cron 스케줄 충돌 없음 확인 (2026-04-20)**: 지금이야(08/14/21 KST 3회) ↔ 아이고(07/10/13/16/19/22 KST 6회) — 동시 시간대 겹침 없음 → 분당 50회 한도 합산 우려 해소
- **공통 이슈**: 파트너스 실적 미집계(쿠팡 공유 링크 구조) — 아이고도 AQ-4로 동일 확인 → Firebase Functions Resolver(018) 해결책을 아이고도 동일 방식으로 적용 예정
- **Firebase 프로젝트 통합 검토**: jigumiya 프로젝트 기반으로 아이고 통합 — **아이고 베타 출시 이후 진행 합의** (2026-04-20)
- **아이고 전용 설계**: `baby_category` 월령별 구조는 아이고 측에서 별도 설계 (지금이야 범위 외)
- 장기: 파트너스 계정 2개로 키 분리 검토 (현 시점엔 불필요)

## 앱 기본 정보
- 앱 이름: 지금이야 (Jigumiya)
- 번들 ID: com.jigumiya.app
- 프로젝트 경로: ~/jigumiya/jigumiya
- Expo 계정: june56189906
- GitHub: Tegisee/jigumiya
- 터미널 단축명령: ji (→ Max Plan으로 자동 접속)

