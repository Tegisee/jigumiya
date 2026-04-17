# 017. 앱 구조 개편 (Phase 3 신규 방향)

> 본 문서는 기존 `014_Phase3계획.md`를 **완전히 대체**한다.
> 014는 이력 보존 목적으로만 남기고, Phase 3 로드맵은 본 문서를 따른다.

## 핵심 방향
1. **2탭 → 3탭 구조** (홈 / 자주사는상품 / 가격변동)
2. **shared_products** 구조 도입 — 상품 단위 단일 문서 + 구독자 관리
3. **전사용자 가격변동 실시간 피드** — 커뮤니티성 요소 추가
4. **추적 제한 10개 통일** (기존 기본 10 / 와우 20 → 전 사용자 10)
5. **자주사는상품 무제한** — 알림 없는 빠른 구매 리스트

## 문제 정의 (AS-IS)
- 유저마다 `users/{uid}/items`에 동일 상품이 중복 저장됨 → API 호출 N×M배
- "가격 알림받을 상품"과 "자주 사는 상품"이 한 리스트에 섞여 있음 → 알림 과적재
- 전체 유저 관점의 가격 하락 흐름을 볼 수 없음 → 앱 재방문 동기 부족
- 와우 회원 차등 제한이 수익으로 이어지지 않음 (쿠팡 파트너스 수수료가 유일 수익)

---

## 1. 탭 구조 개편

### TO-BE (3탭 + 설정)
| 탭 | 역할 | 제한 | 알림 |
|----|------|------|------|
| 🏠 홈 | 가격 추적 대상 상품 목록 | 10개 | ✅ |
| ⭐ 자주사는상품 | 빠른 구매 즐겨찾기 | 무제한 | ❌ |
| 🔥 가격변동 | 전사용자 가격 하락 실시간 피드 | - | - |

- **설정**은 각 탭 우측 상단 톱니바퀴 아이콘으로 진입 (또는 홈 우측 상단 고정)
- **앱 공유 버튼**은 홈 우측 상단에 배치 (기존 설정 화면에서 이동)

### 파일 구조 변경
```
app/(tabs)/
├── _layout.tsx          ← 3탭 설정
├── index.tsx            ← 홈 (추적)
├── favorites.tsx        ← 자주사는상품 (신규)
└── feed.tsx             ← 가격변동 (신규)
app/
└── settings.tsx         ← 탭 밖으로 이동
```

---

## 2. Firebase 재설계

### 2-1. shared_products (신규 최상위 컬렉션)
```
shared_products/{productId}
├── url: string
├── resolvedUrl: string
├── productId: string
├── vendorItemId?: string
├── productName: string
├── thumbnail: string
├── currentPrice: number
├── lowestPrice: number
├── highestPrice: number
├── priceHistory: [{ date, price }]     ← 최근 90일
├── trackerCount: number                ← 홈 추적 유저 수
├── favoriteCount: number               ← 자주사는 유저 수
├── lastCheckedAt: Timestamp
├── lastPriceDropAt: Timestamp          ← 피드 쿼리용
└── lastDropRate: number                ← % (음수)
```

### 2-2. users/{uid} (기존 개편)
```
users/{uid}
├── expoPushToken: string
├── notificationEnabled: boolean
├── notificationStartHour: number       ← Phase 3-E
├── notificationEndHour: number         ← Phase 3-E
│
├── tracked/{productId}                 ← 홈 (10개 제한)
│   ├── productId: string
│   ├── targetPrice: number
│   └── addedAt: Timestamp
│
└── favorites/{productId}               ← 자주사는상품 (무제한)
    ├── productId: string
    └── addedAt: Timestamp
```

### 2-3. price_drops (신규, 가격변동 피드용 — **무제한 보관**)
```
price_drops/{autoId}
├── productId: string
├── productName: string
├── thumbnail: string
├── prevPrice: number
├── currentPrice: number
├── dropRate: number                    ← 음수 %
├── trackerCount: number
├── deepLink: string                    ← 제휴 딥링크 (바로구매용)
└── createdAt: Timestamp
```
- 쿼리(기본): `where createdAt > now-24h orderBy dropRate asc limit 50`
- 쿼리(전체 이력): `orderBy createdAt desc` 페이지네이션
- **TTL 없음** — 전체 이력 보관 (스토리지 비용 < 데이터 가치)
- 인덱스: `(createdAt desc)`, `(productId, createdAt desc)`, `(dropRate asc, createdAt desc)`

### 2-4. 보안 규칙 추가
```
match /shared_products/{productId} {
  allow read: if request.auth != null;
  allow write: if false;  // 서버(Actions)만 기록
}
match /price_drops/{dropId} {
  allow read: if request.auth != null;
  allow write: if false;
}
```

---

## 3. 가격 체크 로직 개편 (scripts/price-checker)

### AS-IS
```
for each user:
  for each item:
    파트너스 API 호출 → 가격 업데이트 → 알림
```

### TO-BE
```
for each shared_product:
  파트너스 API 1회 호출 → shared_products 업데이트
  if 가격 하락:
    price_drops 기록
    collectionGroup('tracked') where productId == X 쿼리
    각 구독자의 알림 시간대 체크 → Expo Push
  if trackerCount == 0 && favoriteCount == 0 && 7일 경과:
    shared_products 삭제
```

### 효과
- API 호출 수: `유저수 × 상품수` → `고유 상품수` (중복 제거)
- 피드 일관성: 모든 유저가 동일 가격 변동 스냅샷 공유

---

## 4. 추적 제한 정책

- **변경**: 전 사용자 홈 10개 통일 (`MAX_TRACKED_ITEMS = 10`)
- **와우 차등 제거**: `isWowMember` / `toggleWowMember` 로직 정리
- **자주사는상품**: 무제한

### 이유
- 알림 과적재 방지 (10개만 해도 3회/일 × 10 = 하루 30알림 가능)
- 와우 회원 차등이 실질적 수익 기여 없음
- "쟁여두고 싶은 상품"은 자주사는상품으로 이동 가능 → UX 손실 최소

### 11~20개 보유 유저 마이그레이션 UX (자동 이관 + 알림)
**원칙**: 유저 개입 없이 앱 업데이트 후 자동 처리, 결과만 고지.

1. **자동 이관 규칙** (클라이언트 최초 실행 시 1회):
   - 홈 상위 10개 유지 기준: `addedAt desc` (최근 추가 우선)
   - 나머지 N-10개 → `users/{uid}/favorites`로 자동 이동
   - 이관 기록을 `users/{uid}.migrationLog.v3`에 저장 (중복 실행 방지)

2. **결과 고지 (모달 1회)**:
   - 타이틀: "가격 추적 정책이 변경되었어요"
   - 본문: "가격 알림은 최대 10개까지 받을 수 있어요.\n나머지 {N-10}개는 자주사는상품으로 옮겼어요."
   - 이동된 상품 썸네일 나열 (스크롤)
   - 버튼: `[자주사는상품 보기]` `[확인]`

3. **FCM 푸시 알림** (앱 미실행 유저 대상, 배포 +24h 후 발송):
   - 제목: "지금이야 업데이트 안내"
   - 본문: "가격 추적 정책이 변경되었어요. 앱을 열어 확인해주세요."
   - 딥링크: 앱 실행 → 마이그레이션 모달 자동 표시

4. **롤백 옵션 없음** — 이관된 상품은 유저가 수동으로 다시 홈에 올릴 수 있음 (favorites → tracked 버튼)

---

## 5. 가격변동 피드 UX (feed.tsx)

### 구성
- **상단 필터 칩**: 전체 / -10% 이상 / -20% 이상 / 최다 추적
- **카드 리스트**:
  - 썸네일 + 상품명
  - `이전가 → 현재가` + 하락률 뱃지
  - 🔥 `{trackerCount}명이 추적 중`
  - **액션 영역 (2단 버튼)**:
    - `[📊 상세보기]` → `app/detail/[id].tsx` (가격 그래프 + 히스토리)
    - `[🛒 바로구매]` → 제휴 딥링크로 쿠팡 이동 (price_drops.deepLink 또는 shared_products.resolvedUrl 기반 generateDeepLink)
  - 보조 아이콘 버튼: `[＋ 추적]` `[⭐ 자주사는]` (우측 상단 오버플로우)
- **정렬**: 기본 = 최근 24시간 내 하락률 순 / 전체 이력 탭 별도 제공

### 바로구매 동선
1. 탭 → `generateDeepLink(resolvedUrl)` 호출 (캐시 우선)
2. `Linking.openURL(deepLink)` — iOS/Android 모두 쿠팡 앱 우선
3. 제휴 쿠키 서버 기록 (기존 handleSave와 동일 방식)
4. 실패 시 resolvedUrl로 폴백

### 쿼리
```typescript
query(
  collection(db, 'price_drops'),
  where('createdAt', '>', Timestamp.fromMillis(Date.now() - 86400000)),
  orderBy('dropRate', 'asc'),
  limit(30)
)
```
- 페이지네이션: `startAfter` 커서 방식
- 클라이언트 캐시: 5분

---

## 6. 마이그레이션 전략 (단계별 배포)

### Phase 3-A: 스키마 이중화
- [ ] `services/firebase.ts`에 shared_products CRUD 추가
- [ ] 신규 상품 추가 시 `shared_products` upsert + `users/{uid}/tracked` 기록
- [ ] 기존 `users/{uid}/items`는 읽기 전용 유지 (graceful)
- [ ] 클라이언트 배포 (신규 상품부터 신 구조)

### Phase 3-B: 백필 스크립트
- [ ] `scripts/migration/backfill-shared-products.ts`
- [ ] 전 유저 `items` 순회 → `shared_products` 생성 / `trackerCount` 집계
- [ ] `users/{uid}/tracked`에 동일 productId 재기입
- [ ] `items` 컬렉션 유지 (롤백 대비)
- [ ] Firestore export 선행 (gcloud firestore export)

### Phase 3-C: 가격체크 서버 이관
- [ ] GitHub Actions 스크립트를 `shared_products` 순회 방식으로 교체
- [ ] 알림 수신자: `collectionGroup('tracked')` 기준
- [ ] 구 로직은 주석 처리 (즉시 삭제 X)
- [ ] 1주일 이중 관찰 (로그 비교)

### Phase 3-D: 3탭 UI 배포
- [ ] `favorites.tsx`, `feed.tsx` 신설
- [ ] 탭 레이아웃 교체
- [ ] 10개 제한 + 마이그레이션 모달

### Phase 3-E: 알림 개인화 + 안정화
- [ ] 온보딩 시간대 설정 스텝 추가
- [ ] `users/{uid}` 시간대 필드 반영
- [ ] 2주 관찰 후 `users/{uid}/items` 삭제
- [ ] 구 로직 코드 제거

### 롤백 계획
- 각 단계 전 Firestore export
- Phase 3-C 문제 시: `items` 기반 체크 재활성화 + shared_products 쓰기 비활성화
- Phase 3-D 문제 시: 탭 레이아웃만 2탭으로 되돌림 (데이터 스키마는 유지)

---

## 7. 작업 체크리스트 (요약)

### 클라이언트
- [ ] `app/(tabs)/_layout.tsx` 3탭으로 변경
- [ ] `app/(tabs)/favorites.tsx` 신설
- [ ] `app/(tabs)/feed.tsx` 신설
- [ ] `app/settings.tsx` 탭 밖으로 이동 + 진입 경로 재설계
- [ ] `services/firebase.ts` shared_products / tracked / favorites / price_drops CRUD
- [ ] `store/useAppStore.ts` `trackedItems` + `favoriteItems` 분리, `isWowMember` 제거
- [ ] `services/config.ts` `MAX_TRACKED_ITEMS = 10` 통일
- [ ] 홈 우측 상단 앱 공유 버튼 이동
- [ ] 10개 초과 유저용 마이그레이션 모달 UI

### 서버
- [ ] `scripts/migration/backfill-shared-products.ts`
- [ ] `scripts/price-checker` shared_products 기반으로 재작성
- [ ] Firestore 보안 규칙 업데이트
- [ ] price_drops 복합 인덱스 생성 (`createdAt desc` / `(productId, createdAt desc)` / `(dropRate asc, createdAt desc)`)

### 이월 (Phase 4)
- 알리익스프레스 / 네이버쇼핑 확장
- 카카오 / 애플 로그인
- 프리미엄 구독 (유저 1만명+ 시 재검토)

---

## 8. Phase 3-A 세분화 체크리스트

> **목표**: 신규 상품 추가 시 `shared_products` + `users/{uid}/tracked` 이중 쓰기.
> 기존 `users/{uid}/items`는 유지. UI/탭 구조는 건드리지 않음.

### 8-1. 타입 정의 ✅ (2026-04-17)
위치: `types/index.ts` (공용 타입 파일에 배치 — services/firebase.ts 아닌)
- [x] `SharedProduct` — shared_products 스키마
- [x] `TrackedRef` — users/{uid}/tracked 스키마
- [x] `FavoriteRef` — users/{uid}/favorites 스키마
- [x] `PriceDrop` — price_drops 스키마 (Phase 3-C 대비 선반영)

**설계 결정**: 타임스탬프는 `number (ms epoch)` — 기존 `TrackedItem.createdAt`과 일관

### 8-2. Firestore CRUD 함수 (services/firebase.ts) ✅ (2026-04-17)
신규 8개 함수 추가 (기존 5개 무수정):
- [x] `upsertSharedProduct(Partial<SharedProduct> & { productId })` — merge 쓰기
- [x] `getSharedProduct(productId)` — 단건 조회
- [x] `incrementTrackerCount(productId, delta)` — `FieldValue.increment`
- [x] `incrementFavoriteCount(productId, delta)` — `FieldValue.increment`
- [x] `addTrackedRef(uid, productId, targetPrice?)`
- [x] `removeTrackedRef(uid, productId)`
- [x] `addFavoriteRef(uid, productId)` — 자주사는상품(Phase 3-D) 대비 선반영
- [x] `removeFavoriteRef(uid, productId)` — 동일

**주요 설계**:
- `upsertSharedProduct` 시그니처를 `Partial`로 완화 — 카운터 필드 덮어쓰기 race 방지
- 카운터는 `increment()` 전용 경로로만 관리
- 모든 신규 함수 `try/catch + console.warn` + `[shared]/[tracked]/[favorites]` 태그 로그

### 8-3. 이중 쓰기 로직 (store/useAppStore.ts) ✅ (2026-04-17)
**신규 헬퍼** (services/firebase.ts):
- [x] `trackedItemToSharedProduct(item)` — `Partial<SharedProduct> | null` 반환
  - productId 없으면 null (shared_products 스킵)
  - 의도적 제외 필드: `trackerCount`, `favoriteCount`, `priceHistory`, `lowestPrice`, `highestPrice`

**이중 쓰기 확장**:
- [x] `addItem`: 같은 productId 미추적 시에만 → `upsertSharedProduct` + `addTrackedRef` + `incrementTrackerCount(+1)`
- [x] `removeItem`: 같은 productId 마지막 인스턴스일 때만 → `removeTrackedRef` + `incrementTrackerCount(-1)`
- [x] **중복 추적 가드** — 같은 상품 재추가/중복 삭제 시 카운터 보호

**유지된 기존 호출**: `saveItemToFirestore`, `removeItemFromFirestore` (하위 호환)

### 8-4. 보안 규칙 ✅ (2026-04-17)
파일: `/Users/byoungtaeklee/jigumiya/firestore.rules` (레포 루트, source of truth)
- [x] `users/{uid}/{document=**}` 재귀 매치 유지 → `items`/`tracked`/`favorites` 자동 커버
- [x] `shared_products/{productId}` — read 인증 유저, write **임시 허용** (Phase 3-C에서 `if false`)
- [x] `price_drops/{dropId}` — read 인증 유저, write 서버 전용 (`if false`)

**배포 방법**: Firebase Console 수동 붙여넣기 (§8-6 Step 1 참고)

### 8-5. 관측 로그 ✅ (§8-2/§8-3 내 포함)
- [x] 신규 함수 모두 `[shared]`, `[tracked]`, `[favorites]` 태그 `console.log`
- [x] 실패 케이스 `try/catch + console.warn` (앱 크래시 방지)

---

### 8-6. 검증 (⏳ 사용자 작업 대기 중)

> **⚠️ 선행 필수**: Step 1 Firebase Console 규칙 배포 없이 Step 3 이하 진행하면 **모두 권한 거부 실패**.

#### [Step 1] Firebase Console 보안 규칙 배포
- [ ] 터미널에서 규칙 복사: `cat ~/jigumiya/firestore.rules | pbcopy`
- [ ] [Firebase Console](https://console.firebase.google.com/) → 프로젝트 `jigumiya` 선택
- [ ] 좌측 메뉴 **Firestore Database** → 상단 **규칙** 탭
- [ ] 기존 규칙 전체 덮어쓰기 → **게시** 클릭
- [ ] "규칙이 게시되었습니다" 토스트 확인
- [ ] 게시 후 **최대 1분 대기** (규칙 전파)

#### [Step 2] 개발 서버 실행
- [ ] 터미널 1: `cd ~/jigumiya/jigumiya && npx expo start`
- [ ] 터미널 2: 로그 모니터링 준비 (Metro 번들러 로그 확인용)
- [ ] iOS 시뮬레이터 또는 실기기 Expo Go 접속
- [ ] 앱 정상 실행 + 홈 화면 렌더 확인

#### [Step 3] 신규 상품 추가 검증 (첫 추적)
- [ ] 쿠팡에서 상품 1건 공유 → 앱 진입 → 목표가 설정 → **저장**
- [ ] **Firestore 콘솔 검증** (3개 경로 동시 생성):
  - [ ] `shared_products/{productId}` — `productName`, `thumbnail`, `currentPrice`, `lastCheckedAt`, `trackerCount: 1` 확인
  - [ ] `users/{uid}/tracked/{productId}` — `productId`, `targetPrice`, `addedAt` 확인
  - [ ] `users/{uid}/items/{itemId}` — 기존 경로 유지 확인 (하위 호환)
- [ ] **개발 서버 로그** (Metro 터미널):
  - [ ] `[shared] upsert {productId}` 출력
  - [ ] `[tracked] add {uid} {productId}` 출력
  - [ ] `[shared] trackerCount {productId} + 1` 출력

#### [Step 4] 중복 추가 가드 검증 (⭐ 핵심)
- [ ] 같은 상품을 한 번 더 공유 → 저장
- [ ] `shared_products/{productId}.trackerCount` → **여전히 1** (2로 증가 금지)
- [ ] Metro 로그에서 `[shared] upsert` / `[shared] trackerCount` **미출력** 확인
- [ ] `users/{uid}/tracked/{productId}` 문서 **1개만 존재** 확인
- [ ] 로컬 홈 화면에는 중복 상품 2개 표시 (기존 동작 유지)

#### [Step 5] 삭제 검증
- [ ] 홈에서 중복 2개 중 1개 스와이프 삭제
  - [ ] `trackerCount: 1` **유지** 확인
  - [ ] `users/{uid}/tracked/{productId}` **유지** 확인
  - [ ] Metro 로그에 `[tracked] remove` / `[shared] trackerCount -1` **미출력**
- [ ] 마지막 1개 삭제
  - [ ] `trackerCount: 0` 확인
  - [ ] `users/{uid}/tracked/{productId}` 문서 **삭제** 확인
  - [ ] `users/{uid}/items/{itemId}` 기존 경로도 **삭제** 확인
  - [ ] Metro 로그: `[tracked] remove ...`, `[shared] trackerCount ... - 1`

#### [Step 6] productId 없는 상품 검증 (과거 데이터 호환)
- [ ] URL 파싱에서 `productId`가 추출되지 않는 쿠팡 URL로 추가 시도 (예: 캐시된 단축 URL)
- [ ] `users/{uid}/items/{itemId}`만 생성 확인 (shared_products 경로 스킵)
- [ ] Metro 로그에 `[shared] upsert` 미출력 (예상 동작)
- [ ] 앱 크래시 없음 확인

#### [Step 7] 결과 보고
- [ ] 모든 Step 통과 시 §9 "Phase 3-A 완료 기록" 섹션에 결과 기입
- [ ] 이슈 발생 시 재현 단계 + Metro 로그 + Firestore 스크린샷 공유

---

### 8-7. 배포 (Phase 3-A 검증 완료 후) ⏳
- [ ] 개발 서버 테스트 완료 (§8-6 통과)
- [ ] 앱 버전 bump (1.0.2 → 1.0.3) — 버그픽스 없으면 스킵 가능
- [ ] `eas build --local --profile production --platform all`
- [ ] TestFlight / Play Console 내부 테스트 업로드
- [ ] 지인 1~2명 검증 (제휴 링크 + 신규 유저 추가 플로우)
- [ ] 문제없으면 스토어 정식 제출

---

## 9. Phase 3-A 완료 기록

### 코드 변경 요약
| 파일 | 변경 | 내용 |
|------|------|------|
| `types/index.ts` | +46 lines | SharedProduct, TrackedRef, FavoriteRef, PriceDrop 타입 추가 |
| `services/firebase.ts` | +110 lines | shared_products CRUD 8개 + trackedItemToSharedProduct 헬퍼 |
| `store/useAppStore.ts` | +35 lines | addItem/removeItem 이중 쓰기 + 중복 가드 |
| `firestore.rules` | 신규 60 lines | 레포 루트 source of truth (Console 수동 배포) |

### 기존 코드 무수정 검증
- ✅ `saveItemToFirestore`, `removeItemFromFirestore`, `updateItemInFirestore`, `fetchItemsFromFirestore`, `syncLocalToFirestore` 모두 원본 유지
- ✅ 기존 `TrackedItem` 타입 무수정
- ✅ UI 파일 (`app/`, `components/`) 무수정
- ✅ 스크래퍼 (`scripts/price-checker`) 무수정

### 검증 결과 (§8-6 완료 후 기입)
- [ ] TypeScript 컴파일: ___
- [ ] Step 1 규칙 배포: ___
- [ ] Step 3 첫 추가: ___
- [ ] Step 4 중복 가드: ___
- [ ] Step 5 삭제: ___
- [ ] Step 6 productId 없는 상품: ___
- [ ] 완료 일자: ___
- [ ] 이슈 기록: ___

---

## 10. 다음 단계 (Phase 3-B 착수 조건)

§8-6 모든 Step 통과 + §8-7 배포 후 **2주 관찰** → Phase 3-B (백필 스크립트) 착수.

### Phase 3-B 예상 작업
- `scripts/migration/backfill-shared-products.ts` 작성
- Firestore export 선행 (`gcloud firestore export ...`) — 롤백 대비
- 전 유저 `users/{uid}/items` 순회 → `shared_products` 생성 + `trackerCount` 집계
- `users/{uid}/tracked/{productId}` 재기입 (productId 있는 item만)
- 배치 완료 후 샘플 검증 (무작위 10개 유저 대조)

### 다음 대화창 프롬프트 (Phase 3-A 검증 완료 후)
```
docs/000_MD_사용법.md 와 CLAUDE.md 읽고,
017_앱구조개편_Phase3.md 도 읽어줘.
Phase 3-A §8-6 검증 완료. Phase 3-B 백필 스크립트 작업 시작해.
```

---

## 11. 비고
- 아이고 앱과의 선후 관계: 이번엔 **지금이야 선행** → 검증 후 아이고 이식
- `014_Phase3계획.md`는 이력 보존 (삭제 X)
- CLAUDE.md 작업 리스트: 014 → 017로 교체 완료 (Phase 3 상태 🔄)
- Phase 3-A 완료 일자 + 검증 결과 본 문서 §9에 기록
