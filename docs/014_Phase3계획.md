# 013. Phase 3 계획

## 목표
멀티 플랫폼 + 수익 확장

## 할 일
1. 카카오/애플 로그인 (데이터 복구용, 선택적)
2. 알리익스프레스 확장
3. 네이버쇼핑 확장
4. 프리미엄 플랜 (상품 20개 초과)
5. Android 정식 배포
6. 상품 공유 시 앱 다운로드 문구 제거 → 쿠팡 링크만 전송
7. 별도 앱 공유 버튼 추가 (설정 페이지 또는 홈 화면)
   - "지금이야 앱 공유하기" 버튼
   - 자연스러운 입소문 유도
8. shared_products 구조 도입
   - 동일 상품을 추적하는 유저 간 Firestore 공유
   - 쿠팡 API 호출 최소화 (상품 단위 1회 조회 → 전체 구독자 반영)
   - 가격 체크는 shared_products 단위로 실행 (유저별 items 순회 → shared 순회)
   - subscriberCount로 구독자 수 관리, 0이 되면 문서 삭제
   - 예상 구조:
     ```
     shared_products/{productId}
     ├── url: string
     ├── resolvedUrl?: string
     ├── productId: string
     ├── vendorItemId?: string
     ├── productName: string
     ├── currentPrice: number
     ├── thumbnail: string
     ├── priceHistory: { date: string, price: number }[]
     ├── subscriberCount: number
     └── lastCheckedAt: string
     ```
9. 알림 개인화 설정
   - 온보딩에서 알림 시작/종료 시간 설정
   - Firestore users/{uid}에 notificationStartHour / notificationEndHour 저장
   - 가격 체크는 서버 고정 스케줄 (06:00~21:00 KST, 1시간 간격)
   - 알림 발송만 유저별 설정 시간 기준으로 필터링

## 비고
- shared_products 및 알림 개인화 작업은 아이고 앱 비공개 테스트 승인 후 아이고에서 먼저 검증하고 지금이야에 적용 예정
- 앱 공유 버튼은 설정 화면에서 홈(추적 목록) 화면 우측 상단으로 위치 변경 필요 (미작업)
- 인기상품 추천 기능: 쿠팡 파트너스 API로 인기상품 랭킹 조회 불가 (크롤링 금지 원칙), shared_products 도입 후 구독자 수가 많은 상품을 앱 내 인기상품으로 표시하는 방식으로 구현 예정
