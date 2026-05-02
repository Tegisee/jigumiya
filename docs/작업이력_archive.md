# 지금이야 작업 이력 아카이브

CLAUDE.md에서 분리한 과거 작업 이력 (2026-04-18 ~ 2026-04-30). 최신 작업은 CLAUDE.md 진행 경과 섹션 참조.

---

## 진행 경과 (2026-04-18 ~ 2026-04-30)

- **Phase 3-A 완료 (2026-04-18)**: shared_products 이중 쓰기 + 중복 가드 검증 성공
- **Phase 3-D MVP 완료 (2026-04-19)**: 3탭 구조, 자주사는 토글(홈 카드 + 상세), 스와이프 삭제, 피드 정적 배너, 10개 제한, 뱃지 초기화
- **파트너스 실적 미집계 원인 공식 확정 (2026-04-20)**: 쿠팡 공식 가이드 p.13 "공유 기능 링크 수익 집계 안 됨" → Firebase Functions resolve 필수 (018)
- **파트너스 API Rate Limit 2회 초과 (2026-04-21)**: 지금이야/아이고 cron 양쪽 긴급 비활성화. 원인 — 파트너스 공식 사이트 **실적 상세 리포트 페이지** 접속 시 내부 대량 API 호출. 기간별 리포트는 정상. 3회 시 계정 정지 위험. 2026-04-22 07:21 KST 자연 해제. 상세: docs/010 §Rate Limit 초과 사건.
- **018 Firebase Functions Resolver 배포 완료 (2026-04-21)**: `resolveAndGenerateAffiliateUrl` v2 callable, asia-northeast3, Node 22, Secrets 등록, Cleanup policy. 클라이언트 dual-path(Functions → client fallback). 아이고 앱도 동일 적용.
- **018 실기기 검증 + 3대 버그 수정 완료 (2026-04-24)**:
  - ① 401 Unauthorized — 2세대 Callable Cloud Run invoker IAM에 `allUsers:run.invoker` 미부여. 함수 코드에 `request.auth` 검증 추가한 뒤 allUsers 부여(이중 보안).
  - ② `link.coupang.com/a/...` resolve 실패 — 3xx가 아닌 200 HTML(JS 리다이렉트) 반환. HTML 내부 `redirectWebUrl='...\x3D...'` JS 변수 hex-escape 디코드로 vp URL 추출.
  - ③ 딥링크 API 무증상 실패 — `COUPANG_ACCESS_KEY` secret 말미 `\n`이 Authorization 헤더에 주입돼 undici가 TypeError 거부, outer catch가 조용히 삼켜 원본 URL 저장 증상. `.trim()` 방어 처리. 상세: docs/018.
- **iOS 1.0.5 (bn38) App Store 심사 제출 + Android 1.0.5 (vc38) 프로덕션 출시 완료 (2026-04-24)**
- **price-check cron 1차 재활성화 + 시간대 분리 (2026-04-24 오후)**: 지금이야 `3c667ef` (08/12/20 KST) + 아이고 `24b1e0c` (07/09/11/13/16/19 KST). 동시 시간대 겹침 없음.
- **🚨 cron 2차 긴급 비활성화 + 재시도 루프 제거 (2026-04-24 야간)**:
  - 증상: 재활성화 당일 지금이야 실행당 /products/search 56~74회 (37개 상품 × 평균 1.68회). 분당 환산 ~110회 → 공식 한도 분당 50회 2배 초과
  - 원인: `fetchCurrentPrice` 내부 `keywords[4단어, 2단어]` for-loop 재시도. 매칭 실패 시 쿼리 축소 재호출, 재시도 사이 딜레이 없음
  - 조치: ① 양쪽 cron 즉시 차단 — 지금이야 `3cd068e`, 아이고 `fb66468`. ② 재시도 루프 완전 제거 — 지금이야 `46c20e5`, 아이고 `840f1ea` (상품당 1회 검색, 실패 시 즉시 return null)
  - 효과: 지금이야 37회/실행 고정, 아이고 2회/실행 고정 — **-41%**
  - 파트너스 계정 정지 → 소명 후 해제 완료 (2026-04-24)
  - **쿠팡 파트너스 공식 Rate Limit 전체**: 검색 API 1분/50회, 리포트 API 1시간/500회, 모든 API 합산 1분/100회, 링크 생성 1분/50회

- **019 §8-A 카테고리 베스트 구현 완료 (2026-04-26)**:
  - 공식 카테고리 19개 확정 (1001~1030, probe 없이 쿠팡 공식 문서로 확정)
  - Firebase 저장: 19개 × 50개 = **950개 상품** (`category_best/{categoryId}` 단일 문서, products 배열)
  - `scripts/category-best-updater/` 신설 — 19개 카테고리 순회, 카테고리 사이 sleep 80초
  - `.github/workflows/category-best-update.yml` 활성화 — 매일 02:00 KST 1회
  - `firestore.rules` `category_best` 규칙 추가 + Console 게시 완료
  - feed 탭 UI 교체(833805d, 18abcb0): "곧 출시" 배너 → 카테고리 칩 가로 스크롤 + 선택 카테고리 상품 리스트, 1~3위 민트 랭크 뱃지, 로켓배송 이모지, 쿠팡 파트너스 의무 고지 푸터

- **019 §8-B (price-checker §4-2 중복 제거) 완료 (2026-04-26)**:
  - `scripts/price-checker/category-best-cache.ts` 신설
  - `shared_products` 가격 체크 시 `category_best` 캐시 조회 → 중복 productId API 재호출 없이 캐시 가격 재사용
  - 가드: **6시간 신선도** + **30% 변동 가드**

- **019 가격변동 탭 신설 (4탭 구조) (2026-04-26, f8b88e9)**:
  - 탭 구성: 홈 / 자주사는 / 카테고리 베스트 / 가격변동 (기존 3탭 → 4탭)
  - `price_drops` 컬렉션 설계 + `subscribePriceDrops` 구독
  - 필터 칩(전체/-10%/-20%) + 하락률 뱃지

- **1.0.6 (bn40/vc40) 빌드 완료 (2026-04-26, 986acaf)**:
  - iOS TestFlight 업로드 → App Store 심사 제출
  - Android Play Console 내부 테스트 → 프로덕션 승급
  - bn39 재빌드용 → bn40으로 bump

### 2026-04-27~28 종합 작업 (Phase 3 §8 마무리 + 019 §5-2 cron 신설 + 운영 정책 + 버그 수정)

① **firestore.rules 아이고 통합본 + CLI 배포 전환** (커밋 `fd384c7`, `da2031e`)
- `category_best_baby/{slug}`, `event_best/{eventSlug}`, `meta/{docId}` 규칙 추가
- 슬러그 예시: `'toys-0-3'`, `'birthday-1'`, `'parent-wedding'`
- `firestore.rules` → `jigumiya/` 하위로 이동, `firebase.json` + `.firebaserc` 신설
- **CLI 배포 활성화** (콘솔 수동 게시 방식 폐기)
- **jigumiya 레포가 firestore.rules 단일 소스(source of truth)** 확정 — 콘솔 직접 편집 금지

② **019 §5-2 shared-price-checker cron 신설** (커밋 `62448cc`)
- `scripts/shared-price-checker/` 신설 (7개 파일)
  - `index.ts`: shared_products 풀 fetch + createdAt asc 순차 + trackerCount=0/당일 추가 스킵 + category_best 캐시 hit 시 API 스킵 + sleep 1500ms + rate-limited 즉시 종료 + collectionGroup 추적자 수집 + Expo 푸시
  - `coupang-api.ts`: `SearchResult`/`FetchPriceResult` 도입 — rateLimited 명시 분기
  - `price-drop.ts`: `recordPriceDrop` 분리
  - `category-best-cache.ts`, `notifier.ts`: 기존 `price-checker`에서 복사
- `firestore.indexes.json` 신설 → **collectionGroup `tracked.productId` 인덱스 배포** (추적자 역방향 검색용)
- `SharedProduct.createdAt?: number` 필드 추가 + `upsertSharedProduct` 신규 생성 시 `createdAt: Date.now()` 기록
- `.github/workflows/shared-price-check.yml`: cron 주석 처리, workflow_dispatch만 활성, timeout 350분

③ **앱 업데이트 알림 기능 추가** (커밋 `3a5bbc3`)
- `services/updateChecker.ts` 신설: `compareVersion`(semver 부분 비교, "1.0.10" 함정 회피) + `checkForUpdate`(meta/config_jigumiya 조회 + Alert.alert)
- "나중에" 누른 minRequiredVersion은 AsyncStorage(`update_prompt_dismissed_version`)에 기억
- `forceUpdate=true`면 "나중에" 버튼 숨김 + cancelable:false
- `services/firebase.ts:getMetaConfig()` 추가
- 운영자 작업: `meta/config_jigumiya` 문서 콘솔 생성

④ **minPrice 50,000 → 30,000 sync** — `event_best` cron 호출 시 minPrice 기준 하향. 영향: 아이고 `event-best-updater`

⑤ **019 §10 운영 정책 신규 섹션 추가** — cron 활성화/비활성/사고 대응 체크리스트 명문화

⑥ **버그 수정: 카테고리 베스트 탭 + 자주사는 탭 read 실패** (firestore.rules 미배포 원인)
- 1.0.6 배포 직후 카테고리 베스트 탭 "준비중이에요" + 홈 하트 토글 → 자주사는 탭 미반영
- 해결: `firebase deploy --only firestore:rules` 정상 배포로 복구
- **재발 방지**: CLI 배포 워크플로우 정착 + 콘솔 직접 편집 금지

⑦ **cron 비활성 상태 유지** — 양 cron 모두 schedule 주석. 활성화 선결: 아이고 실기기 테스트 통과 + 아이고 Firebase → jigumiya 통합(§8-C) 완료

### 2026-04-28 가격 체크 + 알림 설계 확정

**가격 체크 (shared-price-checker)** — 동적 사이클 방식 확정:
- `meta/stats.sharedProductCount` 읽어서 사이클 시간 자동 계산 (정적 분당 40회 sleep 1500ms 고정 → 동적 sleep 간격으로 전환)
- 카테고리 업데이트 시간대 01:00~04:30 KST 제외 (category_best/baby/event 갱신 보호)
- 분당 최대 40회 (공식 한도 50회 대비 80% 마진)
- 지금이야 + 아이고 `shared_products` 공유이므로 단일 cron으로 양 앱 커버

**알림 발송** — 즉시 발송 + morning/evening 시간대 분기로 변경 (2026-04-30 재설계):
- 가격 변동 시 즉시 발송 (실시간)
- morning(07-09 KST) / evening(19:30-21 KST) 시간대 분기
- 가격 무변동 알림은 evening_no_change로 흡수
- 온보딩 문구 "가격 변동 시 즉시 알림" 적용

### 2026-04-30 종합 작업 (BUG-42 + 알림 7종 + 동적 사이클 + 1.0.7 빌드)

① **BUG-42: 쿠팡 공유 → 상품추가 무한로딩 방어** (커밋 `5c0b5da`)
- 원인: `handleNext`의 await 체인(callable → fetch → deeplink)에 timeout 부재 → Functions cold start 또는 fetch hang 시 30초 scrape 타이머가 시작조차 안 돼 무한 로딩으로 표출. iOS ShareIntent 직후 더 자주 발생.
- `_layout.tsx`: 인증 완료 후 `warmupResolveAffiliate()` fire-and-forget — sentinel `https://__warmup__.local/` URL은 functions/index.ts:256에서 `coupang.com` 미포함 시 즉시 early return → 쿠팡 API 미호출, 컨테이너 init만 트리거
- `services/firebase.ts`: `warmupResolveAffiliate()` 신설
- `app/modal/add-item.tsx`: `withTimeout()` (Promise.race) + `fetchWithTimeout()` (AbortController) 헬퍼 추가
  - `callResolveAffiliate` 8s timeout, `link.coupang.com` fallback fetch ×2 각 5s, `generateDeepLink` 5s timeout

② **온보딩 문구 갱신** (커밋 `ffa5154`) — `components/OnboardingScreen.tsx:46` Step 1 feature 문구: "매일 3회 자동 가격 확인" → "가격 변동 시 즉시 알림"

③ **shared-price-checker 알림 7종 시스템** (커밋 `ee60516`)
- notifier.ts `PushPayload` discriminated union (총 7타입):
  - `morning_greeting` — 07:00~09:00 KST 진입 시 활성 사용자 전체
  - `price_drop_summary` — 가격 하락, 사용자당 1개 합산
  - `target_reached` — 목표가 도달, 상품별 1개 (drop_summary 중복 제외)
  - `price_up_summary` — 가격 상승, 사용자당 1개 합산
  - `evening_no_change` — 19:30~21:00 KST 진입 시, 그날 가격 알림 미수신자만
  - `broadcast_drop10` — 10%~19% 하락, 활성 사용자 전체
  - `broadcast_drop20` — 20% 이상 폭락, 활성 사용자 전체
- 각 type 3개 후보 문구 랜덤 선택, `{N}` placeholder
- 24h 중복 방지: `users/{uid}.lastNotifications` 단일 map (morning?/evening?/priceDrop[pid]/priceUp[pid]/targetReached[pid]/broadcast.tier10|tier20)
- flush 단계 분리: 스캔 사이클에서 메모리 누적 → 끝에서 일괄 발송
- 24h 통과 productId 0개면 push 자체 skip
- `data.screen` 라우팅: detail / home / price-drops

④ **shared-price-checker 동적 사이클 고도화** (커밋 `7d75473` 1차 → `b625f07` 확정)
- `computeCycleConfig()` — N에 따른 cycles/sleep/split 자동 산출:
  - N=0/read 실패: dailyCount=0 (no-op)
  - N≤50,000: cycles=max(1, min(144, ⌊49,200/N⌋)), sleep=max(1500, ⌊BUDGET_MS/(N×cycles)⌋)
  - N>50,000: 분할 모드 — dailyCount=50,000, cycles=1, sleep=1500ms
- 분할 슬라이스 (split mode): meta/stats.lastCheckedOffset 기준 startOffset → 50,000개 (래핑 지원)
- Offset 진행도 보존 (option b): processedCount 매 iteration 시작 시 i+1 낙관 증가, rate-limited break 시 i 롤백. 종료 시 `(startOffset + processedCount) % totalCount` → `lastCheckedOffset` 갱신
- `waitIfInBlockedZone()` — 매 iteration 직전 KST 시각 체크. 01:00 ≤ now < 04:30 진입 시 04:30 KST까지 sleep
- 시작 로그: `[Cycle] N=37 daily=37 cycles=144 sleep=13851ms offset=0~36 split=false`
- 검증 매트릭스: N=37 → 144cycles/13.85s, N=1000 → 49cycles/1.5s, N=49,200 → 1cycle/1.5s, N=50,000+ → split

⑤ **firestore.rules `price_drops_baby` 규칙 추가 + 배포** (커밋 `c7fbfb1`)
- `price_drops_baby/{date}`: read 인증 / write 차단

⑥ **앱 알림 라우팅 분기 추가** (커밋 `c66489f`)
- `services/notifications.ts`: `getItemIdFromNotification` → `resolveNotificationRoute` 로 교체
- 라우팅: `screen='price-drops'` → `/price-drops` / `screen='home'` → `/` / `screen='detail'+itemId` → `/detail/{itemId}` / 레거시(itemId 단독) → `/detail/{itemId}`

⑦ **두 레포 Public 전환** (사용자 직접 작업)
- jigumiya, aigo 양쪽 GitHub 레포 Public 전환 → **GitHub Actions 무제한 무료** 혜택
- 사전 보안 점검: .gitignore 검증, 하드코딩 secret 0건, 워크플로우 secrets 사용, git history clean

⑧ **Google Cloud API Key 제한** (사용자 직접)
- iOS apiKey: Bundle ID `com.jigumiya.app` 제한
- Android apiKey: 패키지명 `com.jigumiya.app` + SHA-1 제한

⑨ **GoogleService-Info.plist untrack** (커밋 `d491305`) — `git rm --cached`로 추적만 해제 (로컬 파일 유지)

⑩ **1.0.7 (bn41/vc41) 빌드 완료** — Android AAB / iOS IPA 산출물 확보. 1.0.7 미배포 — 1.0.8에 통합되어 사용자에게는 1.0.8로 전달.

---

## 완료된 TODO (2026-04-30 이전)

- [x] 쿠팡 공유하기 진입 시 쿠팡 앱 이탈 버그 수정 (resolved URL + HTML fetch + onShouldStartLoadWithRequest 차단)
- [x] **원인 확정**: 파트너스 실적 미집계 — 쿠팡 공식 가이드 p.13 (2026-04-20). 아이고 AQ-4 동일 문제.
- [x] **실행**: 018 Firebase Functions Resolver 구현 — 실기기 검증 완료 (2026-04-24)
- [x] **해소**: 아이고 cron 시간 충돌 — 시간대 재분리 완료 (2026-04-24)
- [x] **1차 긴급 조치**: price-check cron 비활성화 — 지금이야 `a1765f6`, 아이고 `23033de` (2026-04-21)
- [x] **1차 재활성화**: price-check cron — 지금이야 `3c667ef`, 아이고 `24b1e0c` (2026-04-24 오후)
- [x] **2차 긴급 조치**: price-check cron 재비활성화 — 지금이야 `3cd068e`, 아이고 `fb66468` (2026-04-24 야간)
- [x] **근본 수정**: price-checker 재시도 루프 완전 제거 — 지금이야 `46c20e5`, 아이고 `840f1ea` (2026-04-24)
- [x] **해제**: 파트너스 계정 정지 소명 해제 완료 (2026-04-24)
- [x] **구현**: 019 §8-A 카테고리 베스트 컬렉션 — 950 상품 (2026-04-26)
- [x] **구현**: 019 §8-B price-checker `category_best` 캐시 (2026-04-26)
- [x] **구현**: feed 탭 카테고리 베스트 + 가격변동 탭 신설 (2026-04-26)
- [x] **빌드**: 1.0.6 bn40/vc40 → iOS App Store 심사 제출 + Android 프로덕션 승급 (2026-04-26)
- [x] **구현**: 019 §5-2 shared-price-checker cron 신설 (2026-04-27, 62448cc)
- [x] **배포**: firestore.rules CLI 배포 전환 + 아이고 통합본 (2026-04-27, fd384c7/da2031e)
- [x] **추가**: 앱 업데이트 알림 기능 + `meta/config_jigumiya` 운영자 문서 생성 (2026-04-27, 3a5bbc3)
- [x] **수정**: minPrice 50,000 → 30,000 sync
- [x] **추가**: 019 §10 운영 정책 신규 섹션
- [x] **버그수정**: 카테고리 베스트 + 자주사는 탭 — firestore.rules 미배포 → CLI 배포로 복구
- [x] **빌드**: 1.0.7 (bn41/vc41) AAB/IPA 산출물 확보 (2026-04-30)
- [x] **확정**: 가격체크 + 알림 설계 → 동적 사이클 + 즉시 발송 + morning/evening 시간대 분기 (2026-04-30 재설계)
- [x] **구현**: shared-price-checker 동적 사이클 (2026-04-30, b625f07)
- [x] **버그수정 (BUG-42)**: 쿠팡 공유 → 상품추가 화면 무한로딩 (2026-04-30, 5c0b5da)
- [x] **확인**: 설정화면 와우회원 관련 문구 → 이미 `648409e` (Phase 3-D, 2026-04-19)에서 제거 완료
- [x] **구현**: shared-price-checker 알림 7종 + 24h 중복 방지 + 시간대 분기 (2026-04-30, ee60516)
- [x] **수정**: 온보딩 문구 (2026-04-30, ffa5154)
- [x] **추가**: firestore.rules `price_drops_baby/{date}` 규칙 + 배포 (2026-04-30, c7fbfb1)
- [x] **추가**: 앱 알림 라우팅 분기 — `resolveNotificationRoute` 헬퍼 (2026-04-30, c66489f)
- [x] **전환**: 두 레포 Public 전환 (jigumiya + aigo) (2026-04-30, 사용자 직접)
- [x] **보안**: Public 전환 안전성 점검 (2026-04-30)
- [x] **보강**: Google Cloud API Key 제한 (2026-04-30, 사용자 직접)
- [x] **정리**: GoogleService-Info.plist untrack (2026-04-30, d491305)
