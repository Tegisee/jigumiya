# 지금이야 (Jigumiya) - 메인 컨텍스트

## 중요: 새 대화창 시작 방법
docs/000_MD_사용법.md 와 이 파일을 먼저 읽을 것.
작업할 항목의 sub MD도 함께 읽고 시작할 것.

## 작업 리스트

### Phase 1 (MVP)
| 번호 | 작업 | 상태 | sub MD |
|------|------|------|--------|
| 001 | 프로젝트 초기화 + 패키지 설치 | ✅ | 001_프로젝트개요.md |
| 002 | 기술스택 + 폴더구조 세팅 | ✅ | 002_기술스택.md |
| 003 | 디자인시스템 + UI 구현 (메인/설정/모달/상세) | ✅ | 003_디자인시스템.md |
| 004 | 수익모델 확정 (쿠팡 파트너스 단일) | ✅ | 004_수익모델.md |
| 005 | UX 플로우 확정 | ✅ | 005_UX플로우.md |
| 006 | 알림 전략 확정 | ✅ | 006_알림전략.md |
| 007 | 데이터 저장 구조 구현 | ✅ | 007_데이터저장구조.md |
| 008 | Share Intent 연동 | ✅ | 008_ShareIntent.md |
| 009 | Firebase 연동 | ✅ | 009_Firebase.md |
| 010 | 상품 정보 스크래핑 (WebView) | ✅ | 010_쿠팡파트너스API.md |
| 011 | EAS 빌드 + 실기기 테스트 | ✅ | 011_EAS빌드_배포.md |

### Phase 2 (가격 추적 + 알림)
| 번호 | 작업 | 상태 | sub MD |
|------|------|------|--------|
| 012 | FCM 푸시 알림 + 가격 체크 봇 | ✅ | 012_FCM푸시알림.md |
| 013 | 쿠팡 파트너스 API 연동 | ✅ | (010, 012에 통합 — 별도 MD 없음) |

### Phase 2.5 (버그 수정 + 개선)
| 번호 | 작업 | 상태 | sub MD |
|------|------|------|--------|
| 015 | 버그 수정 및 개선 | 🔄 | 015_Phase2.5_버그수정_및_개선.md |
| 016 | AppStore 메타데이터 | ✅ | 016_AppStore_메타데이터.md |

### Phase 3 (앱 구조 개편)
| 번호 | 작업 | 상태 | sub MD |
|------|------|------|--------|
| 017 | 앱 구조 개편 (3탭 + shared_products + 피드) | 🔄 3-D MVP 완료 (2026-04-19) | 017_앱구조개편_Phase3.md |
| 018 | Firebase Functions 파트너스 링크 Resolver | ✅ 실기기 검증 완료 (2026-04-24), 실적 검증 대기 | 018_FirebaseFunctions_Resolver.md |
| 019 | SharedProducts + 카테고리 베스트 통합 설계 | 🔄 §8-A/§8-B 완료, §12 알림 7종 + §5-2 동적 사이클 고도화 (2026-04-30), §8-C 대기 | 019_Phase3_SharedProducts.md |

**진행 경과**:
- Phase 3-A 완료 (2026-04-18): shared_products 이중 쓰기 + 중복 가드 검증 성공
- Phase 3-D MVP 완료 (2026-04-19): 3탭 구조, 자주사는 토글(홈 카드 + 상세), 스와이프 삭제, 피드 정적 배너, 10개 제한, 뱃지 초기화
- 파트너스 실적 미집계 원인 공식 확정 (2026-04-20): 쿠팡 공식 가이드 p.13 "공유 기능 링크 수익 집계 안 됨" → Firebase Functions resolve 필수 (018)
- 파트너스 API Rate Limit 2회 초과 (2026-04-21): 지금이야/아이고 cron 양쪽 긴급 비활성화. **원인 확정** — 파트너스 공식 사이트 **실적 상세 리포트 페이지** 접속 시 내부 대량 API 호출 (스크린샷 증거 확보). 기간별 리포트는 정상. 3회 시 계정 정지 위험. 2026-04-22 07:21 KST 자연 해제 후 공식 문의 + Resolver 완료 후 cron 재활성화. 상세: docs/010 §Rate Limit 초과 사건.
- 018 Firebase Functions Resolver 배포 완료 (2026-04-21): `resolveAndGenerateAffiliateUrl` v2 callable, asia-northeast3, Node 22, Secrets 등록, Cleanup policy 설정. 클라이언트 dual-path(Functions → client fallback). 아이고 앱도 동일 적용.
- 018 실기기 검증 + 3대 버그 수정 완료 (2026-04-24): ①401 Unauthorized — 2세대 Callable Cloud Run invoker IAM에 `allUsers:run.invoker` 미부여. 함수 코드에 `request.auth` 검증 추가한 뒤 allUsers 부여(이중 보안). ②`link.coupang.com/a/...` resolve 실패 — 3xx가 아닌 200 HTML(JS 리다이렉트) 반환. HTML 내부 `redirectWebUrl='...\x3D...'` JS 변수 hex-escape 디코드로 vp URL 추출. ③딥링크 API 무증상 실패 — `COUPANG_ACCESS_KEY` secret 말미 `\n`이 Authorization 헤더에 주입돼 undici가 TypeError 거부, outer catch가 조용히 삼켜 원본 URL 저장 증상. `.trim()` 방어 처리. 상세: docs/018.
- iOS 1.0.5 (bn38) App Store 심사 제출 + Android 1.0.5 (vc38) 프로덕션 출시 완료 (2026-04-24)
- price-check cron 1차 재활성화 + 시간대 분리 (2026-04-24 오후): 지금이야 `3c667ef` (08/12/20 KST) + 아이고 `24b1e0c` (07/09/11/13/16/19 KST). 동시 시간대 겹침 없음.
- 🚨 **cron 2차 긴급 비활성화 + 재시도 루프 제거 (2026-04-24 야간)**:
  - 증상: 재활성화 당일 지금이야 실행당 /products/search 56~74회 (37개 상품 × 평균 1.68회). 실행 소요 ~30초로 분당 환산 **~110회** → 공식 한도 분당 50회 2배 초과
  - 원인: `fetchCurrentPrice` 내부 `keywords[4단어, 2단어]` for-loop 재시도 — 매칭 실패 시 쿼리 축소 재호출, 재시도 사이 딜레이 없음
  - 조치: ① 양쪽 cron 즉시 차단 — 지금이야 `3cd068e`, 아이고 `fb66468`. ② 재시도 루프 완전 제거 — 지금이야 `46c20e5`, 아이고 `840f1ea` (상품당 1회 검색, 실패 시 즉시 return null)
  - 효과: 지금이야 37회/실행 고정, 아이고 2회/실행 고정 — **-41%**
  - 파트너스 계정 정지 → 소명 후 해제 완료 (2026-04-24)
  - **쿠팡 파트너스 공식 Rate Limit 전체**: 검색 API 1분/50회, 리포트 API 1시간/500회, 모든 API 합산 1분/100회, 링크 생성 1분/50회
- 019 §8-A 카테고리 베스트 구현 완료 (2026-04-26):
  - 공식 카테고리 19개 확정 (1001~1030, probe 없이 쿠팡 공식 문서로 확정)
  - Firebase 저장: 19개 × 50개 = **950개 상품** (`category_best/{categoryId}` 단일 문서, products 배열)
  - `scripts/category-best-updater/` 신설 — 19개 카테고리 순회, 카테고리 사이 sleep 80초 (분당 50회 한도 보수 운영)
  - `.github/workflows/category-best-update.yml` 활성화 — 매일 02:00 KST 1회
  - `firestore.rules` `category_best` 규칙 추가 + Console 게시 완료
  - feed 탭 UI 교체(833805d, 18abcb0): "곧 출시" 배너 → 카테고리 칩 가로 스크롤 + 선택 카테고리 상품 리스트, 1~3위 민트 랭크 뱃지, 로켓배송 이모지, 쿠팡 파트너스 의무 고지 푸터
- 019 §8-B (price-checker §4-2 중복 제거) 완료 (2026-04-26):
  - `scripts/price-checker/category-best-cache.ts` 신설
  - `shared_products` 가격 체크 시 `category_best` 캐시 조회 → 중복 productId API 재호출 없이 캐시 가격 재사용
  - 가드: **6시간 신선도** + **30% 변동 가드** (캐시값과 너무 차이나면 캐시 무시)
  - cron 비활성 상태 유지 (Phase 3 마무리 + 아이고 통합 후 재활성화)
- 019 가격변동 탭 신설 (4탭 구조) (2026-04-26, f8b88e9):
  - 탭 구성: **홈 / 자주사는 / 카테고리 베스트 / 가격변동** (기존 3탭 → 4탭)
  - `price_drops` 컬렉션 설계 + `subscribePriceDrops` 구독
  - 필터 칩(전체/-10%/-20%) + 하락률 뱃지
  - `scripts/price-checker/`에 `recordPriceDrop` 로직 추가 (cron 비활성 상태라 실데이터는 cron 재활성화 후 채워짐)
- 1.0.6 (bn40/vc40) 빌드 완료 (2026-04-26, 986acaf):
  - iOS TestFlight 업로드 → App Store 심사 제출
  - Android Play Console 내부 테스트 → 프로덕션 승급
  - bn39 재빌드용 → bn40으로 bump
- 2026-04-27~28 종합 작업 (Phase 3 §8 마무리 + 019 §5-2 cron 신설 + 운영 정책 + 버그 수정):

  ① **firestore.rules 아이고 통합본 + CLI 배포 전환** (커밋 `fd384c7`, `da2031e`)
    - `category_best_baby/{slug}`, `event_best/{eventSlug}` 규칙 추가 (아이고 공유 컬렉션, read 인증 / write 차단)
    - `meta/{docId}` 규칙 추가 (read: if true — 인증 전 첫 실행에서 minRequiredVersion 체크 가능, write: 차단)
    - 슬러그 예시 정정: `'toys-0-3'`, `'birthday-1'`, `'parent-wedding'` (실제 운영 값)
    - `firestore.rules` → `jigumiya/` 하위로 이동 (firebase.json과 동일 디렉토리)
    - `firebase.json` + `.firebaserc` 신설 + firestore 섹션 추가 → **CLI 배포 활성화** (콘솔 수동 게시 방식 폐기)
    - `firebase deploy --only firestore:rules --project jigumiya` 정상 배포 확인
    - **jigumiya 레포가 firestore.rules 단일 소스(source of truth)** 확정 — 콘솔 직접 편집 금지

  ② **019 §5-2 shared-price-checker cron 신설** (커밋 `62448cc`)
    - `scripts/shared-price-checker/` 신설 (7개 파일):
      - `index.ts`: shared_products 풀 fetch + createdAt asc 순차 + trackerCount=0/당일 추가 스킵 + category_best 캐시 hit 시 API 스킵 + sleep 1500ms + rate-limited 즉시 종료 + collectionGroup 추적자 수집 + Expo 푸시
      - `coupang-api.ts`: `SearchResult`/`FetchPriceResult` 도입 — rateLimited 명시 분기 (HTTP 429 + rMessage 휴리스틱)
      - `price-drop.ts`: `recordPriceDrop` 분리 (db 인자 받는 형태)
      - `category-best-cache.ts`, `notifier.ts`: 기존 `price-checker`에서 복사
      - `package.json` name → `jigumiya-shared-price-checker`
    - `firestore.indexes.json` 신설 → `firebase deploy --only firestore:indexes` — **collectionGroup `tracked.productId` 인덱스 배포** (추적자 역방향 검색용)
    - `SharedProduct.createdAt?: number` 필드 추가 (optional, 기존 문서 호환) + `upsertSharedProduct` 신규 생성 시 `createdAt: Date.now()` 기록 (read+write 분기)
    - `.github/workflows/shared-price-check.yml`: cron `'30 19 * * *'` (= 04:30 KST) **주석 처리, workflow_dispatch만 활성**, timeout 350분 (GitHub 6h 한도 안전 마진)
    - 기존 `price-check.yml`(users-based legacy)은 변경 없이 비활성 유지 — Phase 3-C에서 정식 폐기

  ③ **앱 업데이트 알림 기능 추가** (커밋 `3a5bbc3`)
    - `services/updateChecker.ts` 신설: `compareVersion`(semver 부분 비교, "1.0.10" 함정 회피) + `checkForUpdate`(meta/config_jigumiya 조회 + Alert.alert)
    - "나중에" 누른 minRequiredVersion은 AsyncStorage(`update_prompt_dismissed_version`)에 기억 → 같은 버전 재표시 안 함
    - `forceUpdate=true`면 "나중에" 버튼 숨김 + cancelable:false
    - `services/firebase.ts:getMetaConfig()` 추가 — 인증 없이 호출 가능 (rules: read if true)
    - `types/MetaConfig` 인터페이스 추가, `app/_layout.tsx` 첫 마운트 시 1회 호출
    - **운영자 작업**: `meta/config_jigumiya` 문서 콘솔 생성 (`minRequiredVersion: "1.0.6"` 등)
    - iOS App Store ID는 TODO 자리만 (App Store Connect 발급 후 `services/updateChecker.ts:9` 교체)

  ④ **minPrice 50,000 → 30,000 sync** (CLAUDE.md + 019 docs)
    - `event_best` cron 호출 시 `minPrice` 기준 하향 조정 — 더 많은 기념일 상품 노출
    - 영향: 아이고 `event-best-updater` 호출 파라미터 (지금이야 cron 무관)

  ⑤ **019 §10 운영 정책 신규 섹션 추가**
    - cron 활성화 절차, 비활성화 트리거, 모니터링 지표, 사고 대응 체크리스트 명문화
    - 코드 신설(§8-D-1)과 활성화(§8-D-2)의 분리된 책임 정착

  ⑥ **버그 수정: 카테고리 베스트 탭 + 자주사는 탭 read 실패** (firestore.rules 미배포 원인)
    - 증상: 1.0.6 배포 직후 카테고리 베스트 탭 "준비중이에요" 표시 + 홈 하트 토글 → 자주사는 탭 미반영
    - 원인 확정: `category_best`, `users/{uid}/{document=**}` 규칙이 콘솔에 미게시(레포 파일에는 있으나 미배포). 두 버그 동시 + 코드 git diff 없음 → Firebase 서버 측 rules 미배포로 진단
    - 해결: ①번 `firebase deploy --only firestore:rules` 정상 배포로 복구
    - **재발 방지**: ① CLI 배포 워크플로우 정착, ② 콘솔 직접 편집 금지(레포 단일 소스)

  ⑦ **cron 비활성 상태 유지** — 양 cron 모두 schedule 주석
    - `shared-price-check.yml` (신규, §5-2) — workflow_dispatch만 활성
    - `price-check.yml` (legacy) — workflow_dispatch만 활성
    - 활성화 선결: 아이고 실기기 테스트 통과 + 아이고 Firebase → jigumiya 통합(§8-C) 완료
    - 활성화 시점: **지금이야 + 아이고 동시 반영** (단일 cron으로 두 앱 공통 데이터 갱신)

  ⑧ **CLAUDE.md + 019 docs sync** (커밋 `ce261a4`, `6c21001`, `51d640a`, `a5eb348`)
    - 019 §3-4 `meta/stats`, §4-4 trackerCount 정리, §5-2 가격체크 확정안, §11 앱 내 검색 기능 신규
    - 낮 2회 보조 업데이트 폐기 표시 + cron 스케줄 표현 일관 sync (CLAUDE.md 6군데)
    - §1 진행 표 §8-D를 §8-D-1(✅)/§8-D-2(⏸)로 분리

- 2026-04-28 가격 체크 + 알림 설계 확정 (내일 재논의 예정):

  **가격 체크 (shared-price-checker)** — 동적 사이클 방식 확정:
  - `meta/stats.sharedProductCount` 읽어서 **사이클 시간 자동 계산** (정적 분당 40회 sleep 1500ms 고정 → 동적 sleep 간격 조정으로 전환)
  - 카테고리 업데이트 시간대 **01:00~04:30 KST 제외** (category_best/baby/event 갱신 보호)
  - 분당 최대 40회 (공식 한도 50회 대비 80% 마진 유지)
  - 계산식: `전체상품수 ÷ 40 = 1사이클 소요분`, 가용시간(20.5h) 내 자동 반복
  - 지금이야 + 아이고 `shared_products` 공유이므로 **단일 cron으로 양 앱 커버**
  - 영향: §5-2 정적 sleep 1500ms 가정 폐기 → `meta/stats` 기반 sleep 동적 산출로 전환 (구현 시점에 19 §5 갱신 필요)

  **알림 발송** — 하루 3회 고정 시간대로 변경:
  - 기존 2회(지금이야 11:30/20:30, 아이고 10:00/19:00) → **3회 고정 시간대** (시간대 미확정, 내일 협의)
  - 각 발송 시점까지 **누적된 가격 하락 상품을 한 번에 모아서 발송** (실시간 발송 X)
  - 온보딩 문구 수정 필요 (실제 횟수 확정 후 — `app/onboarding/*` 또는 안내 텍스트 위치 점검)

  **내일(2026-04-29) 재논의 항목**:
  - [x] 알림 발송 시간대 3회 확정 → **폐기, 즉시 발송 + morning/evening 시간대 분기로 변경 (2026-04-30)**
  - [x] 가격 변동 없을 때 알림 여부 → **evening_no_change 1회로 흡수 (2026-04-30)**
  - [x] 온보딩 문구 최종 확정 → **"가격 변동 시 즉시 알림" 적용 (2026-04-30, ffa5154)**
  - [ ] 전체 cron 스케줄 최종 검토 후 활성화 (§8-D-2)

- 2026-04-30 종합 작업 (BUG-42 + 알림 7종 + 동적 사이클 + 1.0.7 빌드):

  ① **BUG-42: 쿠팡 공유 → 상품추가 무한로딩 방어** (커밋 `5c0b5da`)
    - 원인: `handleNext`의 await 체인(callable → fetch → deeplink)에 timeout 부재 → Functions cold start 또는 fetch hang 시 30초 scrape 타이머가 시작조차 안 돼 무한 로딩으로 표출. iOS ShareIntent 직후 더 자주 발생.
    - `_layout.tsx`: 인증 완료 후 `warmupResolveAffiliate()` fire-and-forget — sentinel `https://__warmup__.local/` URL은 functions/index.ts:256에서 `coupang.com` 미포함 시 즉시 early return → 쿠팡 API 미호출(Rate Limit 0), 컨테이너 init만 트리거
    - `services/firebase.ts`: `warmupResolveAffiliate()` 신설
    - `app/modal/add-item.tsx`: `withTimeout()` (Promise.race) + `fetchWithTimeout()` (AbortController) 헬퍼 추가
      - `callResolveAffiliate` 8s timeout (handleNext + handleSave 양쪽)
      - `link.coupang.com` fallback fetch ×2 각 5s AbortController
      - `generateDeepLink` 5s timeout (handleNext + handleSave 양쪽)

  ② **온보딩 문구 갱신** (커밋 `ffa5154`)
    - `components/OnboardingScreen.tsx:46` Step 1 feature 문구
    - "매일 3회 자동 가격 확인" → "가격 변동 시 즉시 알림"

  ③ **shared-price-checker 알림 7종 시스템** (커밋 `ee60516`)
    - notifier.ts `PushPayload` discriminated union (broadcast 2단 분리, 총 7타입):
      - `morning_greeting` — 07:00~09:00 KST 진입 시 활성 사용자 전체
      - `price_drop_summary` — 가격 하락, 사용자당 1개 합산 (24h 통과 productId 0개 시 skip)
      - `target_reached` — 목표가 도달, 상품별 1개 (즉시성 우선, drop_summary 중복 제외)
      - `price_up_summary` — 가격 상승, 사용자당 1개 합산
      - `evening_no_change` — 19:30~21:00 KST 진입 시, 그날 가격 알림(drop/up/target) 미수신자만
      - `broadcast_drop10` — 10%~19% 하락, 활성 사용자 전체
      - `broadcast_drop20` — 20% 이상 폭락, 활성 사용자 전체
    - 각 type 3개 후보 문구 랜덤 선택, `{N}` placeholder로 합산 갯수 표시
    - `data.screen` 라우팅: detail(상품 1개) / home(다수) / price-drops(broadcast)
    - 폐기: 기존 AlertType (`lowest_ever`, `lowest_no_target`, `no_change`) — summary/evening에 흡수
    - 24h 중복 방지: `users/{uid}.lastNotifications` 단일 map (morning?: number / evening?: number / priceDrop+priceUp+targetReached?: { [productId]: number } / broadcast?: { tier10?: number, tier20?: number })
    - flush 단계 분리: 스캔 사이클에서 `events.{drops, ups, targets, broadcastTier10, broadcastTier20}` 메모리 누적 → 끝에서 일괄 flush. 사용자당 합산 = `perUserDrops`/`perUserUps` Map. 24h 통과 productId 0개면 push 자체 skip. dotted-path FieldValue update로 일괄 반영.

  ④ **shared-price-checker 동적 사이클 고도화** (커밋 `7d75473` 1차 → `b625f07` 확정)
    - `computeCycleConfig()` — N에 따른 cycles/sleep/split 자동 산출:
      - N=0/read 실패: dailyCount=0 (no-op)
      - N≤50,000: cycles=max(1, min(144, ⌊49,200/N⌋)), sleep=max(1500, ⌊BUDGET_MS/(N×cycles)⌋)
      - N>50,000: 분할 모드 — dailyCount=50,000, cycles=1, sleep=1500ms
    - 분할 슬라이스 (split mode): meta/stats.lastCheckedOffset 기준 startOffset → 50,000개 (래핑 지원)
    - Offset 진행도 보존 (option b): processedCount 매 iteration 시작 시 i+1 낙관 증가, rate-limited break 시 i로 롤백 (현재 item 미평가). 종료 시 `(startOffset + processedCount) % totalCount` → `lastCheckedOffset` 갱신. 부분 진행 보존 → 다음 run 이어서 처리.
    - `waitIfInBlockedZone()` — 매 iteration 직전 KST 시각 체크. 01:00 ≤ now < 04:30 진입 시 04:30 KST까지 sleep (카테고리 갱신 시간대 충돌 방지).
    - 시작 로그: `[Cycle] N=37 daily=37 cycles=144 sleep=13851ms offset=0~36 split=false` 또는 `N=120000 daily=50000 cycles=1 sleep=1500ms offset=50000~99999 split=true`
    - 검증 매트릭스: N=37 → 144cycles/13.85s, N=1000 → 49cycles/1.5s, N=49,200 → 1cycle/1.5s, N=50,000+ → split

  ⑤ **firestore.rules `price_drops_baby` 규칙 추가 + 배포** (커밋 `c7fbfb1`)
    - `price_drops_baby/{date}`: read 인증 / write 차단 (서버 전용, 아이고 공유 컬렉션)
    - `firebase deploy --only firestore:rules --project jigumiya` 정상 배포

  ⑥ **앱 알림 라우팅 분기 추가** (커밋 `c66489f`)
    - `services/notifications.ts`: `getItemIdFromNotification` → `resolveNotificationRoute` 로 교체 (경로 문자열 직접 반환)
    - `app/_layout.tsx`: foreground / killed-state 두 리스너 동일 헬퍼 사용
    - 라우팅: `screen='price-drops'` → `/price-drops` / `screen='home'` → `/` / `screen='detail'+itemId` → `/detail/{itemId}` / 레거시(itemId 단독) → `/detail/{itemId}`
    - **검증 미완료**: `/price-drops` 경로가 expo-router에서 `(tabs)/price-drops.tsx`로 정상 라우팅되는지 실기기 확인 필요

  ⑦ **두 레포 Public 전환** (사용자 직접 작업, 2026-04-30)
    - jigumiya, aigo 양쪽 GitHub 레포 Public 전환 → **GitHub Actions 무제한 무료** 혜택 확보
    - 사전 보안 점검 (Public 전환 안전성):
      - .gitignore: `.env`, `*-firebase-adminsdk-*.json`, `service-account*.json`, `google-services.json`, `GoogleService-Info.plist`, `*.jks/*.p8/*.p12/*.key` 모두 등록
      - 하드코딩 secret 점검: services/firebase.ts apiKey는 Firebase 정책상 secret 아님(클라이언트 식별자), Coupang은 Functions Secret Manager + EAS Secrets 빌드 주입, scripts/* 는 GitHub Actions secrets 사용
      - 워크플로우: 모든 env 변수 `${{ secrets.X }}` 사용 ✅
      - Git history: `BEGIN PRIVATE KEY` / `private_key` 없음 ✅

  ⑧ **Google Cloud API Key 제한** (사용자 직접, 2026-04-30)
    - GoogleService-Info.plist / google-services.json 의 Firebase apiKey 노출 후속 보강
    - iOS apiKey: Bundle ID `com.jigumiya.app` 제한
    - Android apiKey: 패키지명 `com.jigumiya.app` + SHA-1 제한
    - 권장 보강 1차 적용 (App Check는 별도 검토)

  ⑨ **GoogleService-Info.plist untrack** (커밋 `d491305`)
    - `git rm --cached jigumiya/GoogleService-Info.plist` — 로컬 파일은 빌드용 유지
    - 이미 .gitignore에 등록되어 있으나 과거 추적된 상태로 남아있어 정리
    - .easignore에서 제외 안 됨 → EAS 빌드 시 그대로 포함됨
    - git history에는 이전 커밋(initial commit `bc71610`)에 남아 있음 — Firebase 정책상 secret 아니어서 무해

  ⑩ **1.0.7 (bn41/vc41) 빌드 완료** (2026-04-30)
    - `app.config.js`: version 1.0.7 / ios.buildNumber 41 / android.versionCode 41
    - `android/app/build.gradle`: versionCode 41 / versionName "1.0.7" 동기화
    - 산출물:
      - Android: `~/jigumiya/builds/android/jigumiya-1.0.7-41.aab`
      - iOS: `~/jigumiya/builds/ios/jigumiya-1.0.7-41.ipa`
    - 1.0.7 주요 변경: BUG-42 무한로딩 방어 + 온보딩 문구 갱신 + 알림 라우팅 분기 (서버측 7종 알림은 cron 활성화 시 효과)

- 2026-05-01 작업 (오늘의 특가 데이터 교체 + 하트 버튼 누락 fix + 1.0.8 빌드):

  ① **골드박스 → 오늘의 특가 데이터 교체** (커밋 `dd15624`)
    - 폐기: `services/coupangApi.ts:fetchGoldbox` + `GOLDBOX_PATH` + `GoldboxProduct` 통째로 제거 — 골드박스 API 호출 0건 (사용자 단말 직접 호출 폭증 + affiliate 미변환 클릭 모두 해소)
    - 신규 데이터 출처: ① `subscribePriceDrops(cb, 30, 24)` — 24h, 최대 30개. 클라이언트에서 `dropRate asc` 정렬 → 상위 20개. ② `fetchAllCategoryBest()` 1h AsyncStorage 캐시(`home-deals-best-pool`, 카테고리당 5개 = 95개 후보) — drops 부족분만 채움. productId Set으로 중복 회피
    - 빈 상태: drops + bestPool 둘 다 도착 후 합쳐서 0건이면 "아직 가격 변동 데이터가 부족해요. 가격이 내려가면 바로 알려드릴게요!" 안내 텍스트
    - 클릭: drop은 `deepLink` 직링크, best는 `generateDeepLink(productUrl)` (feed 탭과 동일 패턴) — affiliate 변환 보장
    - 타이틀 "오늘의 특가" 유지

  ② **하트 버튼 누락 fix + productId 자가 치유** (커밋 `dd15624`)
    - 증상: 신규 추가 상품 일부에서 하트 버튼이 안 보임. 간헐적
    - 원인: `add-item.tsx:handleSave`의 `extractIds(resolvedUrl)` 정규식 `\/products\/(\d+)` 단일 패턴 → `link.coupang.com/a/...` 단축 URL이 resolve 실패로 남으면 productId 추출 0% → trackedItem `productId=undefined` 저장 → `useFavoriteToggle.enabled=false`로 하트 렌더 자체 안 됨. BUG-42 timeouts(8s/5s/5s) + Functions cold start + 네트워크 변동성 겹칠 때 발생
    - **추출 정규식 보강** (`services/coupangApi.ts:extractProductId`): `/products/(\d+)` + `productId=(\d+)` + `pId%3D(\d+)` + `pId=(\d+)` 다중 패턴. `extractVendorItemId` 신설
    - **다중 URL 후보 시도** (`add-item.tsx:extractIds`): `scraped?.resolvedUrl` → `resolvedUrl` → `affiliateUrl` → `parsedUrlRef.current` 순서로 시도, 먼저 잡히는 값 채택
    - **자가 치유 액션** (`store/useAppStore.ts:backfillProductIds`): 로컬 trackedItems 중 productId 누락 항목을 `resolvedUrl`/`url`에서 재추출 → store + `updateItemInFirestore` 갱신. 홈 mount + `syncFromFirestore` 직후 1회 자동 호출
    - **shared_products 카운터 미보강** (의도): 다른 단말 중복 증가 위험 → 다음 토글/삭제 시점에 자연 복구
    - 한계: 모든 후보가 단축 URL인 극단 케이스(원본 입력 자체가 `link.coupang.com`이고 resolve 전부 실패)는 여전히 추출 불가. 필요 시 `services/productMeta.ts:parseShortUrl` 마지막 보강책 도입 가능

  ③ **1.0.8 (bn42/vc42) 빌드 완료**
    - `app.config.js`: version 1.0.8 / ios.buildNumber 42 / android.versionCode 42
    - `android/app/build.gradle`: versionCode 42 / versionName "1.0.8" 동기화
    - 산출물:
      - Android: `~/jigumiya/builds/android/jigumiya-1.0.8-42.aab`
      - iOS: `~/jigumiya/builds/ios/jigumiya-1.0.8-42.ipa`
    - 1.0.8 주요 변경: 골드박스 → 오늘의 특가 데이터 교체 + 하트 버튼 누락 fix + backfillProductIds 자가 치유
    - 1.0.7은 미배포 — 1.0.8에 1.0.7 변경(BUG-42 무한로딩 방어 + 온보딩 문구 + 알림 라우팅 분기)이 모두 통합되어 사용자에게 1.0.8로 전달

- 다음:
  1. **1.0.8 Play Console 업로드** + **App Store 심사 제출** (Transporter 수동, `eas submit` 금지)
  2. **`meta/config_jigumiya.minRequiredVersion = "1.0.8"` 콘솔 갱신** (사용자 직접) — 1.0.8 출시 후 적용
  3. **앱 측 price-drops 탭 라우팅 검증** — `router.push('/price-drops')` 가 expo-router에서 `(tabs)/price-drops.tsx`로 정상 이동하는지 실기기 확인. 미동작 시 `/(tabs)/price-drops` 절대경로 또는 navigate API로 변경 검토
  4. **하트 버튼 백필 동작 검증** — 1.0.8 실기기에서 기존 누락 상품의 하트가 홈 mount 1회로 살아나는지 + 신규 추가 상품에서 하트 안정적으로 표시되는지 확인
  5. **shared-price-checker workflow_dispatch 수동 dry-run** (cron 활성화 전, 동적 사이클 + 7종 알림 실제 동작 검증)
  6. **아이고 실기기 테스트 통과** + 아이고 Functions 수정 이식 (지금이야 `e69d05e` 내용)
  7. **cron 활성화 시점에 `shared-price-check.yml` + `price-check.yml` schedule 주석 동시 해제** (§8-D-2) — 선결: §8-C 아이고 통합 + 5번 dry-run 통과
  8. **category-best 브로드캐스트 큐 구현** (별도 PR) — `scripts/category-best-updater/`에 갱신 시 10/20% 하락 감지 → `broadcasts/{id}` 기록 → shared-price-checker가 큐 소비

### 참고 문서 (작업 리스트 외)
- 012_Phase2계획.md — Phase 2 초기 기획 문서 (이력 보존)
- 014_Phase3계획.md — Phase 3 구 로드맵 (017로 대체됨, 이력 보존)

### TODO (미정)
- [ ] 메인 화면에 쿠팡 이동 버튼 추가 (위치/형태 미정)
- [x] 쿠팡 공유하기 진입 시 쿠팡 앱 이탈 버그 수정 (resolved URL + HTML fetch + onShouldStartLoadWithRequest 차단)
- [x] **원인 확정**: 파트너스 실적 미집계 — 쿠팡 공식 가이드 p.13 "공유 기능 링크 수익 집계 안 됨" (2026-04-20). 아이고 AQ-4 동일 문제.
- [ ] **검증**: 뱃지 카운트 0 초기화 — 다음 푸시 알림 수신 후 foreground 전환 시 뱃지 제거 확인 (1.0.5 38/38)
- [x] **실행**: 018 Firebase Functions Resolver 구현 — 실기기 검증 완료 (2026-04-24)
- [ ] **검증**: 파트너스 실적 — Functions 경유 가족 구매 테스트 집계 확인 (1.0.5 배포 후)
- [x] **해소**: 아이고 cron 시간 충돌 — 시간대 재분리 완료 (2026-04-24): 지금이야(08/12/20 KST) ↔ 아이고(07/09/11/13/16/19 KST)
- [ ] **합의**: Firebase 공유 구조(jigumiya 프로젝트 기반 통합) — 아이고 베타 출시 이후 진행
- [ ] **검토**: 가격 체크 3회 중 마지막 회차에만 알림 발송 구조로 개선 (파트너스 실적 검증 후)
- [x] **1차 긴급 조치**: price-check cron 비활성화 — 지금이야 `a1765f6`, 아이고 `23033de` (2026-04-21, Rate Limit 2회 초과)
- [x] **1차 재활성화**: price-check cron — 지금이야 `3c667ef`, 아이고 `24b1e0c` (2026-04-24 오후, 시간대 분리)
- [x] **2차 긴급 조치**: price-check cron 재비활성화 — 지금이야 `3cd068e`, 아이고 `fb66468` (2026-04-24 야간, burst rate 분당 ~110회 확인 + 파트너스 계정 정지)
- [x] **근본 수정**: price-checker 재시도 루프 완전 제거 — 지금이야 `46c20e5`, 아이고 `840f1ea` (2026-04-24, 상품당 1회 검색)
- [x] **해제**: 파트너스 계정 정지 소명 해제 완료 (2026-04-24)
- [ ] **조건부 재활성화**: price-check cron — Phase 3 `shared_products` 완료 후 확정 스케줄 적용 (shared_products 가격체크 04:30~01:00 KST 분당 40회 순차, 지금이야 알림 11:30/20:30 KST, 아이고 알림 10:00/19:00 KST)
- [ ] **이식**: 아이고 Functions에 동일 수정(HTML redirectWebUrl 파싱 + Secret `.trim()`) 적용
- [ ] **수정**: 아이고 알림 버그 + 계정 삭제 버그 (상세 미정 — 별도 작업)
- [ ] **검증**: Play Store / App Store 1.0.5/1.0.6 승급 후 실제 사용자 환경 Functions 동작 확인
- [x] **구현**: 019 §8-A 카테고리 베스트 컬렉션 — 19개 × 50개 = 950 상품, cron 02:00 KST sleep 80초 (2026-04-26)
- [x] **구현**: 019 §8-B price-checker `category_best` 캐시 (6시간 신선도 + 30% 변동 가드) (2026-04-26)
- [x] **구현**: feed 탭 카테고리 베스트 리스트 UI + 가격변동 탭 신설 (4탭 구조, price_drops 컬렉션) (2026-04-26)
- [x] **빌드**: 1.0.6 bn40/vc40 → iOS App Store 심사 제출 + Android 프로덕션 승급 (2026-04-26)
- [x] **구현**: 019 §5-2 shared-price-checker cron 신설 (2026-04-27, 62448cc) — workflow_dispatch만 활성, schedule 주석 처리
- [x] **배포**: firestore.rules CLI 배포 전환 + 아이고 통합본 (2026-04-27, fd384c7/da2031e) — `category_best_baby`, `event_best`, `meta/{docId}` 규칙 + jigumiya 단일 소스 확정
- [x] **추가**: 앱 업데이트 알림 기능 + `meta/config_jigumiya` 운영자 문서 생성 (2026-04-27, 3a5bbc3) — `minRequiredVersion: "1.0.6"`
- [x] **수정**: minPrice 50,000 → 30,000 sync (CLAUDE.md + 019 docs, event_best 호출 기준)
- [x] **추가**: 019 §10 운영 정책 신규 섹션 (cron 활성화/비활성/사고 대응)
- [x] **버그수정**: 카테고리 베스트 + 자주사는 탭 — firestore.rules 미배포 → CLI 배포로 복구 (재발 방지: 콘솔 직접 편집 금지)
- [ ] **테스트**: shared-price-checker `workflow_dispatch` 수동 실행 → 풀 처리 dry-run 검증 (동적 사이클 + 7종 알림)
- [x] **빌드**: 지금이야 1.0.7 (bn41/vc41) — `app.config.js` + `android/app/build.gradle` 동기화 완료, AAB/IPA 산출물 확보 (2026-04-30)
- [ ] **배포**: 1.0.7 Play Console 업로드 + App Store 심사 제출 (Transporter 수동) + `meta/config_jigumiya.minRequiredVersion = "1.0.7"` 콘솔 갱신
- [ ] **활성화**: shared-price-check.yml + price-check.yml cron schedule 동시 주석 해제 — 선결: 아이고 실기기 테스트 통과 + §8-C 아이고 통합 + dry-run 통과
- [x] **확정**: 2026-04-28 가격체크 + 알림 설계 → 동적 사이클 + 즉시 발송(가격 변동 시) + morning/evening 시간대 분기로 변경 (2026-04-30 재설계)
- [x] **재논의 (2026-04-29~30)**: 알림 시간대 3회 → 즉시 발송 + morning(07-09)/evening(19:30-21) 시간대 분기, 가격 무변동 알림은 evening_no_change로 흡수, 온보딩 문구 "가격 변동 시 즉시 알림"
- [x] **구현**: shared-price-checker 동적 사이클 — `computeCycleConfig()` 신설 (cycles=min(144, ⌊49,200/N⌋), sleep=max(1500, ⌊BUDGET_MS/(N×cycles)⌋)) + N>50,000 분할 모드 + offset 진행도 보존 + Block zone 대기 (01:00~04:30 KST) (2026-04-30, b625f07)
- [x] **버그수정 (BUG-42)**: 쿠팡 공유 → 지금이야 상품추가 화면 무한로딩 — Functions 워밍업 + callable 8s/fetch 5s/deeplink 5s timeout (2026-04-30, 5c0b5da)
- [x] **확인**: 설정화면 와우회원 관련 문구 → 이미 `648409e` (Phase 3-D, 2026-04-19)에서 제거 완료된 stale TODO 확인 (2026-04-30)
- [x] **구현**: shared-price-checker 알림 7종 + 24h 중복 방지 (`users/{uid}.lastNotifications`) + 시간대 분기 (2026-04-30, ee60516)
- [x] **수정**: 온보딩 문구 — "매일 3회 자동 가격 확인" → "가격 변동 시 즉시 알림" (2026-04-30, ffa5154)
- [x] **추가**: firestore.rules `price_drops_baby/{date}` 규칙 + 배포 (2026-04-30, c7fbfb1)
- [x] **추가**: 앱 알림 라우팅 분기 — `resolveNotificationRoute` 헬퍼 (price-drops/home/detail) (2026-04-30, c66489f)
- [ ] **검증**: 앱 측 price-drops 탭 라우팅 — `router.push('/price-drops')`가 expo-router에서 `(tabs)/price-drops.tsx`로 정상 이동하는지 실기기 확인
- [x] **전환**: 두 레포 Public 전환 (jigumiya + aigo) — GitHub Actions 무제한 무료 혜택 (2026-04-30, 사용자 직접)
- [x] **보안**: Public 전환 안전성 점검 — .gitignore/.easignore 검증, 하드코딩 secret 0건, 워크플로우 secrets 사용, git history clean (2026-04-30)
- [x] **보강**: Google Cloud API Key 제한 — iOS Bundle ID + Android 패키지명/SHA-1 (2026-04-30, 사용자 직접)
- [x] **정리**: GoogleService-Info.plist untrack (2026-04-30, d491305) — 로컬 파일 유지, 추적만 해제
- [ ] **검토**: Firebase App Check 활성화 (Public repo 환경 추가 보강, apiKey 노출 환경에서 unauthorized client SDK 사용 차단)
- [ ] **별도 PR**: category-best 브로드캐스트 큐 — `scripts/category-best-updater/`에 갱신 시 10/20% 하락 감지 → `broadcasts/{id}` 기록 → shared-price-checker가 큐 소비
- [ ] **대기**: 쿠팡 파트너스 문의 답변 — `bestcategories` 호출 카운팅 방식 (1콜 = 1회 vs 100회) + 카테고리 ID 전체 목록
- [ ] **검증**: 가격변동 탭 실제 데이터 — cron 재활성화 후 `recordPriceDrop` 동작 확인
- [ ] **선결**: 아이고 Firebase → jigumiya 통합 (베타 출시 이후, §8-C)
- [x] **구현**: 골드박스 → 오늘의 특가 데이터 교체 — price_drops 24h 상위 N + category_best fallback (1h AsyncStorage 캐시), 골드박스 API 호출 0건 (2026-05-01, dd15624)
- [x] **버그수정**: 하트 버튼 누락 — productId 추출 다중 패턴(/products/, productId=, pId%3D, pId=) + URL 후보 다중 시도(scraped/resolved/affiliate/parsed) + backfillProductIds 자가 치유 액션 (2026-05-01, dd15624)
- [x] **빌드**: 지금이야 1.0.8 (bn42/vc42) — `app.config.js` + `android/app/build.gradle` 동기화 완료, AAB/IPA 산출물 확보 (2026-05-01)
- [ ] **배포**: 1.0.8 Play Console 업로드 + App Store 심사 제출 (Transporter 수동) + `meta/config_jigumiya.minRequiredVersion = "1.0.8"` 콘솔 갱신
- [ ] **검증**: 1.0.8 실기기 — 하트 백필 동작(기존 누락 상품 복구) + 신규 추가 시 하트 안정성 + 오늘의 특가 빈 상태 안내 + drop/best 카드 클릭 affiliate 변환

## 다음 작업 순서 (2026-05-01 이후)
1. **1.0.8 Play Console 업로드 + App Store 심사 제출** — Transporter 수동 (`eas submit` 금지). 출시 후 `meta/config_jigumiya.minRequiredVersion = "1.0.8"` 갱신
2. **앱 측 price-drops 탭 라우팅 검증** — `router.push('/price-drops')`가 expo-router `(tabs)/price-drops.tsx`로 정상 이동하는지 1.0.8 실기기 확인. 미동작 시 절대경로/navigate API로 변경
3. **하트 버튼 백필 동작 검증** — 1.0.8 실기기에서 ① 기존 누락 상품의 하트가 홈 mount 1회로 살아나는지(`backfillProductIds`) ② 신규 추가 상품 4~5개 연속 추가 시 모두 하트 표시되는지(`extractProductId` 다중 패턴 + URL 후보 다중 시도)
4. **shared-price-checker workflow_dispatch 수동 dry-run** — 동적 사이클(N에 따른 cycles/sleep) + 7종 알림 + 24h 중복 방지 + Block zone 대기 + offset 진행도 실제 동작 검증
5. **아이고 Firebase → jigumiya 통합** (§8-C) — 아이고 베타 출시 이후 진행 합의. `google-services.json` / `GoogleService-Info.plist` 교체 + `app.config.js` Firebase 설정 갱신 + 기존 아이고 유저 데이터 마이그레이션 계획
6. **아이고 Functions 수정 이식** — 지금이야 `e69d05e` 커밋 내용(HTML `redirectWebUrl` 파싱 + Secret `.trim()` + `request.auth` 검증 + `allUsers:run.invoker`)을 아이고 `functions/src/index.ts`에도 동일 적용
7. **아이고 알림 버그 + 계정 삭제 수정** — 별도 작업 (상세 파악 필요)
8. **가족 계정 구매 테스트** — Play Store / App Store 1.0.5/1.0.6/1.0.8 승급 확인 후 가족 계정(다른 결제수단 + 다른 배송지)으로 Functions 경유 생성된 링크 클릭 → 구매 → 파트너스 대시보드 실적 집계 확인
9. **쿠팡 파트너스 문의 답변 수신** — `bestcategories` 호출 카운팅 방식(1콜 = 1회 vs 100회) 확정 후 cron 호출량 재산정
10. **category-best 브로드캐스트 큐 구현** (별도 PR) — `scripts/category-best-updater/` 갱신 시 10/20% 하락 감지 → `broadcasts/{id}` 큐 기록 → shared-price-checker가 큐 소비
11. **cron 재활성화** (§8-D-2) — 선결: 4번 dry-run 통과 + 5번 아이고 통합 + 10번 broadcasts 큐. 확정 스케줄:
    - shared_products 가격체크: 04:30 ~ 01:00 KST, **동적 sleep**(`meta/stats.sharedProductCount` 기반), 분할 모드(N>50,000) + offset 진행도 보존 + Block zone 대기 (01:00~04:30 자동 sleep)
    - category_best 갱신: 02:00 KST 1회 (sleep 80초)
    - 알림: **즉시 발송 (가격 변동 감지 즉시)** + morning(07:00~09:00 KST 진입 시) / evening(19:30~21:00 KST 그날 가격 알림 미수신자) — 24h 중복 방지 가드
12. **가격변동 탭 실데이터 검증** — cron 재활성화 후 `recordPriceDrop` 기록 + UI 표시 확인
13. **Firebase App Check 검토** — Public repo 환경에서 apiKey 노출 후속 보강. unauthorized client SDK 사용 차단 (App Attest/DeviceCheck for iOS, Play Integrity for Android)

## 수익모델: 쿠팡 파트너스 단일 전략
- 수수료: 3~10% (구매 발생 시 자동 수취)
- ✅ 파트너스 최종 승인 완료 — API Access Key / Secret Key 발급됨
- EAS Secrets에 EXPO_PUBLIC_COUPANG_ACCESS_KEY / SECRET_KEY 등록 완료
- Functions Secrets(Secret Manager)에 COUPANG_ACCESS_KEY / SECRET_KEY 등록 완료 — 실기기 검증 시 말미 `\n` 발견 → 함수 코드에서 `.trim()` 방어 처리 (2026-04-24)
- API 딥링크 정상 작동 확인: 파트너스 deeplink API는 `https://link.coupang.com/a/XXXXX` 형태로 shortenUrl 반환 (입력 공유 URL과 동일 prefix라 slug 비교로만 원본/제휴 구분 가능)
- 코드: services/coupangApi.ts (클라이언트 HMAC — fallback용), functions/src/index.ts (서버 HMAC + HTML `redirectWebUrl` 파싱 + 딥링크)

## 현재 상태: 1.0.8 빌드 완료 (2026-05-01 기준)
- iOS: **1.0.8 buildNumber 42 IPA 산출** (`~/jigumiya/builds/ios/jigumiya-1.0.8-42.ipa`) — Transporter 업로드 + App Store 심사 제출 대기
- Android: **1.0.8 versionCode 42 AAB 산출** (`~/jigumiya/builds/android/jigumiya-1.0.8-42.aab`) — Play Console 업로드 대기
- 1.0.8 주요 변경: 골드박스 API 호출 완전 제거 → **오늘의 특가**(`price_drops` 24h 상위 N + `category_best` fallback 1h AsyncStorage 캐시) + **하트 버튼 누락 fix**(productId 추출 다중 패턴 + URL 후보 다중 시도) + **backfillProductIds 자가 치유**(홈 mount + syncFromFirestore 직후 1회)
- 1.0.7 (bn41/vc41) 미배포 — 1.0.8에 통합되어 사용자에게는 1.0.8로 전달 (1.0.7 변경: BUG-42 무한로딩 방어 + 온보딩 문구 갱신 + 알림 라우팅 분기)
- 1.0.6 (bn40/vc40) 배포 완료 (2026-04-26): iOS App Store 심사 제출 + Android 프로덕션 승급. 019 §8-A 카테고리 베스트(950 상품) + feed 탭 UI 교체 + 가격변동 탭 신설(4탭 구조) + price_drops 컬렉션
- 1.0.5 (bn38/vc38) 배포 완료 (2026-04-24): Firebase Functions Resolver 클라이언트 통합(dual-path), 파트너스 제휴 링크 근본 해결 (018)
- `eas.json` `appVersionSource: local` + `autoIncrement` 제거 → `app.config.js`가 버전 source of truth
- `673c601`: `generateDeepLink` 조건 `/vp/|/vm/` → `coupang.com`로 확장 (Functions fallback 경로 유지 위해 원복 안 함 — Functions 실패 시 client fallback이 link.coupang.com/a/... 직접 시도)
- iOS 이전 출시: 1.0.1 App Store 정식 출시 ✅, 1.0.2 buildNumber 28 심사 제출, 1.0.4 bn37 App Store 미제출
- Android 이전 출시: 1.0.1 versionCode 17 프로덕션, 1.0.4 vc37 Play Store 미출시
- 1.0.4 미배포: Phase 3-D MVP 변경(3탭/자주사는/피드 배너, 뱃지 초기화, 홈/상세 하트 토글, 스와이프 삭제, 10개 제한)은 1.0.5에 통합되어 사용자에게 전달됨
- 카테고리: 쇼핑/유틸리티, 연령등급: 4+
- 개인정보처리방침: https://dafamstore.tistory.com/9
- GitHub 레포: https://github.com/Tegisee/jigumiya (**Public** 전환 완료, 2026-04-30 — GitHub Actions 무제한 무료 혜택)
- 빌드 전 개발 서버(npx expo start)로 테스트 먼저 진행할 것

## 주요 기술 현황
- 서버사이드 가격 체크 (Phase 3 신규, 019 §5-2 + §12): scripts/shared-price-checker/ — shared_products 풀 기반 cron
  - **동적 사이클 고도화 완료 (2026-04-30, b625f07)**: `computeCycleConfig()` — N에 따라 cycles=max(1, min(144, ⌊49,200/N⌋)), sleep=max(1500, ⌊BUDGET_MS/(N×cycles)⌋) 자동 산출
  - **분할 모드** (N>50,000): dailyCount=50,000, cycles=1, `meta/stats.lastCheckedOffset` 기반 슬라이스 + 래핑 지원
  - **Offset 진행도 보존**: processedCount 매 iteration 시작 시 i+1 낙관 증가, rate-limited break 시 i 롤백. 종료 시 `(startOffset + processedCount) % totalCount`로 갱신 → 부분 진행 보존, 다음 run 이어서 처리
  - **Block zone 대기**: `waitIfInBlockedZone()` 매 iteration 직전 KST 체크. 01:00 ≤ now < 04:30 진입 시 04:30 KST까지 sleep (카테고리 갱신 시간대 충돌 방지)
  - createdAt asc, trackerCount=0/당일 추가 스킵, rate-limited 즉시 종료
  - category_best 캐시 hit 시 API 스킵 (019 §4-2), collectionGroup `tracked.productId` 인덱스로 추적자 역방향 검색
  - **알림 7종 시스템 (2026-04-30, ee60516)**: morning_greeting / price_drop_summary / target_reached / price_up_summary / evening_no_change / broadcast_drop10 / broadcast_drop20
    - 각 type 3개 후보 문구 랜덤 선택, `{N}` placeholder
    - 사용자당 합산 (drop/up summary), target 통과 시 drop summary에서 중복 제외
    - morning(07-09 KST) / evening(19:30-21 KST) 시간대 분기, evening은 그날 가격 알림 미수신자만
    - 24h 중복 방지: `users/{uid}.lastNotifications` (morning/evening/priceDrop[pid]/priceUp[pid]/targetReached[pid]/broadcast.tier10|tier20), dotted-path FieldValue update 일괄 반영
    - flush 단계 분리: 스캔 사이클에서 `events.{drops, ups, targets, broadcastTier10, broadcastTier20}` 메모리 누적 → 끝에서 일괄 발송
    - 24h 통과 productId 0개면 push 자체 skip
  - 시작 로그 형식: `[Cycle] N=37 daily=37 cycles=144 sleep=13851ms offset=0~36 split=false`
  - `.github/workflows/shared-price-check.yml`: 현재 workflow_dispatch만 활성, schedule 주석 (§8-D-2 활성화 대기)
  - 활성화 선결: §8-C 아이고 통합 + 파트너스 문의 답변 + workflow_dispatch dry-run 통과 + category-best broadcasts 큐 (별도 PR)
- 서버사이드 가격 체크 (legacy, Phase 3-C에서 폐기 예정): scripts/price-checker/ (파트너스 API 검색 → Firestore 업데이트 → Expo Push)
  - ✅ Puppeteer 삭제 → 파트너스 API searchProducts()로 교체 완료
  - ✅ GitHub Actions 정상 실행 확인 (Access Denied 해결)
  - ✅ 알림 로직 개선: 가격 무변동 시 매 체크마다 no_change 알림 발송 + price_drop 오탐 방지
  - ✅ 만료 토큰 cleanup: 유저 삭제 → expoPushToken 필드만 제거 (상품 데이터 보존)
  - ✅ 재시도 루프 제거 (2026-04-24): `fetchCurrentPrice` keywords 배열 for-loop → 상품당 정확히 1회 검색. 매칭 실패 시 즉시 스킵 (지금이야 `46c20e5`, 아이고 `840f1ea`)
  - 🚨 **현재 cron 비활성 (2026-04-24 야간)**: 재활성화 당일 burst rate 분당 ~110회 확인 → 긴급 차단 (지금이야 `3cd068e`, 아이고 `fb66468`). Phase 3 `shared_products` 완료 후 재활성화 예정
  - 확정 스케줄 (Phase 3 완료 후 적용):
    - shared_products 가격체크: 04:30 ~ 01:00 KST 분당 40회 순차 (rate-limited 시 당일 중단, 019 §5-2)
    - category_best 갱신: 02:00 KST 1회 (sleep 80초)
    - 지금이야 알림: 11:30 / 20:30 KST
    - 아이고 알림: 10:00 / 19:00 KST
  - Secrets 등록 완료: FIREBASE_SERVICE_ACCOUNT_KEY, COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY. Node.js 24
  - 호출 방식: 완전 순차 for-of + 상품당 1초 딜레이 (scripts/price-checker/index.ts L204)
  - 실측 (재시도 제거 후): 지금이야 37개 상품 × 1회 = **37회/실행**, 아이고 2개 × 1회 = **2회/실행** (실측 로그 기반)
  - **쿠팡 파트너스 공식 Rate Limit**: 검색 API **1분/50회**, 리포트 API **1시간/500회**, 모든 API 합산 **1분/100회**, 링크 생성 **1분/50회** (2026-04-24 계정 정지 소명 과정에서 확인)
  - 개선 검토: 1~2회차는 가격 DB 갱신만, 마지막 회차에만 알림 발송 → 알림 피로 감소
- 클라이언트: CoupangScraper (WebView DOM 스크래핑) — 상품 추가 시 + 수동 새로고침
  - ✅ iOS Universal Link 이탈 버그 수정: fetch로 HTML 획득 → WebView에 html 문자열 로드 (네트워크 탐색 없음)
  - ✅ 쿠팡 앱 다운로드/열기 배너 CSS 차단 추가 (아이고에서 이식)
  - ✅ iOS 쿠팡 튕김 개선 (2~3회 → 1회): onShouldStartLoadWithRequest 딥링크 차단 + allowsBackForwardNavigationGestures={false} + resolved URL 직접 전달 + iOS HTML fetch 방식
  - ⚠️ iOS 쿠팡 앱 열기 팝업 1회 잔존: "쿠팡 앱이 열리면 지금이야 앱으로 돌아와서 계속해주세요." 안내문구로 대응 (취소 유도 → 복귀 유도로 1.0.4에서 변경)
  - 타임아웃 20초, 단계적 재시도(2초/4초/6초), 실패 시 "다시 시도" 버튼
- Phase 3-D 탭 구조 (1.0.6 기준 4탭): 홈(추적 10개) / 자주사는(무제한) / **카테고리 베스트** / **가격변동**, 설정은 Stack 화면으로 이동
- 카테고리 베스트 탭(019 §8-A, 1.0.6): `category_best/{categoryId}` 구독 → 카테고리 칩 가로 스크롤 + 상품 리스트, 1~3위 민트 랭크 뱃지, 로켓배송 이모지, 쿠팡 파트너스 의무 고지 푸터
- 가격변동 탭(019, 1.0.6): `price_drops` 컬렉션 구독, 필터 칩(전체/-10%/-20%) + 하락률 뱃지. cron 재활성화 후 실데이터 채워짐
- 자주사는 토글: 홈 카드 우상단 하트(반투명 원형 배경) + 상세화면 CTA 옆 — `useFavoriteToggle` 훅 공용, `shared_products` 보장 + `favoriteCount` 증감
- 상품 삭제: 스와이프 삭제 (왼쪽) + 롱프레스 삭제 오버레이 + 상세페이지 삭제 (홈 카드 + 자주사는 카드 동일 패턴)
- 홈 10개 제한: `MAX_TRACKED_ITEMS = 10` (services/config.ts) — `addItem` 가드 + `modal/add-item.tsx` 선제 가드로 이중 적용
- 뱃지 초기화: `services/notifications.ts` `clearBadgeCount` + `_layout.tsx`에서 앱 실행 + AppState active 전환 시 호출 (iOS 앱 아이콘/Android 알림 센터)
- Firebase Auth: onAuthStateChanged로 AsyncStorage 복원 대기 후 UID 판단 (UID 불일치 해결)
- Firebase Config: Platform.OS별 appId 분기 (iOS/Android), app.config.js로 변환
- 앱 내 딥링크 변환: **Firebase Functions `resolveAndGenerateAffiliateUrl` 우선** → 실패 시 `coupangApi.ts generateDeepLink` fallback
  - Functions (서버): 2세대 callable, asia-northeast3, Node 22, Secrets(COUPANG_ACCESS_KEY/SECRET_KEY), `allUsers:run.invoker` + `request.auth` 이중 보안
  - 핵심 로직: `link.coupang.com/a/...`의 200 HTML 응답에서 `redirectWebUrl='...\x3D...'` JS 변수 hex-escape 디코드 → vp URL 추출 → `/deeplink` API 호출 → shortenUrl 반환
  - 상세: docs/018_FirebaseFunctions_Resolver.md

## 빌드 아티팩트
- 네이밍: `jigumiya-{version}-{versionCode}[-dev].{aab|apk|ipa}`
  - 예: `jigumiya-1.0.1-11.aab` (프로덕션), `jigumiya-1.0.1-10-dev.apk` (개발)
- 저장 위치:
  - Android: `~/jigumiya/builds/android/` (AAB, APK)
  - iOS: `~/jigumiya/builds/ios/` (IPA)
- .gitignore에 포함 — 빌드 파일은 커밋하지 않음

## 버전 관리 정책 (2026-04-19 변경)
- `eas.json` `appVersionSource: "local"` — `app.config.js`가 진실 원천, EAS remote 값 무시
- `production.autoIncrement` 제거 — 실패 빌드가 버전을 먹지 않음 (이전에는 실패해도 증가했던 함정 제거)
- 버전 bump 시 수정 대상:
  1. `app.config.js` — `version`, `ios.buildNumber`, `android.versionCode`
  2. `android/app/build.gradle` — `versionCode`, `versionName` (gitignored, 로컬 동기화만)
- `android/`가 로컬에 존재하면 prebuild 스킵되어 `build.gradle` 값이 최종 사용됨 → 양쪽 동기화 필수
- Play Store / App Store는 단조 증가만 허용 — 다운그레이드 불가

## 로컬 빌드 주의사항 (Android)
- 빌드 전 `app.config.js` `android.versionCode` + `build.gradle` `versionCode`/`versionName` 동기화 확인
- 빌드 파일명은 app.config.js versionCode 기준 (예: `jigumiya-1.0.4-36.aab`)
- google-services.json은 .gitignore에 있으므로 `.easignore` 파일을 git 루트(`~/jigumiya/`)에 생성해야 로컬 빌드 시 포함됨
- 빌드 명령: `eas build --local --profile production --platform android`

## 로컬 빌드 주의사항 (iOS)
- 빌드 전 `app.config.js` `ios.buildNumber` 확인 (autoIncrement OFF 상태라 자동 증가 없음)
- fastlane 필요 — 미설치 시 `brew install fastlane`
- `GoogleService-Info.plist`도 .gitignore에 있으므로 `.easignore`에서 제외해야 빌드 포함됨 (Android와 동일 `.easignore` 사용)
- `ios/` 네이티브 디렉토리가 이미 있으면 prebuild 스킵됨 — 네이티브 설정 변경 시 `ios/` 삭제 후 재빌드
- 빌드 명령: `eas build --local --profile production --platform ios`
- 결과물: app-store 서명된 IPA → Transporter로 App Store Connect 수동 업로드 (`eas submit` 금지 — §017 §12 빌드/배포 정책)

## Firebase 공유 설계 (지금이야 ↔ 아이고)
양쪽 앱이 동일 Firebase 프로젝트(jigumiya)를 공유하는 통합 구조 — 아이고 베타 출시 후 통합 예정. 아래는 확정 운영 설계.

### 확정 cron 스케줄 (KST)
| 시각 | 레포 | 작업 |
|------|------|------|
| 01:00 | 아이고 | event-best-updater (기념일 31개, `minPrice=30000`) |
| 01:15 | 아이고 | baby 1그룹 (장난감 + 의류 16구간) |
| 01:30 | 아이고 | baby 2그룹 (신발 + 도서 + 학습교구 14구간) |
| 02:00 | 지금이야 | category_best (19개, sleep 80초) |
| 03:00 | 아이고 | baby 3그룹 (소모품) |
| 03:20 | 아이고 | baby 4그룹 (나머지) |
| 04:30~01:00 | 지금이야 | shared_products 가격체크 (동적 사이클: cycles/sleep 자동 산출, N>50,000 분할 + offset, Block zone 자동 대기) |
| 즉시 (가격 변동 시) | 지금이야 | 알림 7종 발송 (24h 중복 방지) — morning(07-09 KST) / evening(19:30-21 KST) 시간대 분기 자동 판정 |

### Firebase 공유 컬렉션 구조 (지금이야 + 아이고 양쪽 공유)
- `category_best/{categoryId}` — **지금이야** cron 적재 (19개 카테고리 × 50 = 950 상품)
- `category_best_baby/{slug}` — **아이고** cron 적재 (월령별 baby 카테고리)
- `event_best/{eventSlug}` — **아이고** cron 적재 (기념일 31개, `minPrice=30000`)
- `shared_products/{productId}` — **양쪽** cron (양 앱에서 추가 + 지금이야 04:30~01:00 가격체크가 갱신)
- `price_drops/{dropId}` — **지금이야** cron (price-check 시 하락 감지 → 자동 기록)

### 호출 방식 (공통 정책)
- `limit=10`, 호출당 sleep **2초**, 분당 최대 **30회** (공식 한도 50회 대비 보수 운영)
- rate-limited 응답 수신 즉시 중단 (재시도 없음)
- `event_best` 전용 옵션: `minPrice=30000`

## 형제 앱
- 지금이야와 아이고(~/aigo/aigo)는 형제 앱 관계
- 동일 개발자, 동일 기술 스택 (React Native, Expo, Firebase)
- 한 앱에서 해결한 문제/노하우는 다른 앱에 이식 가능
- 로컬 빌드 세팅, Firebase 구조, 파트너스 API 등 공유
- **cron 현재 비활성 (2026-04-24 야간)**: 재시도 루프 제거(지금이야 `46c20e5`, 아이고 `840f1ea`) 후 Phase 3 `shared_products` 설계 반영해 재활성화 예정. 이전 시간대 분리 스케줄(지금이야 08/12/20 ↔ 아이고 07/09/11/13/16/19)은 폐기 — 향후 공유상품 갱신은 **jigumiya 레포 단일 cron**(shared_products 가격체크 04:30~01:00 KST 동적 사이클(cycles/sleep 자동), 01:00~04:30 Block zone 자동 대기 + category_best 02:00 KST), 알림은 **즉시 발송 7종** (가격 변동 감지 즉시 + morning/evening 시간대 분기, 24h 중복 방지 — 2026-04-30 확정)
- **공통 이슈**: 파트너스 실적 미집계(쿠팡 공유 링크 구조) — 아이고도 AQ-4로 동일 확인 → Firebase Functions Resolver(018) 해결책을 아이고도 동일 방식으로 적용 예정
- **오늘 작업 이식 대기 (2026-04-24)**: 지금이야 Functions 3대 버그 수정(`e69d05e`)을 아이고에도 반영 — HTML `redirectWebUrl` 파싱, Secret `.trim()`, `request.auth` 검증, `allUsers:run.invoker`
- **Firebase 프로젝트 통합 검토**: jigumiya 프로젝트 기반으로 아이고 통합 — **아이고 베타 출시 이후 진행 합의** (2026-04-20)
- **아이고 전용 설계**: `baby_category` 월령별 구조는 아이고 측에서 별도 설계 (지금이야 범위 외)
- 장기: 파트너스 계정 2개로 키 분리 검토 (현 시점엔 불필요)

## 앱 기본 정보
- 앱 이름: 지금이야 (Jigumiya)
- 번들 ID: com.jigumiya.app
- 프로젝트 경로: ~/jigumiya/jigumiya
- Expo 계정: june56189906
- GitHub: Tegisee/jigumiya
- 터미널 단축명령: ji (→ Max Plan으로 자동 접속)

