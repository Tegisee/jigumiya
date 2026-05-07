# 지금이야 (Jigumiya) - 메인 컨텍스트

## 중요: 새 대화창 시작 방법
docs/000_MD_사용법.md 와 이 파일을 먼저 읽을 것.
작업할 항목의 sub MD도 함께 읽고 시작할 것.
2026-04-30 이전 작업 이력은 docs/작업이력_archive.md 참조.

## 세션 재시작 기준
다음 중 하나라도 해당되면 작업 완료 후 세션 재시작 권장:
- 수정 파일 10개 이상
- 신규 파일 5개 이상
- 연속 작업 30분 이상

기준 초과 시 Claude Code가 다음 메시지 출력:
"⚠️ 세션이 길어졌어요. 다음 작업 전에 새 세션 시작을 권장합니다."

## 가장 최근 (2026-05-07): priceHistory 동기화 버그 fix + ProductCard trend 뱃지 추가

1.0.14 출시 후 실기기에서 발견된 priceHistory 관련 버그 3종 코드 분석 → 근본 원인 fix.

**1) Fix A — `updateItemPrice`가 Firestore에 priceHistory 누락 저장하던 버그** (`store/useAppStore.ts:115-145`)
- 1.0.14까지: `updateItemInFirestore(id, { currentPrice })`만 호출 → store에는 priceHistory 누적되지만 Firestore의 `users/{uid}/items.priceHistory`는 추가 시점 1개로 영원히 박혀있음
- fix: `updateItemInFirestore(id, { currentPrice, priceHistory: history.slice(-30) })` — store와 Firestore 동시 갱신
- 효과: 백그라운드 → 포그라운드 전환 시 syncFromFirestore가 store를 덮어써도 priceHistory 보존

**2) Fix B — `syncFromFirestore` 머지 정책으로 기존 사용자 데이터 보호** (`store/useAppStore.ts:syncFromFirestore`)
- 1.0.14까지: `set({ trackedItems: items })` 무조건 덮어쓰기 → Firestore priceHistory가 1개로 박혀있는 기존 사용자는 백그라운드 복귀마다 그래프 데이터 리셋
- fix: id 단위 매칭해서 `local.priceHistory.length > remote.priceHistory.length`면 local 보존 (priceHistory + currentPrice). 그 외 필드는 remote 채택
- 효과: Fix A 적용 전 누적된 기존 사용자 store 데이터 보호. Firestore 점진적 회복 (다음 가격 갱신부터 정상화)

**3) Fix C — ProductCard 우측하단 trend 뱃지 추가** (`components/ProductCard.tsx`)
- 1.0.14까지: 홈 추적 카드에 trend 표시 없음 (목표가 텍스트만). 상세페이지(`detail/[id].tsx:114-119`)에는 있었지만 홈에는 없었음
- fix: priceHistory 첫값 vs 마지막값 비교 → 📉 가격하락감지(빨강 #FF4444) / 📈 가격상승감지(파랑 #3B82F6) / ➡️ 가격변동없음(그레이) 뱃지. priceHistory 2개 미만이면 미표시
- 위치: 카드 정보 영역 하단 행 우측 (gap 텍스트 좌측 / trend 뱃지 우측 — `flexDirection:row, justifyContent:space-between`)

**근본 원인 요약**: `users/{uid}/items.priceHistory`와 `shared_products.priceHistory`가 분리된 이중 진실 구조 + 클라이언트 측 priceHistory 누락 저장 + sync 시 무조건 덮어쓰기 — 3개 결함이 조합되어 백그라운드 복귀마다 그래프 리셋. Fix A로 클라이언트 누락 차단 + Fix B로 기존 데이터 보호.

**미적용 (다음 빌드)**: Fix A/B는 1.0.15 빌드 출시 후 효과 발생. 출시 전까지 기존 사용자는 Fix B로만 보호됨 (store는 보존, Firestore는 다음 가격 체크부터 회복).

## 직전 (2026-05-06 심야): 1.0.14 — iOS 무한로딩 fix + Android 성능 개선

1.0.13 실기기 테스트 → iOS 상품 추가 무한로딩 잔존 + Android 스크롤 여전히 느림 → 근본 원인 재조사 후 1.0.14 (bn49/vc49) 재빌드 + 양 스토어 출시 완료 (커밋 `75d97f4`).

**1) iOS 무한로딩 fix — CoupangScraper 재시도 소진 시 즉시 `onError()` 호출** (`components/CoupangScraper.tsx:253-262`)
- 1.0.13까지: 가격=0 + 3회 재시도(2/4/6s) 소진 시 `console.warn('가격X — 재시도 소진')`만 찍고 콜백 미발사 → 외부 20s timeout만 의존 → 사용자 체감 50s+ 무한로딩
- fix: `재시도 소진` 시 `doneRef=true` + `clearTimeout(timeoutRef)` + `onError()` 즉시 호출

**2) CoupangScraper TDZ 잠재 버그 제거** (`components/CoupangScraper.tsx:177-183`)
- `retryIndexRef`/`retryDelays` 선언을 `sourceKey` if 블록 위로 이동 — TS2448 (Block-scoped variable used before declaration) 해소

**3) add-item.tsx fallback 강화 — `link.coupang.com` 단축 URL HTML body 파싱** (`app/modal/add-item.tsx:63-79, 222-273`)
- 1.0.13까지: Functions 실패 시 fallback이 30x Location 헤더만 시도 → Coupang 단축 URL은 `200 OK + JS hex-escape redirectWebUrl` 응답이라 Location null → resolve 실패 → vp URL 미확보 → WebView 빈 페이지 스크래핑 무한 실패
- fix: `extractRedirectUrlFromHtml()` 헬퍼 신설 (functions/src/index.ts 로직 클라이언트 미러). fallback 순서: (1) Location 헤더 → (2) HTML body `redirectWebUrl` 파싱 → (3) `redirect:'follow'` 본문에서도 파싱 시도

**4) Functions timeout 5s → 8s 복원** (`add-item.tsx:208`)
- 5s는 빡빡 (1.5s auth 대기 + Functions cold tail 흡수 부족) → 8s로 복원

**5) Android 성능 — `expo-image` 도입 (8개 사용처 일괄 마이그레이션)**
- `package.json`/`app.config.js` 플러그인 등록
- 교체: ProductCard / (tabs)/index 골드박스 / event-best / today-best (h/v 둘 다) / coupang-pl / favorites / price-drops / detail
- 모든 `<Image>`에 `cachePolicy="memory-disk"` + `recyclingKey` + `contentFit="cover"` + `transition={0}` 적용
- 효과: 스크롤 중 같은 이미지 재로드 회피 + Native 측 캐시 + FlatList 셀 재활용 시 이미지 즉시 표시

**6) SparklineChart `MIN_POINTS=5` 가드** (`components/SparklineChart.tsx`)
- 1.0.13까지: priceHistory.length≥2면 LineChart 렌더 — gifted-charts SVG가 Android 스크롤에 부담 (홈 10개 카드 × SVG = GPU 압박)
- fix: 5개 미만은 표시 X (의미도 없음). ProductCard `length >= 5` 가드도 같이 추가 (불필요 mount 회피)

**7) today-best 펼침 모드 가상화** (`app/today-best.tsx`)
- 1.0.13까지: `products.map(renderExpandedRow)` — 단일 FlatList row 안에 50개 동시 렌더 (가상화 X)
- fix: 데이터 평탄화 — `Row = 'header' | 'preview' | 'product'` 타입. `useMemo`로 rows 빌드. 펼친 카테고리는 각 product가 개별 FlatList row → 가상화 활용
- `keyExtractor`/`renderRow`/`handleBuy` 모두 `useCallback`. `initialNumToRender 4→8`, `maxToRenderPerBatch 3→6`, `windowSize 5→7`

**8) coupang-pl renderItem `useCallback` 적용**
- `handleBuy` + `renderItem` 모두 `useCallback`로 감싸 부모 리렌더 시 새 함수 reference 회피

**9) 빌드 + 출시**
- 1.0.14 (bn49/vc49) iOS + Android production 로컬 빌드 완료
- 산출물: `~/jigumiya/builds/ios/jigumiya-1.0.14-49.ipa` (16.1 MB) / `~/jigumiya/builds/android/jigumiya-1.0.14-49.aab` (58.8 MB)
- iOS App Store + Android Play Store 출시 완료

## 직전 (2026-05-06 야간): 1.0.13 — 실기기 테스트 버그 수정 8건

1.0.12 (bn47/vc47) 빌드 → 실기기 검증 → 8건 버그 발견 → 수정 → 1.0.13 (bn48/vc48) 재빌드 (커밋 `489339e` + `f8c059d`).

**1) 이벤트 배너 라우팅 fix**
- 홈 활성 이벤트 배너 클릭 → `/today-best`로 잘못 이동 → `/event-best?slug=...`로 라우팅 변경
- `app/event-best.tsx` 신규 (slug param + `fetchEventBySlug` + 헤더 D-N 배지 + 상품 리스트)
- `services/firebase.ts:fetchEventBySlug(slug)` 신설
- 루트 Stack에 `event-best` 등록

**2) 상세페이지 UI 전면 교체** (`app/detail/[id].tsx`)
- 제거: targetRow(목표가) 카드 + gridSection 4-card grid(현재가/최저가/최고가/평균가) + priceModal(목표가 수정 Modal) + chartEmpty 다중 행
- 추가: priceHero (현재가 32px bold + 트렌드별 상태 텍스트 📉/📈/➡️) + 간소화된 chartEmpty (아이콘 + "데이터 축적 중" + "내일부터..." 한 줄)
- 결과 구조: 상품 thumbnail/이름/메타 → priceHero → chartSection (그래프 OR 빈 상태) → priceInsights → 사달라고 조르기 버튼 → 파트너스 고지

**3) 사달라고 조르기 텍스트 변경**
- 버튼: "친구에게 사주세요 🎁" → "사달라고 조르기 🥺"
- 모달 타이틀: "친구에게 보낼 메시지" → "사달라고 조르기 🥺"

**4) iOS Share 버그 fix**
- 멘트 선택 후 공유 시트 안 뜨는 문제 — 모달 dismiss 애니메이션 끝나기 전 Share.share 호출 시 root view 점유 충돌
- `handleSendAsk`: 모달 close 후 iOS는 350ms `setTimeout` 후 Share 호출, Android는 즉시
- 공유 텍스트 형식: `${trimmed}\n\n${productName}\n${url}` (이미 입력텍스트\n\n상품명\n링크 순서)

**5) 쿠팡 PL 브랜드별 자동 탭 분류** (`app/coupang-pl.tsx`)
- API 응답 categoryName 필드 비어있어 모두 "기타" 묶이는 문제 → productName 브랜드 감지로 대체
- `BRANDS = ['베이스알파에센셜', '꼬리별', '곰곰', '코멧', '탐사', '줌']` 우선순위 순서 (긴 이름 먼저)
- `detectBrand(productName)` `productName.includes(brand)` 우선순위 매칭, 미일치 시 '기타'
- `brandByProductId` `useMemo` 캐시 + 탭 빌드는 BRANDS 정의 순서 + 매칭된 것만 + 마지막에 '기타'
- 카드 하단 categoryName 라벨 제거 (탭이 이미 표시)

**6) iOS 상품 추가 무한로딩 개선** (`services/firebase.ts` + `app/modal/add-item.tsx`)
- 첫 1~2번째 추가 시 무한로딩 → Auth 미준비 상태에서 Functions 호출 → 8s timeout 후 fallback chain (worst 18s)
- `waitForAuthReady(maxMs)` 신설 — `auth.currentUser` 즉시 있으면 0ms, 없으면 `onAuthStateChanged` 구독 + setTimeout 대기
- `callResolveAffiliate`: 호출 전 1.5s auth 대기, 그래도 미준비 시 `{ ok:false, error:'auth_not_ready' }` 즉시 반환 → 빠른 fallback
- `warmupResolveAffiliate`: 동일 1.5s 대기, 미준비 시 skip
- add-item Functions withTimeout 8000 → 5000ms
- worst-case latency: 18s → 6.5s

**7) Android FlatList 최적화**
- `components/ProductCard.tsx`: `memo()` + 커스텀 비교(`prev.item === next.item`)
- 6개 화면 FlatList 표준 props: `removeClippedSubviews` + `initialNumToRender`/`maxToRenderPerBatch`/`windowSize` (각 화면 데이터 양에 맞춰 조정) + `updateCellsBatchingPeriod={50}`
- 메모리 사용량 ↓ + 스크롤 프레임 드랍 완화 (Android 위주)

**8) 빌드 + 배포**
- Firestore rules 배포 완료 (`event_best_jigumiya/goldbox/coupang_pl` read 허용) — 5/6 진행됨
- 1.0.13 (bn48/vc48) iOS + Android production 로컬 빌드 (5/6 야간)
- 산출물: `~/jigumiya/builds/ios/jigumiya-1.0.13-48.ipa` / `~/jigumiya/builds/android/jigumiya-1.0.13-48.aab`

## 그 직전 (2026-05-06 후반): 1.0.12 통합 작업 — UI 재구성 + 그래프 + 신규 화면 + Firestore rules

**0) Firestore rules 배포** (event_best_jigumiya / goldbox / coupang_pl read 허용)

**1) `ensureUserDoc` 추가 + `platform` 필드** — 갤럭시S21+ 알림 0건 사고 근본 fix
- `services/firebase.ts:ensureUserDoc(uid)` 신설 — `signInAnonymously` 직후 무조건 호출
- `users/{uid}`에 `{ app:'jigumiya', platform:Platform.OS, createdAt }` merge (신규 시만 createdAt 박힘)
- 알림 권한 거부 / 토큰 발급 실패 시에도 user doc 보장 → cron `fetchActiveUsers`에서 발송 대상 보장
- `app/_layout.tsx`에 wiring (signInAnonymously 반환 uid → ensureUserDoc 호출)

**2) iOS 쿠팡 복귀 무한로딩 fix**
- `feed.tsx`(이후 삭제) / `price-drops.tsx`: AppState `active` 전환 시 재로드/재구독 (이미 데이터 있으면 spinner 안 띄움)
- `services/firebase.ts:fetchAllCategoryBest` 8초 timeout (Promise.race) — Firestore stall 흡수

**3) vendorItemId 옵션 고정 매칭** (가격 체크 mismatch 방지)
- `scripts/shared-price-checker/coupang-api.ts`: `CoupangProduct`에 `vendorItemId/itemId` 추가 + 응답 매퍼 보존
- `fetchCurrentPrice(productName, productId, currentPrice, vendorItemId?)` — vendorItemId 정확 매칭 우선, 일치 없으면 productId+가격근접 fallback
- `index.ts`: `data.vendorItemId` 전달 + `vendorItemId` 있으면 `bestCache` 우회 (category_best는 productId 단위)

**4) 가격 그래프 대대적 개선** (`app/detail/[id].tsx`)
- 트렌드 색상 자동 (drop=red `#FF4444` / up=blue `#3B82F6` / flat=gray)
- 직선 그래프 + 모든 변곡점 dot
- 참조선 3개: 최고가(파란 점선) / 최저가(빨간 점선) / 목표가(초록 점선 `#22C55E`)
- `yAxisOffset` + `maxValue`로 y 범위 보정 (max/min/target 모두 차트 안)
- X축 라벨: 첫/끝 + 중간 2~3개 균등 (총 N≥8→5개, ≥4→4개, ≥3→3개)
- 트렌드 인사이트 텍스트 자동 연동 (priceInsights 첫 항목 trend 분기)
- pointerConfig tooltip — 터치 시 `YYYY.MM.DD` + `N원` 말풍선 (`activatePointersInstantlyOnTouch`)

**5) 친구에게 사주세요 모달** (`detail/[id].tsx`)
- "🎁 친구에게 사주세요" 버튼 + slide-up 시트 모달
- 6개 프리셋 멘트 + 직접 입력 TextInput
- 포맷: `{멘트}\n\n{productName}\n{item.url}` → `Share.share`

**6) UI 재구성 — 탭 4개 + 신규 화면 2개 + 헤더 변경**
- 신규 화면: `app/today-best.tsx` (카테고리별 가로 스크롤 + 더보기 펼치기), `app/coupang-pl.tsx` (categoryName 자동 탭 + 전체 + 필터)
- 홈 상단 버튼: 활성 이벤트(D-7) 풀-width 배너 + `[⚡ 오늘의 BEST]` + `[🏷️ 쿠팡 PL]`
- 홈 헤더 우측: 설정 버튼 제거 → 공유 버튼만 (Platform별 STORE_LINKS 분기)
- 골드박스 섹션: 기존 "오늘의 특가"(price_drops + bestPool fallback) 완전 제거 → `goldbox/{오늘 KST}` 가로 스크롤 (이미지+이름+가격, 할인 배지 없음)
- 탭 4개: 홈 / 자주사는 / 가격변동 / 설정 (feed `app/(tabs)/feed.tsx` 완전 삭제)
- `app/settings.tsx` (루트) → `app/(tabs)/settings.tsx`로 이동, back 버튼 제거 (탭 UX)
- 루트 Stack에 today-best / coupang-pl 등록, settings Stack 제거

**7) STORE_LINKS 채움**
- `services/config.ts`: ios `apps.apple.com/app/id6760587430`, android `play.google.com/store/apps/details?id=com.jigumiya.app`
- `getStoreLinkForPlatform()` 헬퍼 — `Platform.OS` 분기 → `getAppShareMessage()` 단일 링크

**8) coupangpl-updater 보강** — `categoryName` 필드 응답 매퍼 + Firestore 저장 pass-through (PL 자동 탭 분류용)

**9) Firestore rules 추가** — `event_best_jigumiya/{slug}`, `goldbox/{date}`, `coupang_pl/{date}` 모두 read auth, write false

**10) feed.tsx generateDeepLink 정리** — category_best.products[].productUrl이 이미 affiliate URL → 재변환 제거 (이후 feed.tsx 자체 삭제)

## 그 직전 (2026-05-06 전반): 쿠팡 PL cron + token dedup + 갤럭시S21+ 알림 0건 진단

**1) 쿠팡 PL cron 신설** (커밋 `b4a4e16`):
- 위치: `scripts/coupangpl-updater/`, 워크플로 `.github/workflows/coupangpl-update.yml`
- 엔드포인트 `/v2/.../products/coupangPL?limit=100` (v1 prefix 없음, goldbox와 동일 패턴)
- 골드박스와 동시 실행 (07:30 KST, `30 22 * * *`), 1콜/일
- 첫 수동 실행: 87개 저장 완료 (`coupang_pl/2026-05-06`)

**2) fetchActiveUsers token dedup fix** (커밋 `51d5dac`):
- 사고: 5/6 morning_greeting 4건 발송 — 동일 expoPushToken 공유 jigumiya uid 4개
- fix: `seenTokens: Map<token, firstUid>` — 첫 등장 uid만 보존, dup uid 스킵

**3) 갤럭시S21+ 알림 0건 진단** — `users/{uid}` doc 부재가 근본 원인. `savePushToken`이 유일한 doc 생성처라는 설계 결함. 응급으로 `QBsAA6mAJ…` user doc 수동 생성. 근본 fix는 위 §1 `ensureUserDoc`로 해결됨

## 5/5 후반: A~E 알림 시스템 재설계 + 신규 cron 2종

5/5 17:35 폭탄 사고(`events.categoryBroadcasts` 다중 push) → A~E 재설계 (커밋 `48c1fed`):
- A: 카테고리 베스트 알림 완전 제거 → shared_products 단일 출처 일원화
- B: dropRate 60% 가드 + events.drops/ups dedup
- C: morning/evening 요일별 단일 문구 (KST DOW lookup)
- D: 골드박스 cron 신설 (07:30 KST, 1콜/일)
- E: 이벤트 cron 신설 (02:35 KST, 11개 이벤트 D-7 윈도우)

shared-price-check cron 3차 재활성화 (`*/10 * * * *`). 1.0.11 (bn46/vc46) iOS 심사 / Android 내부 테스트 트랙 업로드 완료, 1.0.10 심사 중.

## 작업 리스트

### Phase 1 (MVP)
| 번호 | 작업 | 상태 | sub MD |
|------|------|------|--------|
| 001 | 프로젝트 초기화 + 패키지 설치 | ✅ | 001_프로젝트개요.md |
| 002 | 기술스택 + 폴더구조 세팅 | ✅ | 002_기술스택.md |
| 003 | 디자인시스템 + UI 구현 | ✅ | 003_디자인시스템.md |
| 004 | 수익모델 (쿠팡 파트너스 단일) | ✅ | 004_수익모델.md |
| 005 | UX 플로우 | ✅ | 005_UX플로우.md |
| 006 | 알림 전략 | ✅ | 006_알림전략.md |
| 007 | 데이터 저장 구조 | ✅ | 007_데이터저장구조.md |
| 008 | Share Intent | ✅ | 008_ShareIntent.md |
| 009 | Firebase 연동 | ✅ | 009_Firebase.md |
| 010 | 상품 정보 스크래핑 (WebView) | ✅ | 010_쿠팡파트너스API.md |
| 011 | EAS 빌드 + 실기기 테스트 | ✅ | 011_EAS빌드_배포.md |

### Phase 2 (가격 추적 + 알림)
| 번호 | 작업 | 상태 | sub MD |
|------|------|------|--------|
| 012 | FCM 푸시 + 가격 체크 봇 | ✅ | 012_FCM푸시알림.md |
| 013 | 쿠팡 파트너스 API 연동 | ✅ | (010, 012 통합) |

### Phase 2.5 (버그 수정 + 개선)
| 번호 | 작업 | 상태 | sub MD |
|------|------|------|--------|
| 015 | 버그 수정 및 개선 | 🔄 | 015_Phase2.5_버그수정_및_개선.md |
| 016 | AppStore 메타데이터 | ✅ | 016_AppStore_메타데이터.md |

### Phase 3 (앱 구조 개편)
| 번호 | 작업 | 상태 | sub MD |
|------|------|------|--------|
| 017 | 앱 구조 개편 (3탭 + shared_products) | 🔄 3-D MVP 완료 | 017_앱구조개편_Phase3.md |
| 018 | Firebase Functions Resolver | ✅ 실기기 검증 완료 | 018_FirebaseFunctions_Resolver.md |
| 019 | SharedProducts + 카테고리 베스트 통합 설계 | 🔄 §8-C 대기 | 019_Phase3_SharedProducts.md |

## 진행 경과 요약 (이력 archive: docs/작업이력_archive.md)

**2026-04-30 이전** (archive 참조): Phase 3-A/D MVP, 018 Functions Resolver + 1.0.5, Rate Limit 사고 fix, 019 §8-A/§8-B + 1.0.6, shared-price-checker cron 신설, 알림 7종 시스템, 1.0.7 빌드

**2026-05-01** (1.0.8 배포): 골드박스 → "오늘의 특가"(price_drops 24h + category_best 1h 캐시) + 하트 버튼 누락 fix(productId 다중 패턴 + URL 후보) + backfillProductIds 자가 치유 (커밋 `dd15624`). shared-price-check cron 활성화(`46ccb4c`). 첫 cron 실행 결과 알림 0건 — morning/evening 시간대 미진입 + tracked.productId 누락 + trackerCount 음수 발견

**2026-05-02**: tracked-backfill 1회 실행(productId 5건 보강) + `notify-only.yml` 신설(07:30/20:00 KST, morning/evening 진입 보장) + §11 자동화(`b49ea2e`, yml 10분 고정 + 코드 N값 기반 간격 + lastRunAt graceful exit) + docs/020 신설 + CLAUDE.md slim(573→303줄, 4/30 이전 archive 분리) + 1.0.9(bn44/vc44) 빌드 + iOS App Store ID + detail 알림 라우팅 productId fallback + legacy `price-check.yml` 폐기 + evening_no_change 가드 완화(`fd6afe3`)

**2026-05-03** (1.0.10 빌드): 알림 0건 사고 — Expo batch 거절(다른 EAS projectId 토큰 혼재) + markUpdate 순서 버그 → notifier.ts chunk try/catch + 1건씩 fallback + index.ts successfulTokens 기반 lastNotifications 갱신 (`096c69a`) + cleanup-morning 55명 정리. price_drops 중복 fix(autoId → doc(productId).set 멱등 upsert, `2dc12c3`) + wipe 9건. iOS 공유 무한로딩 fix(가이드 Alert + step 보존 + iOS fetch 8s timeout, `9de8269`). Android 콜드 스타트 완화(모달 mount + AppState active warmup + 응답시간 로그, `601b166`). 1.0.10(bn45/vc45) 양 스토어 업로드 (Android 프로덕션 검토 / iOS 심사 대기)

**2026-05-04** (커밋 `de856a6`, A~H 8종 일괄): A 후보 풀 정리 + B drop 상품별 발송 + C 앱 필터링(jigumiya/aigo) + D 알림 문구 상품명+가격 + E 고정 알림 KST 날짜 가드 + F sleep 10s→2s + G 카테고리 round-robin(category-cycle.ts 신규) + H category_best 10% 급락 broadcast(category_broadcast type)

**2026-05-05 전반** (커밋 `093f7ad` + 빌드): A~H 배포 후 새벽 cron 가짜 변동 폭주(category_best 매 사이클 갱신 + bestcategories↔search productPrice 출처 mismatch) → 긴급 cron 비활성화 → category_best 갱신 중단 + fetchActiveUsers strict 변경(`app === 'jigumiya'` 단일) + users 백필(aigo 30 / jigumiya 18 / unknown 102 스킵). 1.0.11(bn46/vc46) 빌드 + Functions `minInstances: 1`(Cloud Run minScale=1, 콜드 스타트 제거, 월 ~$5~10). cron 재활성화(`11a83d2`). 1.0.11 양 스토어 업로드: iOS 심사 요청 / Android 내부 테스트 트랙

**2026-05-05 후반** (커밋 `48c1fed`, A~E + 신규 cron 2종): 17:35 폭탄 알림 재발 (events.categoryBroadcasts dedup 부재 + dropRate 가드 부재 + same-cycle 24h 가드 한계) → A~E 재설계
- A: 카테고리 베스트 알림 완전 제거 — `category-cycle.ts` 재작성(fetch + 문서 갱신만), `events.categoryBroadcasts` + `category_broadcast` PushPayload + `MessageData.screen='price_change'` 통째 제거
- B: shared 본 흐름 `Math.abs(dropRate) > 60` 가드 + flush 직전 `dedupByProductId` 헬퍼로 events.drops/ups dedup
- C: `MESSAGES.morning` / `eveningNoChange` 요일 인덱스 7개 단일 문구. `getKstDayOfWeek()` 룩업, title 시간대 통일(`🌅 좋은 아침이에요` / `🌙 오늘도 수고했어요`), body 사용자 사양
- D: `scripts/goldbox-updater/` + `goldbox-update.yml` 07:30 KST. 엔드포인트 `/products/goldbox` (v1 prefix 없음). productUrl 이미 affiliate라 별도 deeplink 변환 X. 1콜/일. `goldbox/{YYYY-MM-DD KST}` 저장
- E: `scripts/event-best-jigumiya-updater/` + `event-best-jigumiya-update.yml` 02:35 KST. 11개 이벤트(valentine 02-14 / samgyeopsal 03-03 / whiteday 03-14 / childrensday 05-05 / parentsday 05-08 / teachersday 05-15 / couplesday 05-21 / roseday 06-14 / halloween 10-31 / pepero 11-11 / christmas 12-25). D-7 윈도우 매칭 시만 갱신, search limit 10, 4~8콜/일

타임라인 조정: event-best-jigumiya 02:30→02:35 KST (category-best과 격차 10분). shared-price-check cron 3차 재활성화 (`fb324d9`)

## 다음 작업 순서 (2026-05-06 심야 이후)

**🌅 내일 확인 (1.0.14 출시 후 검증)**:
1. **검증** 가격 그래프 — priceHistory 5개 이상 상품에서 SparklineChart 정상 노출 (5개 미만은 스킵 동작 확인)
2. **검증** 아침/저녁 알림 정상 발송 (07:30 morning_greeting / 20:00 evening_no_change, 요일별 문구 매칭)
3. **검증** 골드박스 cron 07:30 KST 첫 자동 실행 — `goldbox/{YYYY-MM-DD}` 생성 + productUrl affiliate prefix
4. **검증** 1.0.14 실기기 — iOS 상품 추가 (link.coupang.com 단축 URL 처리) / Android 스크롤 (expo-image 캐싱 + today-best 가상화 효과)

**📦 다음 빌드 (1.0.15) 때 수정할 것**:
- **priceHistory 동기화 fix 출시** — Fix A/B/C 코드 반영 (5/7 커밋), 출시 시점부터 신규 사용자 정상화 + 기존 사용자도 store 보존됨
- 아침/저녁 인사 알림(`morning_greeting`/`evening_no_change`) 제거 (5/7 커밋, 다음 cron부터 실 효과 — 빌드와 무관)
- 앱 공유 시 iOS/Android 구분 없이 **앱스토어 + 구글플레이 링크 모두 발송** (현재 Platform.OS 분기 단일 링크 → 양쪽 동시)
- Android proguard 설정 — 빌드 크기 축소 + 코드 보호
- 아이고 빌드 — `ensureUserDoc` / 가격그래프 / 사달라고 조르기 / priceHistory fix(A/B/C) 등 지금이야 1.0.12~ 변경 이식

**🔍 cron 검증 (잔여)**:
- shared-price-check cron 3차 재활성화 후 자동 실행 (A~E 검증 — 가짜 변동 알림 0건 / dropRate 가드 / 요일 문구)
- 이벤트 cron 02:35 KST 첫 실행 — D-7 윈도우 graceful exit / parentsday(05-08) 진입 시 갱신
- 쿠팡 PL cron 07:30 KST 자동 실행 — workflow_dispatch 외 schedule 트리거
- token-dedup 로그 + 갤럭시/아이폰 1대당 1 push 보장
- vendorItemId 매칭 로그 (`[API] vendorItemId=... 정확 매칭`)

**🔧 뒤로 미뤄둔**: 공지사항 팝업 + 전체 푸시 / cron schedule 최적화 §8-D-2 / shared-price-check dry-run 모드

**중기**: `meta/stats.sharedProductCount` 자동 갱신 / users EAS projectId 분포 조사 / 아이고 cron 활성화 / 하트 버튼 백필 검증 / increment 비대칭 추적 / 아이고 Firebase 통합(§8-C) / 아이고 Functions 이식 / 아이고 알림+계정삭제 버그 / 가족 계정 구매 테스트(파트너스 실적 집계)

**장기**: 쿠팡 파트너스 문의 답변(bestcategories 카운팅) / Firebase App Check 검토

## 미완 TODO (확정 작업만)

### 2026-05-05 후반 완료
- [x] **🚨 17:35 폭탄 분석** — events.categoryBroadcasts dedup 부재 + dropRate 가드 부재 + markUpdate same-cycle 한계 확정
- [x] **A** 카테고리 베스트 알림 완전 제거 (커밋 `48c1fed`)
- [x] **B** dropRate 60% 가드 + events.drops/ups dedup
- [x] **C** morning/evening 요일별 단일 문구 (KST DOW)
- [x] **D** 골드박스 cron 신설 (`scripts/goldbox-updater/`, 07:30 KST)
- [x] **E** 이벤트 cron 신설 (`scripts/event-best-jigumiya-updater/`, 02:35 KST, 11개)
- [x] **타임라인** event-best-jigumiya 02:30→02:35 KST
- [x] **재가동 (3차)** shared-price-check cron `*/10 * * * *` 활성화 (커밋 `fb324d9`)

### 2026-05-06 완료
- [x] **신규** 쿠팡 PL cron 추가 (07:30 KST, 골드박스와 함께) — 커밋 `b4a4e16`
- [x] **검증** 쿠팡 PL cron 첫 수동 실행 — `coupang_pl/2026-05-06` 87개 저장
- [x] **fix** fetchActiveUsers token dedup — 갤럭시/아이폰 1대당 1 push 보장 (`seenTokens` Map)
- [x] **진단** 갤럭시S21+ 알림 0건 원인 — `users/{uid}` doc 없음 + `savePushToken`이 유일한 doc 생성처라는 설계 결함
- [x] **응급** `QBsAA6mAJshIHjWi55qPhMRrtAo2` user doc 수동 생성 (`app/notificationEnabled/expoPushToken:null/createdAt`)

### 2026-05-06 후반 완료 (1.0.12 통합)
- [x] **fix** ensureUserDoc + platform 필드 — 갤럭시 알림 0건 근본 fix
- [x] **fix** iOS 쿠팡 복귀 무한로딩 — feed.tsx/price-drops.tsx AppState 핸들러 + 8초 timeout
- [x] **fix** vendorItemId 옵션 고정 매칭 (`shared-price-checker/coupang-api.ts`) + bestCache 우회
- [x] **feat** 가격 그래프 — 트렌드 색상 + 최고/최저/목표 참조선 + 직선 + 점 + tooltip + 사주세요 모달
- [x] **feat** 신규 화면 today-best.tsx + coupang-pl.tsx (categoryName 자동 탭)
- [x] **feat** 홈 상단 버튼 + 골드박스 섹션 (기존 오늘의특가 fallback 제거)
- [x] **refactor** 탭 4개 — 홈/자주사는/가격변동/설정 (feed 삭제, settings 탭 이동)
- [x] **fix** STORE_LINKS 채움 + Platform별 분기
- [x] **chore** coupangpl-updater categoryName 필드 보존
- [x] **feat** Firestore rules 추가 — event_best_jigumiya / goldbox / coupang_pl
- [x] **chore** feed.tsx generateDeepLink 정리 (이후 feed 자체 삭제)
- [x] **deploy** Firestore rules 배포 (5/6)
- [x] **build** 1.0.12 EAS preview 빌드 (iOS + Android)

### 2026-05-06 야간 완료 (1.0.13 — 실기기 테스트 fix 8건)
- [x] **fix** 이벤트 배너 라우팅 (`/today-best` → `/event-best?slug=...`) + `app/event-best.tsx` 신규 + `fetchEventBySlug` 신설
- [x] **refactor** 상세페이지 UI 전면 교체 — priceHero(현재가+상태) + 그래프 + 인사이트 (4-card grid + targetRow + priceModal 제거)
- [x] **chore** 텍스트 변경 — "친구에게 사주세요 🎁" → "사달라고 조르기 🥺" (버튼/모달 타이틀)
- [x] **fix** iOS Share 버그 — 모달 dismiss 후 350ms delay 후 `Share.share` 호출
- [x] **fix** 쿠팡 PL 브랜드별 자동 탭 (BRANDS productName 매칭) — categoryName 비어있는 응답 대응
- [x] **fix** iOS 상품 추가 무한로딩 1차 시도 — `waitForAuthReady(1500)` + Functions timeout 8s→5s (1.0.14에서 추가 보완 필요)
- [x] **perf** Android FlatList 최적화 1차 — `ProductCard` `memo()` + 6개 화면 표준 props (1.0.14에서 expo-image + 가상화로 추가 개선)
- [x] **build** 1.0.13 (bn48/vc48) production 로컬 빌드 (iOS + Android)

### 2026-05-06 심야 완료 (1.0.14 — iOS 무한로딩 + Android 성능 추가 개선)
- [x] **fix** CoupangScraper 재시도 소진 시 즉시 `onError()` 호출 (외부 20s timeout 의존 제거)
- [x] **fix** CoupangScraper TDZ 잠재 버그 제거 (`retryIndexRef`/`retryDelays` 선언 위치 정리)
- [x] **fix** add-item.tsx fallback에 `extractRedirectUrlFromHtml` 추가 — link.coupang.com 단축 URL HTML body `redirectWebUrl` 파싱 (functions/src 미러)
- [x] **fix** Functions timeout 5s → 8s 복원
- [x] **perf** expo-image 도입 — 8개 사용처 일괄 마이그레이션 (`memory-disk` cachePolicy + `recyclingKey` + `transition={0}`)
- [x] **perf** SparklineChart `MIN_POINTS=5` 가드 — gifted-charts SVG 비용 회피 (priceHistory 5개 미만 표시 X)
- [x] **perf** today-best 펼침 모드 평탄화 row 구조 — `Row='header'|'preview'|'product'` + 개별 FlatList row 가상화 (50개 동시 렌더 → 가상화)
- [x] **perf** coupang-pl renderItem `useCallback` 적용
- [x] **build** 1.0.14 (bn49/vc49) production 로컬 빌드 (iOS + Android)
- [x] **release** 1.0.14 iOS App Store + Android Play Store 출시 완료

### 2026-05-07 완료
- [x] **fix** 아침/저녁 인사 알림 제거 — `index.ts:843-850`(morning_greeting) + `980-987`(evening_no_change) push 블록 제거. 가격 변동 알림(target_reached/price_drop_summary/price_up_summary)은 유지
- [x] **fix** 아이고 인사 알림 schedule 비활성화 — `aigo-daily-greeter.yml` schedule 두 줄 주석 처리. workflow_dispatch는 유지(수동 복원)
- [x] **fix** Fix A — `updateItemPrice`가 Firestore에 priceHistory 누락 저장하던 버그 (`store/useAppStore.ts:115-145`). `currentPrice` + `priceHistory.slice(-30)` 둘 다 저장하도록 수정 → 백그라운드 복귀 시 priceHistory 1개로 리셋되던 사고 차단
- [x] **fix** Fix B — `syncFromFirestore` 머지 정책으로 기존 사용자 데이터 보호. id 단위 매칭해서 `local.priceHistory.length > remote.priceHistory.length`면 local의 priceHistory + currentPrice 보존
- [x] **feat** Fix C — `ProductCard` 우측하단 trend 뱃지 추가. priceHistory 첫값 vs 마지막값 비교 → 📉 가격하락감지(빨강) / 📈 가격상승감지(파랑) / ➡️ 가격변동없음(그레이). priceHistory 2개 미만이면 미표시

### 2026-05-07 이후 미완

#### 🌅 내일 검증 (1.0.14 출시 후)
- [ ] **검증** 가격 그래프 — priceHistory 5개 이상 상품에서 SparklineChart 정상 노출, 5개 미만은 스킵
- [ ] ~~**검증** 아침/저녁 알림 정상 발송~~ — 5/7 폐기. notify-only.yml은 유지하되 인사 push 블록만 제거됨
- [ ] **검증** 골드박스 cron (07:30 KST) 첫 자동 실행 — `goldbox/{YYYY-MM-DD}` 생성 + productUrl affiliate prefix
- [ ] **검증** 1.0.14 실기기 — iOS 상품 추가 (link.coupang.com 단축 URL 처리) / Android 스크롤 (expo-image + 가상화 효과)

#### 📦 다음 빌드 (1.0.15) 때 수정
- [ ] **fix** priceHistory 동기화 fix 출시 — Fix A/B/C 코드 5/7 커밋. 빌드 출시되어야 클라이언트 효과
- [ ] **feat** 앱 공유 시 iOS/Android 구분 없이 앱스토어 + 구글플레이 링크 모두 발송
- [ ] **chore** Android proguard 설정 — 빌드 크기 축소 + 코드 보호
- [ ] **port** 아이고 빌드 — `ensureUserDoc` / 가격그래프 / 사달라고 조르기 / priceHistory fix(A/B/C) / trend 뱃지 등 지금이야 1.0.12~ 이식

#### 🔍 cron 검증 (잔여)
- [ ] **검증** shared-price-check cron 3차 재활성화 후 첫 자동 실행 (A~E 검증)
- [ ] **검증** 이벤트 cron (02:35 KST) 첫 실행 — D-7 윈도우 동작
- [ ] **검증** 쿠팡 PL cron 자동 실행 (07:30 KST 정기) — workflow_dispatch 외 schedule 트리거 + categoryName 응답 포함 여부
- [ ] **검증** 다음 cron 사이클에 `[ActiveUsers] token-dedup N건 제외` 로그 표시 + 갤럭시/아이폰 사용자가 morning push 1건씩 수령
- [ ] **검증** vendorItemId 매칭 로그 (`[API] vendorItemId=... 정확 매칭 → ...원 (옵션 고정)`)
- [ ] **확인** category_best.products[0].productUrl raw vs affiliate (Firebase Console)
- [ ] **갱신** `meta/config_jigumiya.minRequiredVersion` — 1.0.14 안정화 후 단계적 갱신
- [ ] **모니터링** Functions 응답시간 로그 (`minInstances:1` 후 콜드 스파이크 사라짐 확인, 최소 20회 표본)

### 누적 미완 (이전부터)
- [ ] **검증** 뱃지 카운트 0 초기화 — 다음 푸시 수신 후 foreground 전환 시 뱃지 제거 확인
- [ ] **검증** 파트너스 실적 — 가족 계정 구매 테스트 + 대시보드 집계
- [ ] **합의** Firebase 공유 구조 — 아이고 베타 출시 이후
- [ ] **이식** 아이고 Functions에 동일 수정 (HTML redirectWebUrl + Secret `.trim()`)
- [ ] **수정** 아이고 알림 버그 + 계정 삭제 버그
- [ ] **검증** 앱 측 price-drops 탭 라우팅 (`router.push('/price-drops')` expo-router 동작)
- [ ] **검토** Firebase App Check 활성화 (Public repo 환경 보강)
- [ ] **대기** 쿠팡 파트너스 문의 답변 (`bestcategories` 카운팅 방식)
- [ ] **별도 작업** 아이고 cron 활성화 (`~/aigo/aigo` 레포)
- [ ] **추적** `addTrackedItem`/`removeTrackedItem` increment 비대칭 (재발 모니터링)
- [ ] **별도 PR** `meta/stats.sharedProductCount` 자동 갱신 (FieldValue.increment)
- [ ] 메인 화면에 쿠팡 이동 버튼 추가 (위치/형태 미정)

### 참고 문서 (작업 리스트 외)
- 012_Phase2계획.md / 014_Phase3계획.md (구 로드맵, 이력 보존)
- 작업이력_archive.md (4/30 이전)
- docs/020_PriceChecker_CronDesign.md (§11 N값 기반 자동화 설계)

## 수익모델: 쿠팡 파트너스 단일 전략
- 수수료 3~10% (구매 발생 시 자동 수취). 파트너스 최종 승인 완료, API Access/Secret Key 발급
- EAS Secrets에 `EXPO_PUBLIC_COUPANG_ACCESS_KEY`/`SECRET_KEY` + Functions Secrets에 `COUPANG_ACCESS_KEY`/`SECRET_KEY` 등록 완료. 말미 `\n` 문제로 함수 코드에서 `.trim()` 방어
- deeplink API: `link.coupang.com/a/XXXXX` shortenUrl 반환 (입력 공유 URL 동일 prefix → slug 비교로 원본/제휴 구분)
- 코드: `services/coupangApi.ts` (클라이언트 HMAC fallback) / `functions/src/index.ts` (서버 HMAC + HTML `redirectWebUrl` 파싱)

## 현재 상태: 1.0.14 양 스토어 출시 완료 (2026-05-06 심야 기준)
- **1.0.14 (bn49/vc49) 양 스토어 출시 완료** (커밋 `75d97f4`):
  - iOS App Store + Android Play Store 출시 완료
  - 빌드 산출물: `~/jigumiya/builds/ios/jigumiya-1.0.14-49.ipa` (16.1 MB) / `~/jigumiya/builds/android/jigumiya-1.0.14-49.aab` (58.8 MB)
- **알림 시스템 A~E 재설계 + shared-price-check 3차 재활성화** (커밋 `48c1fed` + `fb324d9`):
  - A: 카테고리 베스트 알림 완전 제거 — shared_products 단일 출처
  - B: dropRate 60% 가드 + flush 직전 events.drops/ups dedup
  - C: morning/evening 요일별 단일 문구 (KST DOW)
  - D: 골드박스 cron 신설 — 07:30 KST, `goldbox/{YYYY-MM-DD}` 1콜/일
  - E: 이벤트 cron 신설 — 02:35 KST, 11개 이벤트, D-7 윈도우, search limit 10
- **새벽 cron 타임라인 (KST)**:
  - 01:00 event-best (아이고) / 01:15 baby1 / 01:30 baby2 / **02:00 category-best** / **02:35 event-best-jigumiya** / 03:00 baby3 / 03:20 baby4 / 04:30 shared-price Block zone 종료 / **07:30 goldbox + coupangPL + notify-only(morning)** / 20:00 notify-only(evening)
- Functions `resolveAndGenerateAffiliateUrl` `minInstances: 1` 배포 완료 (Cloud Run minScale=1, 콜드 스타트 제거, 월 ~$5~10)
- **GitHub 레포**: https://github.com/Tegisee/jigumiya (Public, Actions 무제한 무료)
- **`meta/config_jigumiya.minRequiredVersion = "1.0.8"`** (2026-05-02 갱신) — 1.0.14 안정화 후 단계적 갱신

## 주요 기술 현황

### shared-price-checker (Phase 3, 활성)
- 위치: `scripts/shared-price-checker/`, 워크플로우: `shared-price-check.yml` + `notify-only.yml`
- **§11 자동화** (커밋 `b49ea2e`): yml `*/10 * * * *` 고정 + 코드가 매 invocation에서 N값 read → §3 매트릭스(12단계, N≤400→10분 ~ N>13200→330분) 기반 간격 결정. 피크(07-22 KST) base, 비피크 ×2. `meta/stats.lastRunAt` start-to-start 간격 유지. 첫 실행 즉시 통과
- **알림 전용 cron** (`notify-only.yml`, `0bdc445`): `'30 22 * * *'`(07:30 KST) + `'0 11 * * *'`(20:00 KST). `NOTIFY_ONLY=true` 분기 → 가격 스캔/Cycle/Block zone/§11 가드 모두 스킵, `loadDropsForNotifyOnly()`로 price_drops 24h 조회 → events 재구성 → flush
- **Block zone 자동 대기**: 01:00 ≤ KST < 04:30 → 04:30까지 sleep. main 진입 직후 진입 시 즉시 graceful exit. notify-only 모드 면제
- **알림 7종 시스템** (2026-05-05 후반 A~E 재설계, `48c1fed`):
  - 활성: morning_greeting / price_drop_summary / target_reached / price_up_summary / evening_no_change
  - legacy: broadcast_drop10/20 (통계만, 발송 X)
  - 폐기: ~~category_broadcast~~ (PushPayload + events.categoryBroadcasts + screen='price_change' 통째 제거)
  - drop은 상품별 각각 1건, target/up은 합산. target 통과 시 drop bucket 자동 제외
  - 단일 형식 메시지: n===1 시 `{name} {prev}원 → {curr}원 ↓` + detail 라우팅. n>1 시 합산 + home 라우팅
  - morning(07-09 KST) / evening(19:30-21 KST) 시간대 분기 + KST 날짜 가드(`morningKstDate`/`eveningKstDate` 'YYYY-MM-DD' 비교, jitter ±10분 흡수)
  - **요일별 morning/evening 문구** (C): `getKstDayOfWeek()` lookup, title 시간대 통일, body 7개 단일 문구
  - **dropRate 60% 가드** (B): shared 본 흐름 `Math.abs(dropRate) > 60` 시 `[Skip-DropRateGuard]` 로그 + continue
  - **dedup** (B): flush 직전 `dedupByProductId<T>` 헬퍼로 events.drops/ups 첫 항목만 보존
  - 24h productId 가드: `users/{uid}.lastNotifications` (priceDrop[pid]/priceUp[pid]/targetReached[pid]/categoryBroadcast[legacy 보존]/broadcast.tier10|tier20[legacy])
  - flush 끝에서 successfulTokens 기반 dotted-path update — 발송 실패 시 가드 박히지 않음 (5/3 사고 fix `096c69a`)
- **앱 필터링** (5/5 strict): `users/{uid}.app === 'jigumiya'` 단일 발송. aigo/unknown/null 모두 제외. aigoUsers 분리 변수 제거
- **token dedup** (5/6, 갤럭시 4 push 사고 fix): `fetchActiveUsers`에서 `seenTokens: Map<token, firstUid>` — 동일 expoPushToken을 공유하는 uid 다수일 때 첫 등장 uid만 보존. dup uid는 `[ActiveUsers] dup-token uid=… kept-first=…` 로그 + 스킵. 모든 payload 빌드 자동 적용
- **카테고리 round-robin** (`category-cycle.ts`, A로 재작성): shared_products 순회 끝난 후 매 사이클 1회. **fetch + 문서 갱신만** (가격 비교/알림 push 전체 제거). 3 컬렉션 각 2개씩 = 6콜/사이클. `category_best`은 `updateDoc:false`(02:00 cron 단독 갱신), baby/event는 set merge
- **F sleep**: `DEFAULT_SLEEP_MS = 2000` 단일값. N=51 1회 ~70초
- 시작 로그: `[Schedule] N=N interval=Nmin(peak/offPeak) since=N — 실행 진행` / `[Cycle] N=N daily=N cycles=N sleep=2000ms` / `[ActiveUsers] jigumiya=N (발송 대상) | skip: aigo=N unknown=N other=N` / `[CategoryCycle] {col} 처리 완료 api=N updated=N` / `[Skip-DropRateGuard] {pid} dropRate=...% — 알림 스킵`

### goldbox-updater (2026-05-05 후반 신설, 매일 07:30 KST)
- 위치: `scripts/goldbox-updater/`, 워크플로우: `.github/workflows/goldbox-update.yml` (`30 22 * * *`)
- 엔드포인트: `/v2/providers/affiliate_open_api/apis/openapi/products/goldbox` (v1 prefix 없음 — 다른 OpenAPI와 다른 경로)
- 동작: 1콜 fetch → goldbox 응답의 productUrl이 이미 affiliate URL이므로 별도 deeplink 변환 X → Firestore `goldbox/{YYYY-MM-DD KST}` 저장
- 페이로드: `{ date, products: [{ productId, productName, productPrice, productImage, deepLink }], updatedAt }`
- 호출량: 1콜/일. rate-limited 감지 시 즉시 종료 (당일 재실행 없음)

### coupangpl-updater (2026-05-06 신설, 매일 07:30 KST)
- 위치: `scripts/coupangpl-updater/`, 워크플로우: `.github/workflows/coupangpl-update.yml` (`30 22 * * *`)
- 엔드포인트: `/v2/providers/affiliate_open_api/apis/openapi/products/coupangPL` (v1 prefix 없음 — goldbox와 동일 패턴)
- 동작: 1콜 fetch (limit 100, 최대) → coupangPL 응답의 productUrl이 이미 affiliate URL이므로 별도 deeplink 변환 X → Firestore `coupang_pl/{YYYY-MM-DD KST}` 저장
- 페이로드: `{ date, products: [{ productId, productName, productPrice, productImage, deepLink, isRocket, isFreeShipping }], updatedAt }`
- 호출량: 1콜/일. rate-limited 감지 시 즉시 종료 (당일 재실행 없음)
- 골드박스 cron과 동시 실행 (07:30 KST 동일 슬롯)
- 첫 수동 실행 (5/6): 87개 저장 (`coupang_pl/2026-05-06`, run `25421238308`, 16초)

### event-best-jigumiya-updater (2026-05-05 후반 신설, 매일 02:35 KST)
- 위치: `scripts/event-best-jigumiya-updater/`, 워크플로우: `.github/workflows/event-best-jigumiya-update.yml` (`35 17 * * *`)
- 11개 이벤트 정의 (`events-jigumiya.ts`): valentine(02-14) / samgyeopsal(03-03) / whiteday(03-14) / childrensday(05-05) / parentsday(05-08) / teachersday(05-15) / couplesday(05-21) / roseday(06-14) / halloween(10-31) / pepero(11-11) / christmas(12-25)
- D-7 윈도우 매칭: 오늘 KST 포함 7일에 이벤트 date 포함 시만 갱신, 그 외 graceful exit
- search API limit 상한 10개 (`SEARCH_LIMIT_MAX=10` + `Math.min` 가드, `PRODUCTS_PER_KEYWORD` 기본 10)
- 키워드 dedupe → 가격 desc → 상위 50개 → Firestore `event_best_jigumiya/{slug}` 저장
- 페이로드: `{ slug, eventName, date, keywords, minPrice, products: [{ productId, productName, productPrice, productImage, deepLink: productUrl, isRocket }], updatedAt }`
- 호출량: D-7 이내 평균 1~2개 × 키워드 4개 = 4~8콜/일. 키워드 사이 sleep 2초

### 서버 cron 활성 목록 (KST)
| 시각 | 워크플로 | 역할 |
|------|---------|------|
| 01:00 | event-best (아이고) | 31개 슬러그 × 평균 4 키워드 ≈ 124 콜 |
| 01:15 | baby1 (아이고, 16) | 슬러그당 키워드 평균 2.5개 |
| 01:30 | baby2 (아이고, 14) | 동일 |
| 02:00 | `category-best-update.yml` | 19개 × 80초 sleep ≈ 24분 |
| **02:35** | **`event-best-jigumiya-update.yml`** | **D-7 윈도우 매칭 갱신 (신규)** |
| 03:00 | baby3 (아이고, 10) | 동일 |
| 03:20 | baby4 (아이고, 14) | 동일 |
| 04:30~01:00 | `shared-price-check.yml` `*/10 * * * *` | shared_products 가격체크 + 카테고리 fetch (Block zone 가드) |
| **07:30** | **`goldbox-update.yml`** + **`coupangpl-update.yml`** + `notify-only.yml` | **goldbox 1콜 + 쿠팡 PL 1콜 (limit 100, 5/6 신규) / morning_greeting 발송** |
| 20:00 | `notify-only.yml` | evening_no_change 발송 |
| (수동) | `tracked-backfill.yml` | productId 누락 보강 (1회 적용 완료, 5/2) |

비활성: legacy `price-check.yml.disabled` (Phase 3-C에서 정식 폐기 예정)

### tracked-backfill (1회 실행 완료, 5/2)
- `users/{uid}/items/*` 스캔 → productId 누락 → resolvedUrl/url/affiliateUrl + extractProductId 4패턴으로 재추출 → tracked doc 생성
- collectionGroup('tracked')에서 productId 필드 누락 doc ID로 보강
- collectionGroup 실측 카운트로 `shared_products.trackerCount` 정정 (음수/불일치)
- 실행 결과: productId 5건 보강 + trackerCount 음수/불일치 정정

### 클라이언트 CoupangScraper (WebView DOM)
- 상품 추가 시 + 수동 새로고침
- iOS Universal Link 이탈 fix: fetch HTML → WebView에 html 문자열 로드 (네트워크 탐색 없음)
- 쿠팡 앱 다운로드/열기 배너 CSS 차단
- iOS 쿠팡 튕김 개선 (2~3회 → 1회): onShouldStartLoadWithRequest 딥링크 차단 + allowsBackForwardNavigationGestures={false} + iOS HTML fetch
- 타임아웃 20초, 단계적 재시도(2초/4초/6초), 실패 시 "다시 시도" 버튼

### 앱 구조 (1.0.6+ 4탭)
- 탭: 홈(추적 10개) / 자주사는(무제한) / 카테고리 베스트 / 가격변동. 설정은 Stack
- 카테고리 베스트(019 §8-A): `category_best/{categoryId}` 구독 → 카테고리 칩 가로 스크롤 + 1~3위 민트 랭크 뱃지 + 로켓 이모지 + 파트너스 의무 고지
- 가격변동: `price_drops` 컬렉션 구독, 필터 칩(전체/-10%/-20%) + 하락률 뱃지
- 자주사는 토글: 홈 카드 우상단 하트 + 상세 CTA 옆. `useFavoriteToggle` 공용
- 상품 삭제: 스와이프(왼쪽) + 롱프레스 오버레이 + 상세 삭제
- 홈 10개 제한: `MAX_TRACKED_ITEMS = 10` (`services/config.ts`)
- 뱃지 초기화: `services/notifications.ts:clearBadgeCount` + `_layout.tsx`에서 앱 실행 + AppState active 시 호출
- Firebase Auth: onAuthStateChanged로 AsyncStorage 복원 후 UID 판단
- Firebase Config: Platform.OS별 appId 분기, app.config.js로 변환

### 앱 내 딥링크 변환
- **Firebase Functions `resolveAndGenerateAffiliateUrl` 우선** → 실패 시 `coupangApi.ts generateDeepLink` fallback
- Functions: 2세대 callable, asia-northeast3, Node 22, Secrets, `allUsers:run.invoker` + `request.auth` 이중 보안, **`minInstances: 1`** (콜드 스타트 제거)
- 핵심: `link.coupang.com/a/...` 200 HTML에서 `redirectWebUrl='...\x3D...'` JS hex-escape 디코드 → vp URL 추출 → `/deeplink` API 호출 → shortenUrl 반환
- 상세: docs/018_FirebaseFunctions_Resolver.md

### 오늘의 특가 (1.0.8, `dd15624`)
- 데이터 출처: `subscribePriceDrops(cb, 30, 24)` 24h 상위 20개 + `fetchAllCategoryBest()` 1h AsyncStorage 캐시 fallback
- productId Set 중복 회피, 클릭 시 affiliate 변환 보장

## 빌드 아티팩트
- 네이밍: `jigumiya-{version}-{versionCode}[-dev].{aab|apk|ipa}`
- 저장: `~/jigumiya/builds/android/` (AAB, APK) / `~/jigumiya/builds/ios/` (IPA)
- .gitignore에 포함 — 빌드 파일은 커밋하지 않음

## 버전 관리 정책
- `eas.json` `appVersionSource: "local"` — `app.config.js`가 진실 원천, EAS remote 무시
- `production.autoIncrement` 제거 — 실패 빌드가 버전을 먹지 않음
- 버전 bump 시 수정 대상:
  1. `app.config.js` — `version`, `ios.buildNumber`, `android.versionCode`
  2. `android/app/build.gradle` — `versionCode`, `versionName` (gitignored, 로컬 동기화)
- `android/`가 로컬 존재하면 prebuild 스킵 → `build.gradle` 값이 최종 사용 → 양쪽 동기화 필수
- Play Store / App Store는 단조 증가만 허용

## 로컬 빌드 주의사항

### Android
- `app.config.js android.versionCode` + `build.gradle versionCode/versionName` 동기화 확인
- `google-services.json`은 .gitignore이므로 `.easignore`를 git 루트에 생성해야 로컬 빌드 시 포함
- 빌드: `eas build --local --profile production --platform android`

### iOS
- `app.config.js ios.buildNumber` 확인 (autoIncrement OFF)
- fastlane 필요 — `brew install fastlane`
- `GoogleService-Info.plist`도 `.easignore`에서 제외해야 빌드 포함
- `ios/` 네이티브 디렉토리 있으면 prebuild 스킵 — 네이티브 설정 변경 시 삭제 후 재빌드
- 빌드: `eas build --local --profile production --platform ios`
- 결과물: app-store 서명 IPA → Transporter로 App Store Connect 수동 업로드 (`eas submit` 금지 — §017 §12)

## Firebase 공유 설계 (지금이야 ↔ 아이고)
양쪽 앱이 동일 Firebase 프로젝트(jigumiya) 공유. 아이고 베타 출시 후 통합 예정.

### 공유 컬렉션 구조
- `category_best/{categoryId}` — **지금이야** cron (19 카테고리 × 50 = 950 상품)
- `category_best_baby/{slug}` — **아이고** cron (월령별 baby)
- `event_best/{eventSlug}` — **아이고** cron (기념일 31개, `minPrice=30000`)
- `event_best_jigumiya/{slug}` — **지금이야** cron (5/5 신규, 11개 이벤트, D-7 윈도우)
- `shared_products/{productId}` — **양쪽** 추가 + 지금이야 가격체크 갱신
- `price_drops/{productId}` — **지금이야** cron (가격 하락 자동 기록, 멱등 upsert)
- `goldbox/{YYYY-MM-DD}` — **지금이야** cron (5/5 신규)

### 분리 유지
- `users/{uid}` — 앱별 분리 (FCM 토큰 + tracked + favorites + `app` 필드 strict)

### 호출 방식 (공통 정책)
- `limit=10` (search API 응답 상한), 호출당 sleep 2초, 분당 최대 30회 (공식 50/분 대비 보수)
- rate-limited 응답 즉시 중단 (재시도 없음)
- `event_best` 전용: `minPrice=30000`. `event_best_jigumiya`는 이벤트별 minPrice 정의

## 형제 앱
- 지금이야와 아이고(`~/aigo/aigo`)는 형제 앱 — 동일 개발자, 동일 기술 스택 (RN + Expo + Firebase)
- 한 앱 노하우는 다른 앱에 이식 (로컬 빌드, Firebase 구조, 파트너스 API)
- **공통 이슈**: 파트너스 실적 미집계(쿠팡 공유 링크 구조) — 아이고도 AQ-4로 동일 → Functions Resolver(018) 동일 적용 예정
- **이식 대기**: 지금이야 Functions 3대 버그 수정(`e69d05e`) — HTML `redirectWebUrl` 파싱, Secret `.trim()`, `request.auth` 검증, `allUsers:run.invoker`
- **Firebase 프로젝트 통합**: jigumiya 기반 — 아이고 베타 출시 이후 (2026-04-20 합의)
- **아이고 전용 설계**: `baby_category` 월령별 구조는 아이고 측에서 별도
- 장기: 파트너스 계정 2개로 키 분리 검토

## 앱 기본 정보
- 앱 이름: 지금이야 (Jigumiya)
- 번들 ID: com.jigumiya.app
- 프로젝트 경로: ~/jigumiya/jigumiya
- Expo 계정: june56189906
- GitHub: Tegisee/jigumiya
- 터미널 단축: ji
