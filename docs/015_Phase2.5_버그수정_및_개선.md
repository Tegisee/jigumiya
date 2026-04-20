# Phase 2.5 — 버그 수정 및 기능 개선

## 현재 진행 상태 (2026.04.15)

### 완료된 작업
- ✅ GitHub Actions + FCM 알림 디버깅 (스크래퍼→API 교체)
- ✅ 저장 후 네비게이션 수정 (Share Intent router.replace)
- ✅ 가격변동 그래프 + 무변동 안내문구
- ✅ 상품추가 시 현재가 표시 + 추천 목표가 (2단계 플로우)
- ✅ 스마트 알림 4종 (하락/도달/최저가/무변동)
- ✅ 파트너스 필수 문구 노출
- ✅ 온보딩 화면 (4단계 인터랙티브)
- ✅ 가격 알림 공유 기능
- ✅ 위시리스트 공유 → 앱 공유로 변경 (스토어 링크 없을 때 숨김)
- ✅ 골드박스/특가 섹션 (상단 고정 컴팩트)
- ✅ 추적상품 가져오기 버튼 (쿠팡 앱 우선 실행)
- ✅ 홈 화면 "가격 추적 중" 카테고리 제목
- ✅ Android 크래시 해결 (dataDetectorTypes iOS 분기)
- ✅ iOS Universal Link 대응 (4초 안내 딜레이 + 자동 재시도)
- ✅ URL 자동 추출 (붙여넣기 시 상품명 제거)
- ✅ 고아 데이터 자동 정리 (FCM 토큰 만료 + 30일 비활성)
- ✅ 가격 매칭 근본 개선 (productId 정확 매칭 + 30% 안전장치)
- ✅ Android 아이콘 수정
- ✅ 제휴 딥링크 생성 수정 (resolvedUrl 사용 + handleSave 재시도)
- ✅ 추적상품 가져오기 제휴 링크로 변경
- ✅ 알림 미수신 근본 원인 수정: Firebase Auth UID 불일치 (onAuthStateChanged 복원 대기)
- ✅ Android Firebase 설정: google-services.json + appId 플랫폼별 분기
- ✅ app.json → app.config.js 변환 (EAS Secret 파일 참조)
- ✅ 알림 로직 개선: 가격 무변동 시 매 체크마다 no_change 알림 발송
- ✅ price_drop 오탐 방지: trimmed.length >= 2 조건 추가
- ✅ 만료 토큰 cleanup 개선: 유저 전체 삭제 → expoPushToken 필드만 제거
- ✅ iOS 알림 정상 수신 확인 (2개 상품 모두)
- ✅ App Store Connect: 대한민국 단일 국가로 변경, 6.9" 스크린샷 업로드 시도
- ✅ Expo 대시보드 FCM V1 서비스 계정 키 등록 완료
- ✅ Android 알림 정상 수신 확인
- ✅ iOS/Android 양쪽 알림 완전 정상화 확인
- ✅ GitHub Actions Node.js 20 → 24 업그레이드
- ✅ 앱 홍보용 숏츠 소재 준비 (스크린샷 + 앱아이콘 + 지금이야 글자 이미지)
- ✅ 공유하기 기능 개선 방향 결정: 상품 공유 시 앱 다운로드 문구 제거, 별도 앱 공유 버튼 추가 예정
- ✅ Google Play 프로덕션 액세스 신청 완료 (2026.04.01, 7일 내 결과)
- ✅ App Store 6.9인치 스크린샷 1320x2868 재캡처 (Xcode 시뮬레이터 iPhone 16 Pro Max, xcrun simctl)
- ✅ App Store Connect Safari 재시도 → 동일 오류 지속, Apple Tina에게 추가 자료 포함 재문의 (오류화면 캡처 + IPA Google Drive 링크)
- ✅ 홍보용 숏츠 소재 준비 완료 (스크린샷 6장 + 앱아이콘 + 지금이야 글자 이미지)
- ✅ 앱 공유 기능 개선 방향 확정: 상품 공유 시 앱 다운로드 문구 제거, 별도 앱 공유 버튼 추가

### 알려진 이슈
- iOS 첫 번째 상품 등록 시 자동 재시도 필요 (30초 타임아웃 → 자동 재시도 1회)
- iOS 쿠팡 앱 열기 팝업 1회 잔존 (Universal Link) — 안내문구 "쿠팡 앱이 열리면 지금이야 앱으로 돌아와서 계속해주세요." (2026-04-19 변경: 취소 유도 → 복귀 유도)
- 가격 매칭: vendorItemId 매칭 불가 (쿠팡파트너스 API 한계), productId + 30% 안전장치로 대응
- 그래프 Y축 가격대 미표시 문제
- 일부 상품 가격 조회 실패 (productId 매칭 실패 또는 가격 변동 30% 초과로 스킵)
- 🔍 원인 확정 (2026-04-20): `link.coupang.com/a/...` URL이 iOS Universal Link 흡수로 resolve 실패 → `/vp/` 조건 불통과 → `generateDeepLink` 미호출 → 원본 URL 저장으로 수수료 트래킹 끊김 (상세: docs/010 §파트너스 실적 미집계 원인 확정)

### 2026.04.13 작업 완료
- ✅ 스와이프 삭제 (왼쪽으로 밀면 삭제 버튼) — 아이고에서 이식, PanResponder + Animated
- ✅ 길게 눌러서 삭제 오버레이 + 삭제 버튼 — 아이고에서 이식
- ✅ 삭제 전 확인 다이얼로그 (Alert.alert)
- ✅ 쿠팡 앱 다운로드/열기 배너 CSS 차단 (CoupangScraper BLOCK_DEEPLINK_JS에 추가)
- ✅ Android 로컬 빌드 완료: jigumiya-1.0.1-17.aab (versionCode 17, EAS remote 18)
- ✅ iOS 로컬 빌드 완료: jigumiya-1.0.1-23.ipa (buildNumber 23, App Store 심사 제출 완료)
- ✅ 로컬 빌드 환경 세팅: .easignore + fastlane 설치, CLAUDE.md에 주의사항 기재

### 2026.04.15 작업 완료
- ✅ iOS 1.0.1 App Store 정식 출시 완료
- ✅ iOS 1.0.2 심사 제출 (buildNumber 28) — 쿠팡 튕김 개선 포함
- ✅ Android 1.0.1 프로덕션 승급 제출 (versionCode 17)
- ✅ iOS 쿠팡 튕김 2~3회 → 1회 개선: onShouldStartLoadWithRequest coupang/coupangapp 딥링크 차단, allowsBackForwardNavigationGestures={false}
- ✅ iOS 상품 추가 시 resolved URL + HTML fetch 방식 전환 (link.coupang.com 직접 로드 제거, 4초 딜레이 제거)
- ✅ BLOCK_DEEPLINK_JS에 coupangapp:// 스킴 추가
- ✅ coupang.com 도메인 명시적 WebView 내 처리 (Universal Link 팝업 방지)
- ✅ iOS 대기 안내문구 변경: "쿠팡 앱이 열리면 확인 후 돌아와주세요" → "쿠팡 앱 열기 팝업이 뜨면 '취소'를 눌러주세요"
- ✅ 앱 버전 1.0.1 → 1.0.2 업데이트

### 2026.04.19 작업 완료 (1.0.4 패치)
> Phase 3-D MVP 구조(017 §참고)는 `docs/017_앱구조개편_Phase3.md` 참조. 여기에는 2.5 범위의 버그픽스 + UX 개선만 기록.

- ✅ 뱃지 카운트 초기화: `Notifications.setBadgeCountAsync(0)` → `services/notifications.ts` `clearBadgeCount` + `_layout.tsx` mount + AppState active 전환 시 호출
- ✅ 홈 카드 하트 버튼 시인성 개선: 32×32 원형 반투명(rgba 0,0,0,0.45) 배경, 비활성 색상 #ffffff로 대비 확보
- ✅ 홈 카드 상품명 `paddingRight: 40` — 2줄 상품명이 하트 버튼과 겹치지 않도록 (Galaxy S20 기준 약 11~13자/줄)
- ✅ 자주사는 탭 X버튼 → 왼쪽 스와이프 삭제로 변경 (홈 카드 PanResponder 패턴 이식)
- ✅ iOS 쿠팡 앱 안내문구 재변경: "쿠팡 앱 열기 팝업이 뜨면 '취소'를 눌러주세요" → "쿠팡 앱이 열리면 지금이야 앱으로 돌아와서 계속해주세요." (쿠팡 앱 실행 허용 + 복귀 유도로 전환)
- ✅ `modal/add-item.tsx` 하드코딩 20개 제한 제거 → `MAX_TRACKED_ITEMS` 참조로 통일 (store 가드와 일치)
- ✅ `useFavoriteToggle` 훅 추출 — 상세화면/홈 카드가 동일 토글 로직 공유 (Phase 3-D §하트 부분)
- ✅ 앱 버전 1.0.3 → 1.0.4
- ✅ 버전 관리 방식 전환: `appVersionSource: remote → local`, `autoIncrement` 제거 → `app.config.js`가 진실 원천, 실패 빌드가 버전 먹는 문제 해결
- ✅ iOS buildNumber 35 / Android versionCode 35→36 고정 (app.config.js + build.gradle)

#### 1.0.4 검증 대기
- [ ] 뱃지 초기화 실기기 확인 — 푸시 알림 수신 후 앱 foreground 전환 시 뱃지 제거 여부
- [ ] **파트너스 실적 검증 — 2026-04-21 15:00 KST 이후 확인** (가족 계정으로 구매 테스트 진행 중, 공유 링크 경유 → 실적 집계 여부)
- [ ] `673c601` 임시 수정 로그 확인 — `link.coupang.com/a/...` 입력 시 `[CoupangAPI] 딥링크 응답: <rCode>` 값으로 `/deeplink` API 성공률 판단

### 2026.04.20 추가 수정 (1.0.4 bn37/vc37)
- ✅ `add-item.tsx` `generateDeepLink` 호출 조건 확장: `/vp/` `/vm/` → `coupang.com` 포함 (`673c601`)
  - 원인: `link.coupang.com/a/...` URL이 iOS Universal Link 흡수로 resolve 실패 → `/vp/` 조건 불통과로 딥링크 미생성
  - 한계: `link.coupang.com/a/...`를 직접 `/deeplink` API에 넣으면 실패 가능성 높음 — 로그로 성공률 검증 필요
  - 근본 해결책: Firebase Functions 서버사이드 resolve (Phase 3-C 병합 검토, 상세: docs/010)
- ✅ iOS buildNumber 35 → 37, Android versionCode 36 → 37 통일 (`cdfa7b5`)

### 다음 빌드 때 구현 (Phase 2.5 잔여)
- [ ] 그래프 Y축 가격대 표시 수정

### 대기 중
- [ ] App Store 1.0.2 심사 결과 대기 (buildNumber 28, 2026.04.15 제출)
- [ ] Android 1.0.1 프로덕션 승급 승인 대기 (versionCode 17, 2026.04.15 제출)

### 출시 후 TODO
- [ ] 앱 공유하기 버튼 활성화: services/config.ts STORE_LINKS에 스토어 URL 추가
- [ ] 온보딩 플로우 강화: 첫 실행 시 앱 핵심 가치 전달 개선
  - 1단계: "쿠팡 가격은 하루에도 몇 번씩 바뀌어요"
  - 2단계: "목표가 설정하면 최저가 될 때 알려드려요"
  - 3단계: "지금 바로 관심 상품 추가해보세요"
- [ ] iOS 스크래핑 개선: vendorItemId 매칭 가능한 API 확인 시 추가
- [ ] 검색 API 연동 → 유사 상품 추천 (다음 Phase)
- [ ] 홈 대시보드 리디자인 (다음 Phase)
- [ ] 프리미엄 구독 모델 검토 (사용자 1만명+)
- [ ] **알림 로직 최적화**: 하루 3회 가격 체크 중 1~2회차는 DB 갱신만, 마지막(21:00 KST) 회차에만 알림 발송 → 유저 알림 피로 감소 (상세: docs/010 §향후 최적화 아이디어)
- [ ] **아이고 스케줄 분리**: 동일 파트너스 API 키 공유 구조에서 동시 실행 시 분당 50회 한도(`/products/search`) 합산 위험 → 지금이야(08/14/21) ↔ 아이고(09/15/22)로 1시간 어긋나게 조정 (상세: docs/010 §형제 앱 동시 실행 리스크)

### 빌드 관리
- EAS Starter 플랜 가입 완료 ($19/월)
- 빌드 산출물: ~/jigumiya/builds/android/, ~/jigumiya/builds/ios/
- API 키 노출 방지: 빌드/테스트는 터미널에서 직접, Claude Code는 코드 작성만

### 스크린샷
- 경로: ~/jigumiya/"jigumiya screen"/
- 65inch (1242x2688), 69inch (1320x2868) 등 모든 사이즈 준비 완료
- App Store 메타데이터: docs/016_AppStore_메타데이터.md 참고

## 제휴 링크 상태 (2026.03.24)

### 확인된 사항
- ✅ 개발 빌드에서 제휴 딥링크 생성 성공 확인 (link.coupang.com/a/d94Wv9)
- ✅ handleNext에서 fetch resolve + generateDeepLink 선행 생성 방식으로 수정
- ✅ resolvedUrl(www.coupang.com) 사용 시 딥링크 API 정상 응답 (rCode=0)
- ✅ 쿠팡 앱으로 열려도 제휴 쿠키는 서버에 기록됨 (제미나이 확인)
- ✅ 브라우저로 강제 전환 불필요 (오히려 구매 전환율 저하)

### 근본 원인이었던 것
- link.coupang.com/a/... (공유 단축 URL)로 딥링크 API 호출 → 400 에러
- www.coupang.com/vp/products/... 으로 변환 후 호출해야 성공
- iOS에서 WebView가 쿠팡 앱으로 튕겨서 resolvedUrl 못 가져오는 문제 → handleNext에서 fetch resolve로 선행 처리

### 주의사항
- 본인 계정 클릭/구매는 수수료 미인정 (자가 구매 금지)
- 가족도 같은 배송지/결제수단이면 자가 구매 판정 가능
- 반복 자가 구매 시 계정 정지 리스크
- 제휴 링크 정상 동작 확인은 지인 테스트 필요 (타인 계정 + 다른 결제수단)

### 다음 단계
- [ ] production 빌드 → TestFlight 외부 테스터 등록 → 지인 테스트
- [ ] 지인 구매 후 다음날 파트너스 대시보드에서 실적 확인
- [ ] App Store 심사 제출 (버전 1.0.1, 스크린샷 재업로드)

## 빌드 이력
- 빌드 17: 1.0.0 (이전 production)
- 빌드 18: 1.0.0 (이전 production)
- 빌드 19: 1.0.1 (제휴 링크 수정)
- 빌드 20: 1.0.1 (제휴 링크 디버그 로그 추가)
- 빌드 21: 1.0.1 (제휴 링크 최종 - handleNext fetch resolve + 딥링크 선행 생성)
- 빌드 22: 1.0.1 (Auth UID 복원 + Android Firebase 설정 + 알림 로직 개선)
- Android vc17: 1.0.1 (스와이프/롱프레스 삭제 + 쿠팡 배너 차단, 로컬 빌드) — 프로덕션 승급 제출 완료
- iOS bn23: 1.0.1 (스와이프/롱프레스 삭제 + 쿠팡 배너 차단, 로컬 빌드) — App Store 정식 출시 완료 ✅
- iOS bn28: 1.0.2 (쿠팡 튕김 개선 + Universal Link 차단 + 안내문구, 로컬 빌드) — App Store 심사 제출
- iOS bn29: 1.0.2 (안내문구 추가, 로컬 빌드) — 테스트용
- 1.0.3: Phase 3-A shared_products 이중 쓰기 + 1.0.2 트레인 갱신 (빌드 산출물 없음, 1.0.4로 건너뜀)
- **1.0.4 (iOS bn37 / Android vc37)**: Phase 3-D MVP + 뱃지 초기화 + 하트 토글 + 스와이프 삭제 + `generateDeepLink` 조건 확장 ← 현재 최신, 로컬 빌드 대상
