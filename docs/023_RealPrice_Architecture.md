# 023. RealPrice 아키텍처 설계 (2026-05-10 논의)

## 배경
- 파트너스 API가 즉시할인 미반영 정가(apiPrice) 반환
- WebView만 실제 판매가(realPrice) 정확히 가져올 수 있음
- 두 가격 불일치로 false positive 알림 + 그래프 부정확 발생

## Firestore 구조 변경
shared_products/{productId}에 필드 추가:
- apiPrice: cron이 업데이트 (참고용만, 알림/그래프 기준 아님)
- realPrice: 앱 WebView가 업데이트 (알림/그래프 기준)
- priceHistory: realPrice 기준으로만 기록 ({ date, realPrice })
- lastRealPriceUpdatedAt: 마지막 WebView 업데이트 timestamp
- needsCheck: cron이 apiPrice 큰 변동 감지 시 true로 설정

## 역할 분담
- cron (GitHub Actions): apiPrice 업데이트 + needsCheck 플래그 + 골드박스/이벤트 유도 알림
- 앱 WebView: realPrice 업데이트 → shared_products write
- Cloud Functions: realPrice onUpdate 트리거 → 목표가 도달 시 알림 발송
- 관리자 기기 2대: 전체 shared_products 자동 순회

## 관리자 기기 설계
기기: 안드로이드 + 아이패드 2대 (아이폰 제외)

분배 방식: 홀수/짝수 인덱스 기준
- 기기 A (안드로이드): index % 2 === 1 (홀수)
- 기기 B (아이패드): index % 2 === 0 (짝수)
- 기기 3대로 늘어나면: index % 3 === 0/1/2

동작:
1. 관리자 모드 진입
2. Firestore shared_products 전체 목록 조회
3. 홀수/짝수 필터링으로 담당 상품 결정
4. 각 상품 WebView 로드 → realPrice 파싱 (상품당 3~5초)
5. shared_products.realPrice 업데이트
6. N분마다 자동 반복

소요 시간: 100개 기준 기기당 2~3분 (3~5초/개 × 50개)

## 앱 코드 변경 사항

### 1A — 상품 추가 시 shared_products 과거 이력 가져오기
- addItem 시 getSharedProduct(productId) 조회
- 존재하면 priceHistory + lowestPrice/highestPrice 머지
- 신규 사용자도 과거 그래프 즉시 표시

### 1B — WebView 새로고침 시 shared_products.realPrice write
- updateItemPrice 호출 시 shared_products.realPrice도 동시 업데이트
- cron은 lastRealPriceUpdatedAt 확인 → 최근 WebView 업데이트 있으면 가격 skip

### 3 — 앱 mount 시 syncFromFirestore 1회 호출
- 앱 첫 실행 시 즉시 shared_products 머지

### 관리자 모드 UI
- 특정 uid 또는 설정값으로 관리자 판별
- 전체 shared_products 자동 순회 화면
- 진행 상황 표시 (N/전체 완료)
- 홀수/짝수 자동 분배
- N분마다 자동 반복

## 알림 구조 변경

현재: cron → apiPrice 기준 → 알림 (false positive 발생)

변경 후:
- cron → apiPrice 큰 변동 감지 → needsCheck: true 플래그
- 골드박스/이벤트 업데이트 → 앱 오픈 유도 알림
- 사용자/관리자 기기 앱 열음 → WebView realPrice 업데이트
- Cloud Functions → realPrice 변경 감지 → 목표가 도달 시 정확한 알림

## 작업 순서

### 1.0.16
1. shared_products에 apiPrice/realPrice/lastRealPriceUpdatedAt/needsCheck 필드 추가
2. 앱 코드 1A + 1B + 3 수정
3. Cloud Functions onUpdate 트리거 추가
4. cron 알림 로직 변경 (골드박스 유도 알림)
5. 관리자 모드 UI 구현

### 1.0.17 이후
- 사용자 앱 오픈 시 타인 상품 3~5개 추가 업데이트 (크라우드소싱)
- 관리자 기기 자동 분배 로직 고도화

## 참고
- Gemini 세컨드 오피니언: 클라이언트 주도형 크라우드소싱 구조 권장
- Coupang Affiliate API 한계 확정: 단건 조회 없음 + 즉시할인가 필드 없음
- 백그라운드에서 WebView 없이 실제 판매가 가져오는 방법 없음 (기술적 한계)
