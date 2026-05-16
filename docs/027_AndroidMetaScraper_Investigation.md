# 027. AndroidMetaScraper 조사 — 갤럭시 상품 추가 메타 빈값 (1.0.21)

> **상태**: 🔍 조사 완료 / ⏸ WebView 방식 보류 (2026-05-17)
> 관련 commits: `bcad8f4` ~ `170dcf4` (1.0.21 누적)
> 관련 문서: [026_ApiPriceOnly_Redesign.md](./026_ApiPriceOnly_Redesign.md) (1.0.20 설계)

---

## 1. 배경 — 1.0.20 출시 후 발견된 잔여 버그

1.0.20에서 apiPrice 단일 출처 + WebView 제거 완료. 그러나 **갤럭시 사용자 상품 추가 시 카드에 이미지/가격 0원**으로 저장되는 케이스 잔존.

원인 분석 (1.0.20 분기):
- Functions `resolveAndGenerateAffiliateUrl`이 vp HTML OG 파싱 시 **Akamai HTTP 403** 응답 → 메타 빈값
- `searchProducts` fallback은 **상품명 텍스트 키워드**가 필요한데 갤럭시 공유 시 sharedText에 상품명 없으면 무력
- productId 숫자로 searchProducts 호출 시 쿠팡이 "검색 불가 키워드"로 분류 → 무관 상품 5개 반환 (이전 분석 docs/026 후속에서 확정)

→ **두 갈래 fallback 모두 빈값** → cron이 첫 갱신할 때까지 placeholder 카드 유지

---

## 2. 케이스 분류

### 케이스 1 — 다른 사용자가 이미 추적 중인 상품
- `shared_products/{productId}` 문서가 이미 존재 + 정상 메타 보유
- 신규 사용자 추가 시 shared 머지로 즉시 정상화 가능

### 케이스 2 — 신규 상품 첫 등록 (갤럭시)
- `shared_products` 문서 없음 → 머지 출처 X
- Functions + searchProducts 둘 다 빈값
- 카드에 "상품 정보 없음" + 0원 + 회색 placeholder 이미지

---

## 3. 케이스 1 해결 — shared 머지 확장 (commit `1f4741e`)

`store/useAppStore.ts addItem` 머지 블록 확장:
- `!item.thumbnail && snapshot.thumbnail` → 상속
- `isInvalidProductName(item.productName) && !isInvalidProductName(snapshot.productName)` → 상속
- `item.currentPrice <= 0 && (snapshot.apiPrice ?? snapshot.currentPrice) > 0` → 상속
- `priceHistory` 머지 시 오늘자 가격은 머지된 `currentPrice` 사용

`services/firebase.ts`:
- `isInvalidProductName(name)` 헬퍼 신설 — 빈값 / `쿠팡을?\s*추천\s*합니다!?` 정규식 / `'상품 정보 없음'` 3종 판정
- `trackedItemToSharedProduct` validation 3중: `productId` 없음 / invalid name / 빈 thumbnail → null 반환 (dead shared 문서 생성 방지)

**효과**: 케이스 1 즉시 정상화. 다른 사용자가 정상 메타로 추가한 상품은 placeholder 입력으로도 자동 채워짐.

---

## 4. 케이스 2 — AndroidMetaScraper 신규 시도

### 4-1. 설계 (commit `1f4741e`)

`components/AndroidMetaScraper.tsx` 신설 — 1.0.15 CoupangScraper 패턴 부활 + 백그라운드 silent 모드.

**동작 조건**:
- `Platform.OS === 'android'`
- Functions + searchProducts 모두 메타 빈값
- `resolvedUrl`이 vp/vm URL
- → `add-item.tsx target 단계 진입 직후 useState로 scraperUrl 세팅`

**아키텍처**:
- 0×0 hidden WebView (opacity 0)
- target 단계 미리보기 노출과 병행 (사용자 대기 시간 추가 X)
- 결과 도착 시 `onMeta` 콜백 → 부모가 `setMeta` 머지 + `setScraperUrl(null)` 즉시 unmount
- 10초 timeout → silent fail

### 4-2. 점진적 개선 (commit 순서)

| commit | 변경 |
|--------|------|
| `1f4741e` | 신규 컴포넌트 + add-item 통합 |
| `6c0eb23` | 발동 분기 전수 로깅 (`isAndroid` / `metaIncomplete` / `isVpVm` / `resolvedUrl`) |
| `941f4e0` | WebView 라이프사이클 로그 6종 (onLoadStart/End/Error/HttpError/ShouldStartLoad) |
| `f567751` | setScraperUrl 호출 6곳 전수 로깅 |
| `63e8178` | **버그 fix**: `prevUrlRef = useRef(url)` → `useRef<string \| null>(null)` (첫 mount timeout 미시작 버그) |
| `fbc66a7` | 클라이언트 fallback 강화 — chain 5단계 + Safari UA + productId 안전망 |
| `a5043b0` | SCRAPE_JS debug payload — titleTag/h1/meta/og/ldJson/bodyLen/appBanner |
| `35853a8` | SCRAPE_JS 단발 1500ms → 자체 0.5s × 8회 폴링 (SPA hydration 대응) |
| `134e2ca` | m. 변환 제거 (www. 그대로) + 403 fallback (m.→www. 1회 안전망) |
| `20305da` | UA: Pixel → Galaxy S24 (SM-S921B) + incognito off |
| `c3de9f4` | PRELOAD_JS 완전 제거 (SPA 라우팅 깨짐 가설 검증) |
| `170dcf4` | vp 페이지 reload 시 SCRAPE_JS 재주입 허용 (postMessage 0건 fix) |

---

## 5. 디버깅 발견 — 쿠팡의 의도적 WebView 차단

### 5-1. 증상 시퀀스

1. **403 단계**: 초기 m.coupang.com 시도 → HTTP 403 (bodyLen=97) → www. fallback 진입
2. **빈 페이지 단계**: www.coupang.com 200 OK이지만 OG/ld+json/title 모두 빈값 (`ready=complete + bodyLen<100`)
3. **루프 단계**: onLoadStart/onLoadEnd 반복, postMessage 한 번도 도달 X
4. PRELOAD_JS 제거 후에도 동일 증상 → SPA 깨짐 가설 기각
5. UA Galaxy S24 + incognito off 적용 후에도 동일

### 5-2. 결정적 비교 — Chrome vs WebView

같은 갤럭시 디바이스에서:
- **Chrome 브라우저**: `https://www.coupang.com/vp/products/...` 접속 → 정상 vp 페이지 (정상 OG/가격/이미지)
- **WebView (지금이야 앱 내)**: 동일 URL → 빈 페이지 또는 앱 유도 인터스티셜로 강제 redirect

차이점: **쿠팡 앱 설치 여부 + WebView UA 패턴** 조합으로 쿠팡이 의도적으로 다른 페이지 서빙.

### 5-3. 결론

**쿠팡이 앱 설치된 기기에서 WebView 접근을 의도적으로 차단**.
- m.coupang.com: HTTP 403 Akamai (이전과 동일)
- www.coupang.com: 200이지만 vp 콘텐츠 비제공 + 앱 유도 페이지로 라우팅
- Chrome은 우회 가능 (앱 미설치 시뮬레이션 가능한 환경)
- WebView는 `Android-App` 패턴이 헤더/Client Hints에 노출되어 식별

→ **WebView 기반 fallback은 근본적으로 우회 불가능** (UA/incognito/PRELOAD 어떤 조합으로도 해결 안 됨)

---

## 6. 1.0.21 변경 사항 정리

### 성공 (유지)
- ✅ **케이스 1 (shared 머지 상속)** — 다른 사용자 추적 중인 상품 자동 정상화
- ✅ **클라이언트 fallback chain 5단계** + Safari UA + productId 안전망 (commit `fbc66a7`)
- ✅ **상세페이지 목표가 수정 모달** (commit `1f4741e`) — 편집/삭제/설정 + 안내 문구
- ✅ **AndroidMetaScraper 첫 mount timeout 버그 fix** (commit `63e8178`)
- ✅ **`isInvalidProductName` validation 도입** — dead shared 문서 생성 차단

### 실패 (보류)
- ❌ **AndroidMetaScraper WebView 메타 추출** — 쿠팡 의도적 차단으로 기능 불가
  - 컴포넌트 자체는 코드에 잔존 (Future 우회 발견 시 재활성 여지)
  - 코드 삭제는 별도 결정 (1.0.22+ 검토)

---

## 7. 케이스 2 대안 옵션 (1.0.22+ 검토)

| 방향 | 가능성 | 비고 |
|------|--------|------|
| **A. WebView 우회 (Chrome User-Agent + 봇 헤더 마스킹)** | ★ | Akamai가 디바이스 핑거프린트 + 앱 설치 검사까지 함 — UA만으로는 불가능 |
| **B. Functions에 모바일 IP 프록시 추가** | ★★ | residential proxy 비용 + 안정성 의문 |
| **C. 쿠팡 파트너스 공식 API에 productId 단건 조회 엔드포인트 발견** | ★ | 현재까지 미발견 (docs/026 후속 분석) |
| **D. 사용자 측 Chrome Custom Tabs로 외부 브라우저 열기** | ★★ | UX 큰 변화 (앱 안 미리보기 X) |
| **E. cron이 신규 productId 도착 즉시 메타 백필** | ★★★ | shared write 시 Cloud Function 트리거로 즉시 1회 searchProducts/카테고리 베스트 매칭 시도. 사용자는 placeholder 1~2분 본 후 자동 정상화 |
| **F. 갤럭시 베타 사용자에게 "쿠팡 앱 삭제 후 테스트" 검증** | ★★ | 가설 추가 검증용. 결과에 따라 A/B 결정 |

### 권장 우선순위 (내일 검토)
1. **F** — 가설 검증 (앱 삭제 후 WebView 정상화되면 5-3 결론 확정)
2. **E** — 가장 실용적. Functions Firestore 트리거(`onDocumentCreated('shared_products/{id}')`)로 신규 생성 시 즉시 searchProducts/bestcategories 매칭
3. **A/B** — Akamai 우회 시도. 단 ROI 낮을 가능성 큼

---

## 8. 1.0.21 빌드 / 배포 상태

- **버전**: 1.0.21 (bn57/vc57) — `app.config.js` + `android/app/build.gradle` bump 완료 (commit `de752d4`)
- **빌드**: 아직 미진행. 디버깅 작업 중이라 정식 빌드 보류
- **next**: 가설 검증 (옵션 F) 후 빌드 결정. AndroidMetaScraper 코드는 잔존하되 동작 안 함 (Chrome 외 환경에서는 hidden WebView가 빈값 받아 silent 종료).

---

## 9. 보류 중인 작업

1. **cron `meta/notif_stats` write 추가** — shared-price-checker가 발송 후 sentToday/Week/lastSentAt 누적 갱신 (현재 admin.tsx 통계 대시보드 "알림발송" 섹션이 영구 "데이터 없음")
2. **cron `meta/user_stats` 집계 추가** — `fetchAdminStats`의 `users` 컬렉션 read가 클라이언트 보안규칙(`request.auth.uid == uid`)으로 막혀 0명 표시. cron이 집계 문서 작성 + 클라이언트는 `meta` 컬렉션(`read: if true`)로 read
3. **1.0.21 정식 빌드** (AAB + IPA) — 위 가설 검증 + 케이스 2 대안 결정 후

---

## 10. 1.0.21 누적 commit 목록 (2026-05-16 ~ 2026-05-17)

| commit | 메시지 요약 |
|--------|------------|
| `1f4741e` | 갤럭시 메타 보완 + AndroidMetaScraper + 목표가 수정 UI |
| `de752d4` | version bump 1.0.21 / bn57 / vc57 |
| `6c0eb23` | AndroidMetaScraper 발동 분기 전수 로깅 |
| `f4227a3` | eas.json preview profile (Android apk) |
| `941f4e0` | WebView 라이프사이클 로그 6종 |
| `f567751` | setScraperUrl 호출 전수 추적 + 첫 mount timer 버그 분석 |
| `63e8178` | fix: AndroidMetaScraper 첫 mount timeout 미시작 버그 |
| `fbc66a7` | 클라이언트 fallback chain 5단계 + Safari UA + productId 안전망 |
| `a5043b0` | SCRAPE_JS page 진단 페이로드 |
| `35853a8` | SCRAPE_JS 자체 폴링 (0.5s × 8회) |
| `134e2ca` | m. → www. 변환 제거 + AndroidMetaScraper 403 fallback |
| `20305da` | UA Pixel → Galaxy S24 + incognito off |
| `c3de9f4` | PRELOAD_JS 제거 (SPA 라우팅 깨짐 가설) |
| `170dcf4` | vp 페이지 reload 시 SCRAPE_JS 재주입 허용 |

총 14 commit. AndroidMetaScraper 작업의 detailed history는 본 문서가 단일 진실 출처.
