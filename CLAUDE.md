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

### Phase 3
| 번호 | 작업 | 상태 | sub MD |
|------|------|------|--------|
| 014 | Phase 3 전체 계획 | ⬜ | 014_Phase3계획.md |

### 참고 문서 (작업 리스트 외)
- 012_Phase2계획.md — Phase 2 초기 기획 문서 (이력 보존)

### TODO (미정)
- [ ] 메인 화면에 쿠팡 이동 버튼 추가 (위치/형태 미정)
- [x] 쿠팡 공유하기 진입 시 쿠팡 앱 이탈 버그 수정 (CoupangScraper URL resolve + Universal Link 차단)

## 수익모델: 쿠팡 파트너스 단일 전략
- 수수료: 3~10% (구매 발생 시 자동 수취)
- ✅ 파트너스 최종 승인 완료 — API Access Key / Secret Key 발급됨
- EAS Secrets에 EXPO_PUBLIC_COUPANG_ACCESS_KEY / SECRET_KEY 등록 완료
- API 딥링크 정상 작동 확인 (link.coupang.com/re/... 형태)
- 코드: services/coupangApi.ts (HMAC 서명 + 딥링크 + 상품 검색), services/config.ts (키 초기화)

## 현재 상태: iOS/Android 알림 정상화 완료 + 스토어 배포 진행 중
- iOS: 알림 정상 수신 ✅ — App Store 심사 제출 대기 (스크린샷 오류, Apple 케이스 102845214001 — Tina에게 추가 자료 포함 재문의 완료)
- Android: 알림 정상 수신 ✅ — Expo FCM V1 서비스 계정 키 등록 완료
- Google Play 프로덕션 액세스 신청 완료 (2026.04.01, 7일 내 결과)
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
- 클라이언트: CoupangScraper (WebView DOM 스크래핑) — 상품 추가 시 + 수동 새로고침
  - ✅ iOS Universal Link 이탈 버그 수정: fetch로 HTML 획득 → WebView에 html 문자열 로드 (네트워크 탐색 없음)
  - 타임아웃 20초, 단계적 재시도(2초/4초/6초), 실패 시 "다시 시도" 버튼
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

## 앱 기본 정보
- 앱 이름: 지금이야 (Jigumiya)
- 번들 ID: com.jigumiya.app
- 프로젝트 경로: ~/jigumiya/jigumiya
- Expo 계정: june56189906
- GitHub: Tegisee/jigumiya
- 터미널 단축명령: ji (→ Max Plan으로 자동 접속)

