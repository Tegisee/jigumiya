# 024. 앱 전체 아키텍처 다이어그램 (1.0.16 기준)

> **작성일**: 2026-05-11
> **버전**: 1.0.16 (bn51/vc51) — RealPrice 아키텍처(docs/023) 도입 완료 상태 반영
> **범위**: 프론트엔드(Expo Router) · 상태관리(Zustand) · Firebase(Firestore + CF) · cron(GitHub Actions) · 쿠팡 파트너스 API

---

## 1. 프론트엔드 — Expo Router 화면 구조

```mermaid
graph TB
  Root["app/_layout.tsx<br/>(루트: AppState/뱃지/딥링크)"]

  Root --> Tabs["app/(tabs)/_layout.tsx<br/>(4탭 네비게이터)"]
  Root --> Detail["app/detail/[id].tsx<br/>상품 상세"]
  Root --> AddModal["app/modal/add-item.tsx<br/>상품 추가"]
  Root --> Privacy["app/modal/privacy.tsx<br/>개인정보"]
  Root --> TodayBest["app/today-best.tsx<br/>오늘의 베스트"]
  Root --> CoupangPL["app/coupang-pl.tsx<br/>쿠팡 PL"]
  Root --> EventBest["app/event-best.tsx<br/>이벤트 베스트"]
  Root --> ShareIntent["app/shareintent.tsx<br/>공유 인텐트 핸들러"]
  Root --> NativeIntent["app/+native-intent.tsx<br/>딥링크 처리"]
  Root --> Admin["app/admin.tsx<br/>관리자 모드"]

  Tabs --> Home["(tabs)/index.tsx<br/>홈 — 추적 10개"]
  Tabs --> Favs["(tabs)/favorites.tsx<br/>자주사는 — 무제한"]
  Tabs --> Drops["(tabs)/price-drops.tsx<br/>가격변동"]
  Tabs --> Settings["(tabs)/settings.tsx<br/>설정"]

  Home -.-> Detail
  Favs -.-> Detail
  Drops -.-> Detail
  Home -.-> AddModal
  Home -.-> TodayBest
  Home -.-> CoupangPL
  Home -.-> EventBest
  Settings -.-> Admin

  ShareIntent -.-> AddModal
  NativeIntent -.-> AddModal

  classDef tab fill:#1f6f5c,stroke:#88e1c8,color:#fff
  classDef stack fill:#2d3748,stroke:#94a3b8,color:#fff
  classDef modal fill:#5b21b6,stroke:#c4b5fd,color:#fff
  class Home,Favs,Drops,Settings tab
  class Detail,TodayBest,CoupangPL,EventBest,Admin,ShareIntent,NativeIntent stack
  class AddModal,Privacy modal
```

---

## 2. 상태관리 — Zustand `useAppStore` ↔ Firestore

```mermaid
graph LR
  subgraph Store["store/useAppStore.ts"]
    State["state<br/>· trackedItems[]<br/>· notificationEnabled<br/>· hasSeenOnboarding"]
    Actions["actions<br/>· addItem (async, shared 머지)<br/>· removeItem<br/>· updateTargetPrice<br/>· updateItemPrice (realPrice mirror)<br/>· syncFromFirestore (3-way merge)<br/>· backfillProductIds<br/>· toggleNotification<br/>· resetAllData"]
  end

  subgraph FS["Firestore"]
    UsersDoc[("users/{uid}")]
    Items[("users/{uid}/items/{id}")]
    Tracked[("users/{uid}/tracked/{pid}")]
    Favorites[("users/{uid}/favorites/{pid}")]
    Shared[("shared_products/{pid}<br/>apiPrice · realPrice<br/>priceHistory · trackerCount<br/>lastRealPriceUpdatedAt · needsCheck")]
  end

  Actions -- "saveItem / fetchItems / updateItem" --> Items
  Actions -- "ensureUserDoc / lastActiveAt" --> UsersDoc
  Actions -- "addTrackedRef / removeTrackedRef" --> Tracked
  Actions -- "subscribeFavorites / toggle" --> Favorites
  Actions -- "getSharedProduct (addItem 머지)<br/>upsertSharedProduct (realPrice write)<br/>fetchSharedProductsByIds (sync)" --> Shared

  Tracked -. "트리거" .-> SharedCount["incrementTrackerCount"]
  SharedCount --> Shared

  State -.-> Actions
```

---

## 3. Firebase — Firestore 컬렉션 + Cloud Functions

```mermaid
graph TB
  subgraph App["📱 앱 (RN + Expo)"]
    Client["services/firebase.ts<br/>(CRUD 래퍼)"]
    Scraper["components/CoupangScraper.tsx<br/>(WebView realPrice 추출)"]
    Callable["callResolveAffiliate()"]
  end

  subgraph Firestore["🔥 Firestore (asia-northeast3)"]
    direction TB
    U[("users/{uid}<br/>+ items / tracked / favorites")]
    SP[("shared_products/{pid}<br/>realPrice · apiPrice · priceHistory<br/>trackerCount · needsCheck")]
    PD[("price_drops/{date-uid-pid}")]
    CB[("category_best/{categoryId}")]
    CBB[("category_best_baby/{slug}")]
    EB[("event_best/{slug}")]
    EBJ[("event_best_jigumiya/{slug}")]
    GB[("goldbox/{YYYY-MM-DD}")]
    PL[("coupang_pl/{YYYY-MM-DD}")]
    Meta[("meta/config_jigumiya<br/>minRequiredVersion · forceUpdate")]
  end

  subgraph CF["☁️ Cloud Functions (asia-northeast3)"]
    Resolve["resolveAndGenerateAffiliateUrl<br/>(callable, minInstances:1)<br/>link → vp + /deeplink"]
    Warmup["warmupResolveAffiliate"]
    Trigger["onSharedProductRealPriceChange<br/>(v2 Firestore onUpdate)<br/>realPrice 변경 → 목표가 도달 알림"]
  end

  Client --> U
  Client --> SP
  Client --> CB
  Client --> CBB
  Client --> EBJ
  Client --> GB
  Client --> PL
  Client --> Meta
  Client -. "subscribePriceDrops" .-> PD

  Scraper -- "realPrice + lastRealPriceUpdatedAt write" --> SP
  SP -- "onUpdate" --> Trigger
  Trigger -- "FCM push (target_reached)" --> Push((📨 FCM))
  Trigger -- "needsCheck false write-back" --> SP

  Callable --> Resolve
  Resolve -- "쿠팡 API /deeplink" --> Coupang((🅒 쿠팡 파트너스 API))
```

---

## 4. cron — GitHub Actions 타임라인 (KST)

```mermaid
gantt
  title GitHub Actions cron 스케줄 (KST 기준 / 1.0.16)
  dateFormat HH:mm
  axisFormat %H:%M

  section 가격 스캔
  shared-price-check (*/10 + 04:30~01:00 가드)   :active, p1, 00:00, 24h

  section 카테고리/이벤트
  category-best (02:00)             :crit, c1, 02:00, 30m
  event-best-jigumiya (02:35)       :crit, e1, 02:35, 20m

  section 골드박스/PL
  goldbox-updater (07:30)           :g1, 07:30, 10m
  coupangpl-updater (07:30)         :g2, 07:30, 10m

  section 알림 전용
  notify-only (morning 07:30)       :milestone, n1, 07:30, 0m
  notify-only (evening 20:00)       :milestone, n2, 20:00, 0m
```

```mermaid
graph LR
  subgraph Workflows[".github/workflows/"]
    W1["shared-price-check.yml<br/>*/10 * * * *"]
    W2["category-best-update.yml<br/>02:00 KST"]
    W3["event-best-jigumiya-update.yml<br/>02:35 KST"]
    W4["goldbox-update.yml<br/>07:30 KST"]
    W5["coupangpl-update.yml<br/>07:30 KST"]
    W6["notify-only.yml<br/>07:30 + 20:00 KST"]
    W7["tracked-backfill.yml<br/>workflow_dispatch"]
  end

  subgraph Scripts["scripts/"]
    S1["shared-price-checker/index.ts<br/>· apiPrice mirror<br/>· lastRealPriceUpdatedAt 1h 가드<br/>· needsCheck 플래그(≥10%)<br/>· price_drop/price_up 알림<br/>· target_reached: CF가 인계"]
    S2["category-best-updater"]
    S3["event-best-jigumiya-updater<br/>(D-7 윈도우만)"]
    S4["goldbox-updater"]
    S5["coupangpl-updater"]
    S6["shared-price-checker<br/>(NOTIFY_ONLY=true)"]
    S7["tracked-backfill<br/>(productId/trackerCount 보강)"]
  end

  W1 --> S1
  W2 --> S2
  W3 --> S3
  W4 --> S4
  W5 --> S5
  W6 --> S6
  W7 --> S7

  S1 --> CoupangAPI((🅒 쿠팡 API))
  S2 --> CoupangAPI
  S3 --> CoupangAPI
  S4 --> CoupangAPI
  S5 --> CoupangAPI

  S1 --> FS[("Firestore")]
  S2 --> FS
  S3 --> FS
  S4 --> FS
  S5 --> FS
  S6 --> FCM((📨 FCM))
  S7 --> FS
```

---

## 5. 쿠팡 파트너스 API 흐름 — 3개 진입점

```mermaid
graph TB
  subgraph Entry1["① 클라이언트 WebView (realPrice 진실 원천)"]
    AddItem["app/modal/add-item.tsx"] --> CS["components/CoupangScraper.tsx<br/>(SCRAPE_JS 0.5s × 20회 폴링)"]
    CS --> SPW[/"shared_products.realPrice<br/>lastRealPriceUpdatedAt"/]
  end

  subgraph Entry2["② Cloud Functions (공유 URL 해석)"]
    Callable["services/firebase.ts<br/>callResolveAffiliate()"] --> CFFn["resolveAndGenerateAffiliateUrl<br/>(minInstances:1)"]
    CFFn -- "link.coupang.com → vp URL resolve<br/>+ /deeplink HmacSHA256" --> CPAPI1((🅒))
  end

  subgraph Entry3["③ cron 직접 호출 (apiPrice + 큐레이션)"]
    Cron1["shared-price-checker"] --> CoupangSvc["services/coupangApi.ts<br/>(generateAuthorization HmacSHA256)"]
    Cron2["category-best-updater"] --> CoupangSvc
    Cron3["event-best-jigumiya-updater"] --> CoupangSvc
    Cron4["goldbox-updater"] --> CoupangSvc
    Cron5["coupangpl-updater"] --> CoupangSvc
    CoupangSvc -- "Rate Limit:<br/>분 30회 (보수)<br/>호출당 sleep 2s" --> CPAPI2((🅒))
  end

  CPAPI1 -.-> Coupang[("쿠팡 파트너스 Open API")]
  CPAPI2 -.-> Coupang

  SPW -. onUpdate .-> TriggerNote["onSharedProductRealPriceChange<br/>→ 목표가 도달 알림"]

  classDef truth fill:#065f46,stroke:#34d399,color:#fff
  classDef api fill:#9a3412,stroke:#fdba74,color:#fff
  classDef mirror fill:#1e3a8a,stroke:#93c5fd,color:#fff
  class CS,SPW truth
  class Coupang,CPAPI1,CPAPI2 api
  class CoupangSvc,CFFn mirror
```

---

## 6. 통합 데이터 흐름 — RealPrice 아키텍처 (1.0.16)

```mermaid
sequenceDiagram
  autonumber
  participant U as 👤 사용자
  participant App as 📱 앱 (Expo)
  participant Store as 🗃️ useAppStore
  participant FS as 🔥 Firestore
  participant CF as ☁️ Cloud Functions
  participant Cron as ⏰ GitHub Actions
  participant API as 🅒 쿠팡 API
  participant FCM as 📨 FCM

  Note over U,FCM: 시나리오 A — 상품 추가
  U->>App: 공유 URL 전달 (Share Intent)
  App->>CF: callResolveAffiliate(sharedUrl)
  CF->>API: /deeplink HmacSHA256
  API-->>CF: vp URL + affiliate
  CF-->>App: resolved URL
  App->>App: CoupangScraper WebView 로드
  App->>Store: addItem(item)
  Store->>FS: getSharedProduct(pid) — 과거 priceHistory 머지
  Store->>FS: saveItem + upsertSharedProduct(realPrice)

  Note over U,FCM: 시나리오 B — cron 가격 스캔 (10분마다)
  Cron->>FS: shared_products 조회 (lastRealPriceUpdatedAt > 1h)
  Cron->>API: searchProducts (apiPrice)
  Cron->>FS: shared_products.apiPrice + needsCheck (≥10%)
  Cron->>FS: price_drops + lastNotifications 24h 가드
  Cron->>FCM: price_drop / price_up summary push

  Note over U,FCM: 시나리오 C — WebView 새로고침 → 정확한 알림 (CF 트리거)
  U->>App: 앱 오픈 / 새로고침
  App->>App: CoupangScraper 재실행
  App->>FS: shared_products.realPrice write
  FS->>CF: onSharedProductRealPriceChange 트리거
  CF->>FS: tracked 사용자 조회 + target 필터 + token dedup
  CF->>FCM: target_reached push
  CF->>FS: needsCheck = false

  Note over U,FCM: 시나리오 D — 관리자 모드 (홀짝 분배 자동 순회)
  U->>App: 관리자 진입
  App->>FS: fetchAllSharedProducts()
  loop 담당 인덱스 (홀수/짝수)
    App->>App: WebView 순차 로드 (3~5s/개)
    App->>FS: shared_products.realPrice write
    FS->>CF: onUpdate 트리거
  end
```

---

## 7. 핵심 노트

### 알림 발송 책임 (1.0.16 분리)
| 알림 유형 | 발송 주체 | 트리거 |
|---------|---------|--------|
| `price_drop_summary` | cron (shared-price-checker) | apiPrice 하락 감지 |
| `price_up_summary` | cron (shared-price-checker) | apiPrice 상승 감지 |
| `target_reached` | **Cloud Functions** (`onSharedProductRealPriceChange`) | realPrice ≤ targetPrice |
| 골드박스 / 이벤트 유도 | cron (notify-only) | 07:30 / 20:00 정시 |

> cron 측 `target_reached` 발송 코드는 주석 처리 상태 — 1.0.16 베타 검증 후 정식 삭제 예정.

### 진실 원천 (Source of Truth)
- **realPrice**: 앱 WebView 만 write — 알림/그래프 기준
- **apiPrice**: cron 만 write — 참고용 (변동 감지 시 needsCheck 플래그만)
- **priceHistory**: realPrice 기준으로만 누적 (`{ date, realPrice }`)

### Rate Limit 준수
- 쿠팡 파트너스 공식: 검색 1분/50회, 전체 합산 1분/100회
- cron 보수 설정: 호출당 sleep 2s, 분당 최대 30회
- rate-limited 응답 시 즉시 중단 (재시도 없음)

---

## 참조
- [docs/023_RealPrice_Architecture.md](./023_RealPrice_Architecture.md) — apiPrice/realPrice 분리 아키텍처
- [docs/017_앱구조개편_Phase3.md](./017_앱구조개편_Phase3.md) — 4탭 + shared_products 도입
- [docs/018_FirebaseFunctions_Resolver.md](./018_FirebaseFunctions_Resolver.md) — resolveAndGenerateAffiliateUrl 설계
- [docs/020_PriceChecker_CronDesign.md](./020_PriceChecker_CronDesign.md) — cron 매트릭스 설계
