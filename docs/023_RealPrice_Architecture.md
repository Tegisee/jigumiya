# 023. RealPrice 아키텍처 설계 (2026-05-10 논의 / 2026-05-11 구현 완료)

> **상태**: ✅ 8개 항목 모두 코드 완료 — 1.0.16 빌드 + 베타 검증 대기.
> CF 트리거 `onSharedProductRealPriceChange`는 이미 프로덕션 배포 + 실제 트리거 발화 검증 완료.


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

### 1.0.16 — 2026-05-11 완료
1. ✅ shared_products에 apiPrice/realPrice/lastRealPriceUpdatedAt/needsCheck 필드 추가 (`types/index.ts` + `services/firebase.ts:trackedItemToSharedProduct` realPrice mirror)
2. ✅ 앱 코드 1A (`store/useAppStore.ts:addItem` async + getSharedProduct 머지), 1B (`updateItemPrice`에 realPrice/lastRealPriceUpdatedAt 역방향 write), 3 (`syncFromFirestore` realPrice 우선 + currentPrice fallback)
3. ✅ Cloud Functions `onSharedProductRealPriceChange` 배포 (asia-northeast3) — 실제 트리거 발화 + tracked 조회 + target 필터 + token-share dedup + needsCheck 클리어 검증 완료
4. ✅ cron 변경 (`scripts/shared-price-checker/index.ts`): lastRealPriceUpdatedAt 1h 가드 + apiPrice mirror + needsCheck 플래그(절댓값 ≥10%) + target_reached 발송 비활성화(주석 처리, CF가 인계)
5. ✅ 관리자 모드 UI (`app/admin.tsx` 신설): isAdmin 기반 진입, Platform.OS 홀수/짝수 분배, sequential WebView 순회, 이어서 진행, wallclock 기반 카운트다운 (AsyncStorage 영속화 + AppState 만료 검사)

추가로:
- iOS 상품 추가 무한로딩 fix: HTML fetch 폐기 → vp URL 직접 로드 통일 + SCRAPE_JS 내부 0.5s × 20회 폴링 + link.coupang.com 차단

### 1.0.17 이후
- 사용자 앱 오픈 시 타인 상품 3~5개 추가 업데이트 (크라우드소싱)
- 관리자 기기 자동 분배 로직 고도화 (3대+ modulo, deviceId hash)
- cron의 주석 처리된 `events.targets.push` / flush 단계 정식 삭제 (베타 검증 후)

## 기존 완료 항목 재검토

본 아키텍처 도입 시 5/10 푸시한 두 fix를 재손질해야 한다. 1.0.16 빌드 전 반드시 같이 처리.

### Issue 1 fix (commit `197d50b`) — realPrice 필드 추가 후 머지 로직 재수정 필요

**현재 (197d50b)**:
- `syncFromFirestore`가 `shared.priceHistory.length > merged.priceHistory.length` 비교 → 더 길면 shared 채택 + `shared.currentPrice` 함께
- TrackedItem.priceHistory: `{ date, price }[]` (단일 price)

**023 도입 후 변경 필요**:
- `shared_products.priceHistory`가 `{ date, realPrice }[]`로 스키마 변경 → 머지 시 형식 변환 필요
- `shared.currentPrice` → `shared.realPrice` 참조 (apiPrice는 그래프/알림 베이스 X)
- TrackedItem 타입도 `priceHistory`의 price 의미를 realPrice로 통일 (또는 필드명 변경 검토)
- length 비교 정책은 유지하되 비교 대상이 realPrice 시리즈여야 함 — apiPrice는 머지에서 무시
- `fetchSharedProductsByIds` 반환 SharedProduct 타입에도 realPrice/apiPrice 분리 반영

**작업**: `services/firebase.ts:fetchSharedProductsByIds` + `store/useAppStore.ts:syncFromFirestore` + `types/index.ts` SharedProduct/TrackedItem 동시 수정. 1A(addItem 머지)와 함께 묶어서 진행하면 일관성 유지.

### Issue 2-A fix (commit `a5dfc5d`) — cron 알림 로직이 Cloud Functions로 대체 예정

**현재 (a5dfc5d)**:
- `shared-price-checker:fetchActiveUsers`에서 tracked 보유 + token-share 시 lastNotif 최신 winner 1개 선정
- cron 본 흐름이 가격 비교 + token당 1 push 발송

**023 도입 후 변경**:
- 알림 발송 주체가 cron → Cloud Functions onUpdate 트리거로 이전 (realPrice 변경 시점에 정확한 알림)
- cron은 apiPrice 갱신 + needsCheck 플래그 + 골드박스/이벤트 유도 알림만 담당 → `fetchActiveUsers` 호출 흐름 자체가 cron에서 사라짐
- token-share winner 정책은 **Cloud Functions 측에 이식** 필요 (uid별 분기 → 같은 token 공유 다중 uid에 push 폭주 방지). 동일한 winner 결정 로직 재사용 가능

**작업 순서 권장**: cron 알림 로직 제거 전에 Cloud Functions 측 onUpdate 트리거 + token-share 가드 먼저 구현/검증. cron 측 코드는 삭제가 아닌 비활성화(workflow_dispatch만 유지)로 단계 전환 → 검증 완료 후 정식 폐기.

**유지되는 자산**:
- `maxLastNotifTime` 헬퍼 + winner 선정 알고리즘 → CF로 이식
- `users/{uid}.lastNotifications` 24h 가드 스키마 → CF에서 동일 read/write
- token dedup 통계 로그 포맷 → CF 로그에 동일 적용

## 참고
- Gemini 세컨드 오피니언: 클라이언트 주도형 크라우드소싱 구조 권장
- Coupang Affiliate API 한계 확정: 단건 조회 없음 + 즉시할인가 필드 없음
- 백그라운드에서 WebView 없이 실제 판매가 가져오는 방법 없음 (기술적 한계)
