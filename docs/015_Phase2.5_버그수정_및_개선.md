# Phase 2.5 — 버그 수정 및 기능 개선

## 현재 진행 상태 (2026.03.31)

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

### 알려진 이슈
- iOS 첫 번째 상품 등록 시 자동 재시도 필요 (30초 타임아웃 → 자동 재시도 1회)
- iOS 상품 등록 시 쿠팡 앱으로 일시 이동 (Universal Link, 돌아오면 자동 처리)
- 가격 매칭: vendorItemId 매칭 불가 (쿠팡파트너스 API 한계), productId + 30% 안전장치로 대응
- App Store 스크린샷 업로드 오류 지속 (Apple 지원팀 케이스 102845214001 응답 대기)
- 그래프 Y축 가격대 미표시 문제
- 일부 상품 가격 조회 실패 (productId 매칭 실패 또는 가격 변동 30% 초과로 스킵)

### 다음 빌드 때 구현 (Phase 2.5 잔여)
- [ ] 그래프 Y축 가격대 표시 수정
- [ ] 스와이프 삭제 (왼쪽으로 밀면 삭제 버튼)
- [ ] 길게 눌러서 삭제 버튼 생성
- [ ] 삭제 전 확인 다이얼로그
- [ ] 위 수정 후 iOS + Android 동시 빌드

### 대기 중
- [ ] Apple 답변 후 App Store 스크린샷 오류 해결 → 심사 제출 (케이스 102845214001)
- [ ] Google Play 공개 출시 준비

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
- 빌드 22: 1.0.1 (Auth UID 복원 + Android Firebase 설정 + 알림 로직 개선) ← 현재 최신
