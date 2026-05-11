# 지금이야 작업 변경 이력 (Changelog)

날짜별 작업 이력을 모아두는 단일 파일. CLAUDE.md에는 이력을 누적하지 않으며, 새 작업 완료 시 이 파일 상단에 추가한다.

> 2026-04-30 이전 이력: [작업이력_archive.md](./작업이력_archive.md)

---

## 2026-05-12 — 1.0.16 빌드 완료(iOS/Android) + 베타 검증 완료

### 빌드 산출물
- `~/jigumiya/builds/ios/jigumiya-1.0.16-52.ipa` — Transporter 업로드 대기
- `~/jigumiya/builds/android/jigumiya-1.0.16-52.aab` — Play Console 내부 테스트 대기

### 검증 완료 항목
- ✅ **Android FCM 토큰 정상 발급** — 1.0.16에 적용한 `com.google.gms.google-services:4.4.2` Gradle plugin 효과 실기기 검증. `expoPushToken` 즉시 박힘 → `savePushToken` 호출 정상 → user doc 저장 정상. NEW-A(skip.noToken) 해소 예상.
- ✅ **관리자 모드 `fetchAllSharedProducts`** — 실기기 "담당 ~42 / 전체 84" 정상 표시 (이전 "담당 1 / 전체 3"). `orderBy(documentId())` + createdAt 백필 효과 확인.
- ✅ **그래프 방향** — 오늘이 오른쪽 끝 고정, 왼쪽 스크롤로 과거 가격 확인 동작.
- ✅ **자동 새로고침 syncFromFirestore realPrice 분리 머지** — 기존 사용자 앱 오픈 시 currentPrice 즉시 반영.

### 운영 주의사항 (신규)
- **관리자 모드 동일 Wi-Fi 두 기기 동시 실행 금지** — 동일 공인 IP에서 두 기기가 동시 쿠팡 WebView 호출 시 쿠팡 IP 차단(분당 24~48회 호출 봇 판정). 한 기기씩 순차 실행 + 대기시간 30분 이상 권장. 3대+ 확장 시(Issue 5 1.0.17)는 deviceId hash modulo + 시간차 staggered 호출 검토.

### 알려진 일시 이슈
- 상품 추가 실패 — 쿠팡 IP 차단 시 1시간 후 재시도하면 해소. WebView 503/차단 페이지 → CoupangScraper 무한로딩/onError. Issue 3 갱신 참조.

### shared_products 아이고 상품 혼재 발견
- 아이고 사용자가 추가한 상품 10개가 `shared_products`에 혼재. 알림 발송 단계의 `users.app === 'jigumiya'` 필터로 잘못 알림은 차단되지만, 관리자 모드 순회 대상에 포함되어 불필요 호출 발생. 아이고 이식(Issue 6) 시 `app` 필드 또는 컬렉션 분리로 처리 — Issue 8 신설.

---

## 2026-05-11 (밤) — Android google-services Gradle plugin 누락 fix + 그래프 스크롤 + syncFromFirestore realPrice 분리 머지

### Android FCM 토큰 발급 실패 근본 원인 fix (1.0.16 bn52/vc52)
- 진단: 1.0.15/1.0.16-51 aab `base/resources.pb`에 `google_app_id` 등 string resources 0개. `com.google.gms.google-services` Gradle plugin이 빌드 설정에 완전 누락. iOS는 정상(Gradle 무관).
- 증상: Android user 25명 중 21명(84%) `expoPushToken` 미보유. `registerForPushNotifications`가 native Firebase 미초기화로 `getExpoPushTokenAsync` 예외 → catch 흡수 → null 반환 → `savePushToken` 미호출.
- fix:
  - `android/build.gradle` top-level dependencies: `classpath('com.google.gms:google-services:4.4.2')` 추가
  - `android/app/build.gradle` 끝: `apply plugin: "com.google.gms.google-services"` 추가
  - `android/app/google-services.json`: root에서 복사 (md5 `5ccc0e47…`)
  - 버전 bump 1.0.16 / bn52 / vc52 (bn51 aab 폐기)
- `.gitignore`에서 `/android` → `/android/**` + negation으로 변경. `build.gradle` 2개 파일 git 추적 시작 (218 insertions, commit `7fb166b`). google-services.json은 비밀이라 계속 제외 — EAS Secret(FILE_BASE64)으로 주입.
- 빌드 검증: `unzip -p ~/jigumiya/builds/android/jigumiya-1.0.16-52.aab base/resources.pb | strings | grep 250441543259` 가 결과를 출력하면 plugin 정상 적용 (이전 빌드는 0건).

### 그래프 방향 — 오른쪽=오늘 고정, 왼쪽 스크롤
- `app/detail/[id].tsx:348` LineChart props: `adjustToWidth` 제거 → `scrollToEnd` + `scrollAnimation={false}` 추가.
- `adjustToWidth`는 데이터 전체를 viewport(300px)에 압축 → 스크롤 X. 제거 시 spacing(45px)×N points로 가로로 늘어남 → ScrollView 발생. `scrollToEnd`로 초기 위치를 마지막 점(=오늘)이 오른쪽 끝에 고정.

### syncFromFirestore — currentPrice 분리 머지 (자동 새로고침 일부만 동작 fix)
- `store/useAppStore.ts:229-246` Step 3 분기 분리:
  - **priceHistory**: 기존 length 비교 정책 유지 (`shared.length > local.length`이면 채택, 기존 사용자 local 보호)
  - **currentPrice**: `shared.realPrice ?? shared.currentPrice` 우선 채택 (길이 무관, `>0 && != 현재값` 조건만)
- 증상: 기존 사용자가 앱 오픈(AppState active → syncFromFirestore) 시 `shared.realPrice`가 갱신됐어도 `priceHistory` 길이가 그대로면 `currentPrice` 미반영. cron이 `lastRealPriceUpdatedAt` 1h 가드로 priceHistory 추가 없이 apiPrice만 mirror하는 케이스 + 다른 사용자 WebView가 realPrice만 갱신한 케이스에 해당.

---

## 2026-05-11 (저녁) — 관리자 모드 fetchAllSharedProducts orderBy 버그 fix + createdAt 백필

**증상**: 1.0.16 빌드 직전 admin.tsx 실측 — Android 기기에서 "담당 1개 / 전체 3개" 표시. 실제 `shared_products` 컬렉션은 81개.

**원인**: `services/firebase.ts:fetchAllSharedProducts`의 `orderBy('createdAt', 'asc')` 쿼리. Firestore orderBy는 해당 필드가 **존재하는** doc만 반환 — 81개 중 createdAt 필드 보유 doc은 3개뿐 (1.0.16 RealPrice 작업 이후 추가된 신규 doc만). cron이 생성한 78개는 createdAt 미설정 → 쿼리 결과에서 완전히 제외됨. 분배 로직(`idx % 2`) 자체는 정상.

**수정 (`services/firebase.ts:823`)**: `orderBy('createdAt', 'asc')` → `orderBy(documentId(), 'asc')`. doc.id === productId 일치 확인됨 → productId 정렬과 동일. createdAt 미보유 doc도 모두 포함. import에 `documentId` 추가.

**데이터 보강 (`scripts/cleanup/backfill-shared-createdat-20260511.mjs` 신설)**: 78개 doc에 `createdAt = Date.now()` (epoch ms) 일괄 set merge. batch commit 1회로 완료. 검증: `orderBy('createdAt')` 결과 81/81개 일치. 향후 다른 곳에서 createdAt 정렬 기준 사용 시에도 안전.

**효과**: 1.0.16 빌드 후 관리자 기기는 "담당 ~40 / 전체 81" 정상 표시 예상. iOS/Android 두 기기가 동일 productId 정렬로 분배 — 인덱스 불일치 없음.

---

## 2026-05-11 — 1.0.16 RealPrice 아키텍처 전체 완료 + iOS 무한로딩 fix + 관리자 모드

`docs/023_RealPrice_Architecture.md` 8개 작업 항목 모두 완료. 1.0.16 빌드 + 베타 검증 대기 단계.

### RealPrice 아키텍처 (docs/023)

1. **SharedProduct 필드 분리** (`types/index.ts`, `services/firebase.ts`): apiPrice / realPrice / lastRealPriceUpdatedAt / needsCheck 4개 optional 추가. 기존 currentPrice는 `@deprecated` JSDoc + 호환 유지. `trackedItemToSharedProduct`가 첫 추가 시 realPrice/lastRealPriceUpdatedAt 동시 mirror.
2. **1A — addItem 머지** (`store/useAppStore.ts:addItem` async 변환 + `app/modal/add-item.tsx` await): 첫 추적 + productId 있을 때 `getSharedProduct` 호출 → shared.priceHistory 머지 후 setState. 신규 사용자가 즉시 풍부한 그래프 표시.
3. **1B — updateItemPrice realPrice mirror** (`store/useAppStore.ts:updateItemPrice`): WebView 결과를 shared_products에 역방향 write (realPrice + lastRealPriceUpdatedAt). needsCheck는 CF 책임이라 미터치.
4. **작업 3 — syncFromFirestore realPrice 우선** (`store/useAppStore.ts:syncFromFirestore`): Step 3 shared 채택 시 `shared.realPrice ?? shared.currentPrice` (1.0.16 중간 전환 fallback).
5. **Cloud Functions 트리거** (`functions/src/index.ts:onSharedProductRealPriceChange`): v2 onDocumentUpdated `shared_products/{productId}` (asia-northeast3). realPrice 변경 + > 0 가드 → `collectionGroup('tracked').where(productId)` → target 도달 필터 → user 검증(app/jigumiya, token, notif on) → 24h 가드 → token-share dedup → Expo push → `lastNotifications.targetReached.{pid}` 마킹 + needsCheck:false 클리어. 무한 루프 방지 (`beforeReal===afterReal` early return). 이미 프로덕션 배포 + 실제 트리거 발화 검증 완료 (`9309948201` 1건 처리, skip.noToken=1 — Issue NEW-A 참조). 의존성: `expo-server-sdk ^6.1.0`.
6. **cron 변경** (`scripts/shared-price-checker/index.ts`):
   - `REAL_PRICE_FRESH_MS = 1h` / `NEEDS_CHECK_DROPRATE_PCT = 10` 상수 추가
   - main loop에 `lastRealPriceUpdatedAt` 1h 가드 추가 (skipRecentRealPrice 카운터) → 최근 WebView 갱신 상품 apiPrice 호출 skip
   - `item.ref.update`에 `apiPrice` mirror + `dropRate ≥ 10%` 시 `needsCheck:true` 박음
   - `events.targets.push` 2곳(line 451, 856) 주석 처리 + flush 단계 2곳 코멘트 — CF 인계, 코드는 검증 완료 후 정식 폐기
7. **관리자 모드 UI** (`app/admin.tsx` 신설 + `app/_layout.tsx` Stack + `app/(tabs)/settings.tsx` 진입 + `services/firebase.ts` 헬퍼 3종):
   - `subscribeIsAdmin(uid, cb)` + `fetchAllSharedProducts()` (createdAt asc) + `adminUpdateRealPrice(productId, realPrice)` (needsCheck:false 명시 클리어)
   - Platform.OS 기반 홀수/짝수 분배 (Android=홀수 / iOS=짝수)
   - CoupangScraper sequential WebView 호출 (promise resolver ref 패턴) + 1.5s sleep + 25s 외부 안전망
   - **이어서 진행**: `resumeIdx` 보존 → 정지/이탈 후 N번부터 재시작, 1회 순회 완료 시 0 리셋, "처음부터 다시 시작" 보조 링크
   - **wallclock 카운트다운**: setInterval 1초 tick + `nextRunAt - Date.now()` 재계산 + AsyncStorage 영속화(`admin_nextRunAt`) + AppState active 만료 즉시 실행 + 앱 재실행 시 nextRunAt 복원 + autoLoop 자동 ON
   - 대기 시간 chip 그룹 (10/15/30/60/120분) + 카운트다운 카드 + 최근 15건 결과 리스트

### iOS 상품 추가 무한로딩 fix

- **HTML fetch 폐기** (`app/modal/add-item.tsx:startScrape`): iOS 전용 `fetchWithTimeout` + `setScrapeHtml` 경로 제거. iOS/Android 공통 `setScrapeUrl(targetUrl)` 통일. async 시그니처도 제거.
- **link.coupang.com 가드 2중**: `startScrape` 진입 시 즉시 `setScrapeFailed(true)` + `CoupangScraper:handleShouldStartLoadWithRequest`에 `host === 'link.coupang.com'` 명시 차단 (Universal Link 흡수 원천 차단).
- **SCRAPE_JS 내부 폴링** (`components/CoupangScraper.tsx`): 0.5s × 20회(10초) `setInterval` 폴링. `extractOnce()` 헬퍼로 셀렉터 추출 분리, `price > 0 && image` 충족 시 즉시 postMessage + `clearInterval`. 20회 소진 시 마지막 결과 보내고 종료. `window.__coupangPollHandle` 글로벌로 외부 재시도(2/4/6s) 시 이전 polling 자동 정리 → setInterval 누적 방지. 셀렉터는 기존 그대로 유지 (og:title / .total-price strong / og:image 등).

원인: Functions cold/timeout(8s) → client fallback이 link.coupang.com 단축 URL 그대로 사용 → iOS Universal Link 흡수 → 쿠팡 앱 강제 실행 → 복귀 후 WebView 멈춤 → SCRAPED postMessage 없음 → 20-30s 후 실패. 폐기로 원천 차단.

### CF 트리거 검증 결과 (20:37 KST 1건)

- productId `9309948201` ("삼성전자 갤럭시 S26 자급제"): before=0 → after=1,009,000원
- 도달 후보 total=1, qualified=1 / 발송 대상 sendCount=0, skip.noToken=1
- 확인: 앱 1B realPrice mirror 작동 ✓ / 트리거 흐름 정상 ✓ / collectionGroup 인덱스 정상 ✓
- 남은 검증: 실기기(`expoPushToken` 보유) 사용자가 target 도달 시 실제 push 도달 + `발송 완료` 로그

### 다음 단계

- 1.0.16 빌드 (iOS + Android)
- 베타 검증 → cron 주석 처리된 target_reached 코드 정식 삭제
- Android 토큰 null 케이스 (Issue NEW-A) 실기기 검증

상세: [docs/023_RealPrice_Architecture.md](./023_RealPrice_Architecture.md), [docs/022_Issues.md](./022_Issues.md)

---

## 2026-05-10 (밤) — Issue 1 fix: syncFromFirestore에 shared_products 머지 추가

`syncFromFirestore` 머지 정책 3-way 확장 (commit `197d50b`).

- `services/firebase.ts`: `fetchSharedProductsByIds(productIds)` 신설 (Promise.all(getDoc), 홈 N=10이라 1 round-trip)
- `store/useAppStore.ts`: 머지 순서 remote → local → shared. shared.priceHistory가 더 길면 shared 채택 (currentPrice도 함께)
- 백그라운드 → 포그라운드 전환 시 cron이 누적한 priceHistory가 그래프에 자동 반영
- 다음 빌드(1.0.16) 출시 시 효과 발생

별개 발견: cron `shared-price-checker`가 즉시할인/옵션 미반영가를 저장하는 케이스 확인 (raw 응답 dump 진단 — `coupang-api` Search API top-level에 vendorItemId 없음). Coupang affiliate API 구조적 한계로 결론. 변경 없음 결정 — 알림은 신호로만 활용. 상세: [022_Issues#issue-1](./022_Issues.md)

상세: [docs/022_Issues.md#issue-1](./022_Issues.md)

---

## 2026-05-10 (저녁) — Issue 2-C 검증: backfill 후보 0명 확인

`scripts/cleanup/users-app-backfill-jigumiya-20260510.mjs` 작성 + dry-run 실행. 후보 **0명** 확인 → backfill 실행 불필요.

스캔 결과 (185 docs): app 이미 설정 71 / token 없음 67 / tracked 비어있음 47 / 후보 0. 진단 시점 unknown 40명은 대부분 token만 있고 tracked 비어있는 상태였거나 자연 회복된 것으로 보임. 스크립트는 향후 재사용 가능하도록 보존.

상세: [docs/022_Issues.md#issue-2-c](./022_Issues.md)

---

## 2026-05-10 (저녁) — Issue 2-A fix: fetchActiveUsers 정책 전면 개편

shared-price-checker `fetchActiveUsers` 재작성 (커밋 `a5dfc5d`).

- 후보 = jigumiya + token + notif on + **tracked 보유 uid**만 (tracked 미보유 자동 제외)
- 같은 token 공유 시 winner = `lastNotifications` 최댓값 timestamp desc → tiebreak `createdAt` desc → 1개만 선택
- 패자 uid 완전 제외 → push가 winner의 trackers 기반으로만 발송 → 알림 탭 시 winner의 items에서 정상 조회 (UX 버그 차단)
- token당 push 1건 자연 보장 (5/6 morning_greeting 4건 사고 재발 방지)
- 신규 헬퍼 `maxLastNotifTime(ln)` 추가
- 검증 대기: 다음 cron 사이클에 `[ActiveUsers] shared-token winner=… dropped=[…]` 로그 + 익스트림 액티브 에너지젤(`8611087425`) 추적자 알림 정상 수신

상세: [docs/022_Issues.md#issue-2-a](./022_Issues.md)

---

## 2026-05-10 — meta/config_jigumiya 갱신 + 미해결 이슈 2건 진단

1.0.15 양 스토어 출시 후 운영 작업.

**1) `meta/config_jigumiya` Firestore 운영 데이터 갱신 (콘솔 작업, 코드 변경 X)**
- 변경 전: `minRequiredVersion: "1.0.8"` (5/2 갱신, 1.0.15와 7버전 격차로 1.0.8~1.0.14 사용자에게 팝업 미노출)
- 변경 후: `minRequiredVersion: "1.0.15"` / `latestVersion: "1.0.15"` / `updateMessage` 설정 / `forceUpdate: false`
- 효과: 1.0.14 이하 사용자 앱 마운트 시 `services/updateChecker.ts:73 checkForUpdate` Alert 노출 → "나중에" 디스미스 가능

**2) Issue 1 진단 — 가격추적 그래프 자동 업데이트 안 됨 (앱 측)**
- cron(`scripts/shared-price-checker/index.ts:764-770`)은 `shared_products/{productId}.priceHistory` 만 update
- 앱 `app/(tabs)/index.tsx:46-51` AppState `active` 전환 → `syncFromFirestore()` → `users/{uid}/items` 컬렉션만 read → 출처 불일치
- 상세: [022_Issues.md](./022_Issues.md#issue-1)

**3) Issue 2 진단 — 가격변동 알림 0건 (cron 측)**
- 5/8 14:17 ~ 5/9 15:08 약 25 사이클 거의 전부 `[Flush] payloads 0건`. PriceDrop은 정상 기록되는데 발송 자체가 0건
- 근본 원인: token-dedup dup-skip(swap 1회 한계) + unknown 40명 strict 필터 제외
- 상세: [022_Issues.md](./022_Issues.md#issue-2)

---

## 2026-05-07~08 — 1.0.15 출시 + priceHistory 동기화 fix + token-dedup swap + 인사 알림 제거

1.0.14 출시 후 실기기 회귀 버그 + 알림 정책 정리 + 1.0.15 (bn50/vc50) 양 스토어 출시 (커밋 `3ec2806` → `2a9e359`).

**1) Fix A — `updateItemPrice`가 Firestore에 priceHistory 누락 저장하던 버그** (`store/useAppStore.ts:115-145`, 커밋 `2037437`)
- 1.0.14까지: `updateItemInFirestore(id, { currentPrice })`만 호출 → store에는 priceHistory 누적되지만 Firestore의 `users/{uid}/items.priceHistory`는 추가 시점 1개로 영원히 박혀있음
- fix: `updateItemInFirestore(id, { currentPrice, priceHistory: history.slice(-30) })`

**2) Fix B — `syncFromFirestore` 머지 정책으로 기존 사용자 데이터 보호** (`store/useAppStore.ts:syncFromFirestore`, 커밋 `2037437`)
- id 단위 매칭해서 `local.priceHistory.length > remote.priceHistory.length`면 local 보존 (priceHistory + currentPrice). 그 외 필드는 remote 채택

**3) Fix C — ProductCard 우측하단 trend 뱃지 추가** (`components/ProductCard.tsx`, 커밋 `2037437` + `aa90f1a` 이모지 제거)
- priceHistory 첫값 vs 마지막값 비교 → "가격하락감지"(빨강 #FF4444) / "가격상승감지"(파랑 #3B82F6) / "가격변동없음"(그레이). priceHistory 2개 미만이면 미표시

**4) 아침/저녁 인사 알림 제거** (`scripts/shared-price-checker/index.ts`, 커밋 `3ec2806`)
- `morning_greeting` push 블록(line 843-850) + `evening_no_change` push 블록(line 980-987) 제거 → 가격 변동 알림(target_reached / price_drop_summary / price_up_summary)만 유지
- 아이고 측 동시 처리: `aigo-daily-greeter.yml` schedule 두 줄 주석 처리(workflow_dispatch는 유지)

**5) token-dedup swap 정책 (orphan tracker fix)** (`scripts/shared-price-checker/index.ts:fetchActiveUsers`, 커밋 `2a9e359`)
- 기존: 동일 expoPushToken 공유 시 doc id asc 첫 등장 uid만 보존 → anon 재로그인 후 신 uid에만 tracked가 추가된 케이스에서 추적자가 영구 dup-skip → 알림 미발송
- fix: 함수 진입 시 `collectionGroup('tracked').get()` 1회 → `trackedUids: Set<string>` 사전 빌드. 충돌 시 신 uid만 tracked 보유하면 swap. 그 외는 first 유지
- 비용: 사이클당 collectionGroup 쿼리 1회 추가 (현재 N≈수십, <1초)

**6) 1.0.15 (bn50/vc50) 양 스토어 출시**
- 산출물: `~/jigumiya/builds/ios/jigumiya-1.0.15-50.ipa` / `~/jigumiya/builds/android/jigumiya-1.0.15-50.aab`
- iOS App Store 심사 제출 / Android Play Store 프로덕션 승급 신청 완료

---

## 2026-05-06 심야 — 1.0.14: iOS 무한로딩 fix + Android 성능 개선

1.0.13 실기기 테스트 → iOS 상품 추가 무한로딩 잔존 + Android 스크롤 여전히 느림 → 1.0.14 (bn49/vc49) 재빌드 + 양 스토어 출시 (커밋 `75d97f4`).

1. **iOS 무한로딩 fix** — CoupangScraper 재시도 소진 시 즉시 `onError()` 호출 (`components/CoupangScraper.tsx:253-262`). 외부 20s timeout 의존 제거
2. **CoupangScraper TDZ 잠재 버그 제거** — `retryIndexRef`/`retryDelays` 선언 위치 정리
3. **add-item.tsx fallback 강화** — `link.coupang.com` 단축 URL HTML body `redirectWebUrl` 파싱 헬퍼 추가
4. **Functions timeout 5s → 8s 복원** (`add-item.tsx:208`)
5. **Android 성능 — `expo-image` 도입** (8개 사용처 일괄 마이그레이션). `cachePolicy="memory-disk"` + `recyclingKey` + `transition={0}`
6. **SparklineChart `MIN_POINTS=5` 가드** — gifted-charts SVG 비용 회피
7. **today-best 펼침 모드 가상화** — `Row='header'|'preview'|'product'` 평탄화 + 개별 FlatList row
8. **coupang-pl renderItem `useCallback` 적용**
9. 산출물: `~/jigumiya/builds/ios/jigumiya-1.0.14-49.ipa` (16.1 MB) / `~/jigumiya/builds/android/jigumiya-1.0.14-49.aab` (58.8 MB)

---

## 2026-05-06 야간 — 1.0.13: 실기기 테스트 버그 수정 8건

1.0.12 (bn47/vc47) 빌드 → 실기기 검증 → 8건 버그 발견 → 1.0.13 (bn48/vc48) 재빌드 (커밋 `489339e` + `f8c059d`).

1. **이벤트 배너 라우팅 fix** — `/today-best` → `/event-best?slug=...`로 변경. `app/event-best.tsx` 신규 + `services/firebase.ts:fetchEventBySlug` 신설
2. **상세페이지 UI 전면 교체** (`app/detail/[id].tsx`) — priceHero(현재가 32px + 상태 텍스트) + 그래프 + 인사이트. 4-card grid + targetRow + priceModal 제거
3. **사달라고 조르기 텍스트 변경** — 버튼: "친구에게 사주세요 🎁" → "사달라고 조르기 🥺"
4. **iOS Share 버그 fix** — 모달 dismiss 후 350ms delay 후 `Share.share` 호출
5. **쿠팡 PL 브랜드별 자동 탭** (`app/coupang-pl.tsx`) — `BRANDS = ['베이스알파에센셜', '꼬리별', '곰곰', '코멧', '탐사', '줌']` productName 매칭
6. **iOS 상품 추가 무한로딩 1차 시도** — `waitForAuthReady(1500)` + Functions timeout 8s→5s
7. **Android FlatList 최적화 1차** — `ProductCard` `memo()` + 6개 화면 표준 props
8. **빌드** — `~/jigumiya/builds/ios/jigumiya-1.0.13-48.ipa` / `~/jigumiya/builds/android/jigumiya-1.0.13-48.aab`

---

## 2026-05-06 후반 — 1.0.12 통합 작업: UI 재구성 + 그래프 + 신규 화면 + Firestore rules

0. **Firestore rules 배포** (event_best_jigumiya / goldbox / coupang_pl read 허용)
1. **`ensureUserDoc` 추가 + `platform` 필드** — 갤럭시S21+ 알림 0건 사고 근본 fix. `users/{uid}`에 `{ app:'jigumiya', platform:Platform.OS, createdAt }` merge
2. **iOS 쿠팡 복귀 무한로딩 fix** — AppState `active` 전환 시 재로드/재구독 + Firestore stall 흡수 8초 timeout
3. **vendorItemId 옵션 고정 매칭** — `fetchCurrentPrice(productName, productId, currentPrice, vendorItemId?)` vendorItemId 정확 매칭 우선
4. **가격 그래프 대대적 개선** (`app/detail/[id].tsx`) — 트렌드 색상 자동 + 직선 그래프 + 변곡점 dot + 참조선 3개 + tooltip
5. **친구에게 사주세요 모달** — slide-up 시트 + 6개 프리셋 + 직접 입력 + Share.share
6. **UI 재구성** — 탭 4개 (홈/자주사는/가격변동/설정) + 신규 화면 today-best, coupang-pl + 헤더 우측 공유 버튼
7. **STORE_LINKS 채움** (`services/config.ts`) — Platform별 분기
8. **coupangpl-updater 보강** — `categoryName` 필드 응답 매퍼 + Firestore 저장 pass-through
9. **Firestore rules 추가** — `event_best_jigumiya/{slug}`, `goldbox/{date}`, `coupang_pl/{date}`
10. **feed.tsx 자체 삭제** (탭 통합)

---

## 2026-05-06 전반 — 쿠팡 PL cron + token dedup + 갤럭시S21+ 알림 0건 진단

1. **쿠팡 PL cron 신설** (커밋 `b4a4e16`) — `scripts/coupangpl-updater/`, `coupangpl-update.yml`. 엔드포인트 `/v2/.../products/coupangPL?limit=100` (v1 prefix 없음). 골드박스와 동시 (07:30 KST). 첫 수동 실행 87개 저장
2. **fetchActiveUsers token dedup fix** (커밋 `51d5dac`) — 5/6 morning_greeting 4건 발송 (동일 expoPushToken 공유 4 uid). `seenTokens: Map<token, firstUid>`
3. **갤럭시S21+ 알림 0건 진단** — `users/{uid}` doc 부재. `savePushToken`이 유일한 doc 생성처라는 설계 결함. 응급 user doc 수동 생성. 근본 fix는 5/6 후반 `ensureUserDoc`로 해결

---

## 2026-05-05 후반 — A~E 알림 시스템 재설계 + 신규 cron 2종

5/5 17:35 폭탄 사고(`events.categoryBroadcasts` 다중 push) → A~E 재설계 (커밋 `48c1fed`):

- **A**: 카테고리 베스트 알림 완전 제거 → shared_products 단일 출처 일원화
- **B**: dropRate 60% 가드 + events.drops/ups dedup
- **C**: morning/evening 요일별 단일 문구 (KST DOW lookup)
- **D**: 골드박스 cron 신설 (07:30 KST, 1콜/일)
- **E**: 이벤트 cron 신설 (02:35 KST, 11개 이벤트 D-7 윈도우)

shared-price-check cron 3차 재활성화 (`*/10 * * * *`). 1.0.11 (bn46/vc46) iOS 심사 / Android 내부 테스트 트랙 업로드 완료.

---

## 2026-05-05 전반 — A~H 사고 fix + cron strict 변경 + minInstances:1

A~H 배포 후 새벽 cron 가짜 변동 폭주(category_best 매 사이클 갱신 + bestcategories↔search productPrice 출처 mismatch) → 긴급 cron 비활성화 → category_best 갱신 중단 + fetchActiveUsers strict 변경(`app === 'jigumiya'` 단일) + users 백필. 1.0.11(bn46/vc46) 빌드 + Functions `minInstances: 1`.

---

## 2026-05-04 — A~H 8종 일괄 (커밋 `de856a6`)

A 후보 풀 정리 + B drop 상품별 발송 + C 앱 필터링(jigumiya/aigo) + D 알림 문구 상품명+가격 + E 고정 알림 KST 날짜 가드 + F sleep 10s→2s + G 카테고리 round-robin(category-cycle.ts 신규) + H category_best 10% 급락 broadcast.

---

## 2026-05-03 — 1.0.10 빌드: 알림 0건 사고 + iOS/Android 추가 fix

- 알림 0건 사고: Expo batch 거절(다른 EAS projectId 토큰 혼재) + markUpdate 순서 버그 → notifier.ts chunk try/catch + 1건씩 fallback + index.ts successfulTokens 기반 lastNotifications 갱신 (`096c69a`). cleanup-morning 55명 정리
- price_drops 중복 fix(autoId → doc(productId).set 멱등 upsert, `2dc12c3`) + wipe 9건
- iOS 공유 무한로딩 fix(가이드 Alert + step 보존 + iOS fetch 8s timeout, `9de8269`)
- Android 콜드 스타트 완화(모달 mount + AppState active warmup + 응답시간 로그, `601b166`)
- 1.0.10(bn45/vc45) 양 스토어 업로드

---

## 2026-05-02 — 1.0.9 + tracked-backfill + notify-only.yml + §11 자동화

tracked-backfill 1회 실행(productId 5건 보강) + `notify-only.yml` 신설(07:30/20:00 KST) + §11 자동화(`b49ea2e`, yml 10분 고정 + 코드 N값 기반 간격 + lastRunAt graceful exit) + docs/020 신설 + CLAUDE.md slim(573→303줄) + 1.0.9(bn44/vc44) 빌드 + iOS App Store ID + detail 알림 라우팅 productId fallback + legacy `price-check.yml` 폐기 + evening_no_change 가드 완화(`fd6afe3`).

---

## 2026-05-01 — 1.0.8 배포

골드박스 → "오늘의 특가"(price_drops 24h + category_best 1h 캐시) + 하트 버튼 누락 fix(productId 다중 패턴 + URL 후보) + backfillProductIds 자가 치유 (커밋 `dd15624`). shared-price-check cron 활성화(`46ccb4c`). 첫 cron 실행 결과 알림 0건 — morning/evening 시간대 미진입 + tracked.productId 누락 + trackerCount 음수 발견.

---

> 2026-04-30 이전 이력: [작업이력_archive.md](./작업이력_archive.md)
