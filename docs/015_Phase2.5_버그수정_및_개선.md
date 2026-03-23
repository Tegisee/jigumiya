# Phase 2.5 — 버그 수정 및 기능 개선

## 상태: ✅ 완료 (2026.03.23)

## 배경
- iOS TestFlight + Android 실기기 테스트 중 발견된 버그 및 UX 개선사항
- 쿠팡파트너스 수익 구조 강화를 위한 기능 추가
- Claude AI + Gemini AI 3자 검토 완료

## 작업 목록

### 1. [버그] GitHub Actions + FCM 알림 디버깅 — ✅
- 원인: 파트너스 API 코드 미push + limit 초과 + 상품명 매칭 오류
- 해결: 스크래퍼→API 교체, limit 20→5, 구두점 제거 매칭, score 임계값
- productId 정확 매칭 + 30% 가격 변동 안전장치 추가

### 2. [버그] 저장 후 네비게이션 수정 — ✅
- Share Intent 경로에서 router.replace('/') 사용 (쿠팡 복귀 방지)

### 3. [개선] 가격변동 그래프 + 안내문구 — ✅
- 데이터 1개: 현재가 크게 + "매일 3회 가격을 확인합니다"
- 무변동: "최근 N일간 가격변동이 없었습니다"
- x축 라벨: MM/DD 날짜 형식

### 4. [개선] 상품추가 시 2단계 플로우 — ✅
- 1단계: URL 입력 → "다음"
- 2단계: 현재가 표시 + 추천 목표가(90%) → 저장
- iOS: 4초 안내 딜레이 + 쿠팡 앱 복귀 대기 (Universal Link 우회 불가)

### 5. [개선] 스마트 알림 (4종 분기) — ✅
- 목표가 도달 / 가격 하락 / 역대 최저가 / 7일 무변동
- 일간 요약 알림 제거, 스마트 알림으로 통합

### 6. [개선] 파트너스 필수 문구 노출 — ✅
- 홈 리스트 하단 + 상세 화면 스크롤 콘텐츠 내

### 7. [신규] 온보딩 화면 — ✅
- 4단계 인터랙티브 시뮬레이션 (앱소개/공유버튼/공유시트/완료)
- MOCK_DATA 전체 제거

### 8. [신규] 가격 알림 공유 기능 — ✅
- 상세 화면 구매 버튼 옆 공유 아이콘 (제휴 딥링크 포함)

### 9. [신규] 위시리스트 공유 → 앱 공유로 변경 — ✅
- STORE_LINKS 설정 시에만 공유 버튼 표시
- 출시 후 스토어 URL 추가하면 자동 활성화

### 10. [신규] 골드박스/특가 섹션 — ✅
- 홈 화면 상단 고정, 컴팩트 가로 스크롤
- AsyncStorage 캐싱 (앱 재시작 시에도 표시)

## 추가 완료 항목

### Android 크래시 해결 — ✅
- 원인: CoupangScraper의 dataDetectorTypes="none" (iOS 전용 prop)이 Android Fabric에서 SIGSEGV
- 해결: Platform.OS === 'ios' 조건부 적용

### iOS 스크래핑 — ✅ (Universal Link 우회 불가, 대안 적용)
- iOS에서 WebView가 coupang.com 로드 시 Universal Link 트리거 → 쿠팡 앱 열림
- 시도한 방법: fetch+regex, WebView내 JS fetch, User-Agent 변경, about:blank → 모두 실패
- 최종 방식: WebView 스크래핑 허용 + 쿠팡 앱으로 튕긴 후 돌아오면 자동 완료
- 4초 안내 딜레이 + "정보 없이 진행" fallback
- 첫 실패 시 자동 재시도 1회 (WebView 콜드 스타트 대응)

### Share Intent 수정 — ✅
- _layout.tsx에 ShareIntentHandler 추가 (shareintent 화면 미마운트 대응)
- processingRef로 중복 처리 방지

### 제휴 딥링크 생성 수정 — ✅
- 원인: 딥링크 API가 link.coupang.com/a/... 단축 URL 거부 (400 에러)
- 해결: scraped.resolvedUrl (www.coupang.com/vp/...) 사용
- "추적상품 가져오기" 버튼도 제휴 딥링크로 변경

### 가격 매칭 정확도 개선 — ✅
- productId 정확 매칭만 허용 (상품명 유사도 매칭 제거)
- 가격 변동 30% 초과 시 업데이트 스킵
- TrackedItem에 productId/vendorItemId 필드 추가
- 서버사이드: 상품명/이미지 자동 보충 (정보 없이 저장된 상품)

### 고아 데이터 자동 정리 — ✅
- FCM DeviceNotRegistered 토큰 → 유저+상품 자동 삭제
- 30일 이상 비활성 유저 자동 정리 (21시 KST)
- lastActiveAt 추적 (토큰 등록/동기화 시 갱신)

### UI 개선 — ✅
- 골드박스 상단 고정 + "가격 추적 중 N개" 섹션 헤더
- 상세 화면 SafeArea bottom 추가
- 파트너스 문구 시인성 개선
- Android adaptive icon 수정
- URL 자동 추출 (붙여넣기 시 텍스트에서 URL만 추출)

## 출시 후 TODO
- [ ] 앱 공유하기 버튼 활성화: services/config.ts의 STORE_LINKS에 스토어 URL 추가
  - STORE_LINKS.ios: App Store URL
  - STORE_LINKS.android: Google Play URL
