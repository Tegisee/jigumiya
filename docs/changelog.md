# 지금이야 작업 변경 이력 (Changelog)

날짜별 작업 이력을 모아두는 단일 파일. CLAUDE.md에는 이력을 누적하지 않으며, 새 작업 완료 시 이 파일 상단에 추가한다.

> 2026-04-30 이전 이력: [작업이력_archive.md](./작업이력_archive.md)

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
