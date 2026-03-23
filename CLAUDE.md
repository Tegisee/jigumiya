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
| 013 | 쿠팡 파트너스 API 연동 | ✅ | 013_쿠팡파트너스API_활성화.md |

### Phase 3
| 번호 | 작업 | 상태 | sub MD |
|------|------|------|--------|
| 014 | Phase 3 전체 계획 | ⬜ | 014_Phase3계획.md |

### TODO (미정)
- [ ] 메인 화면에 쿠팡 이동 버튼 추가 (위치/형태 미정)
- [x] 쿠팡 공유하기 진입 시 쿠팡 앱 이탈 버그 수정 (CoupangScraper URL resolve + Universal Link 차단)

## 수익모델: 쿠팡 파트너스 단일 전략
- 수수료: 3~10% (구매 발생 시 자동 수취)
- ✅ 파트너스 최종 승인 완료 — API Access Key / Secret Key 발급됨
- EAS Secrets에 EXPO_PUBLIC_COUPANG_ACCESS_KEY / SECRET_KEY 등록 완료
- API 딥링크 정상 작동 확인 (link.coupang.com/re/... 형태)
- 코드: services/coupangApi.ts (HMAC 서명 + 딥링크 + 상품 검색), services/config.ts (키 초기화)

## 현재 상태: 실기기 테스트 + 스토어 배포 진행 중
- iOS: TestFlight 업로드 완료 — Apple 케이스 102845214001 답변 대기 중
- Android: Google Play 비공개 테스트 진행 중 (테스터 모집 중, 14일 필요)
- 온보딩 화면 추가 완료 (3단계: 쿠팡 찾기 → 공유 → 가격 추적)
- Firestore 및 앱 데이터 초기화 완료
- 카테고리: 쇼핑/유틸리티, 연령등급: 4+
- 개인정보처리방침: https://dafamstore.tistory.com/9
- GitHub 레포: https://github.com/Tegisee/jigumiya (private)
- 빌드 전 개발 서버(npx expo start)로 테스트 먼저 진행할 것
- 내일 확인: 오전 8시 GitHub Actions 자동 실행 → priceHistory 데이터 누적 확인

## 주요 기술 현황
- 서버사이드 가격 체크: scripts/price-checker/ (파트너스 API 검색 → Firestore 업데이트 → Expo Push)
  - ✅ Puppeteer 삭제 → 파트너스 API searchProducts()로 교체 완료
  - ✅ GitHub Actions 정상 실행 확인 (Access Denied 해결)
  - GitHub Actions cron: 08:00/14:00/21:00 KST (3회/일)
  - Secrets 등록 완료: FIREBASE_SERVICE_ACCOUNT_KEY, COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY
- 클라이언트: CoupangScraper (WebView DOM 스크래핑) — 상품 추가 시 + 수동 새로고침
  - ✅ iOS Universal Link 이탈 버그 수정: fetch로 HTML 획득 → WebView에 html 문자열 로드 (네트워크 탐색 없음)
  - 타임아웃 20초, 단계적 재시도(2초/4초/6초), 실패 시 "다시 시도" 버튼
- 앱 내 딥링크 변환: coupangApi.ts generateDeepLink() (클라이언트 HMAC)

## 앱 기본 정보
- 앱 이름: 지금이야 (Jigumiya)
- 번들 ID: com.jigumiya.app
- 프로젝트 경로: ~/jigumiya/jigumiya
- Expo 계정: june56189906
- GitHub: Tegisee/jigumiya
- 터미널 단축명령: ji (→ Max Plan으로 자동 접속)

# currentDate
Today's date is 2026-03-15.

      IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.
