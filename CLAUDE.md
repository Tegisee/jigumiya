# 지금이야 (Jigumiya) - 메인 컨텍스트

## 중요: 새 대화창 시작 방법
docs/000_MD_사용법.md 와 이 파일을 먼저 읽을 것.
작업할 항목의 sub MD도 함께 읽고 시작할 것.
2026-04-30 이전 작업 이력은 docs/작업이력_archive.md 참조.

## 가장 최근 (2026-05-06): 쿠팡 PL cron + token dedup + 갤럭시S21+ 알림 0건 진단

**1) 쿠팡 PL cron 신설** (커밋 `b4a4e16`, 검증 완료):
- 위치: `scripts/coupangpl-updater/`, 워크플로 `.github/workflows/coupangpl-update.yml`
- 엔드포인트 `/v2/.../products/coupangPL?limit=100` (v1 prefix 없음, goldbox와 동일 패턴)
- 골드박스와 동시 실행 (07:30 KST, `30 22 * * *`), 1콜/일
- productUrl 이미 affiliate → deeplink 변환 없음
- Firestore `coupang_pl/{YYYY-MM-DD KST}` 저장: `{ productId, productName, productPrice, productImage, deepLink, isRocket, isFreeShipping }`
- 첫 수동 실행: 87개 저장 완료 (`coupang_pl/2026-05-06`)

**2) fetchActiveUsers token dedup fix** (수정 완료, 미커밋):
- 사고: 5/6 morning_greeting 4건 발송 — 동일 expoPushToken 공유 jigumiya uid 4개 (아이폰 1대 → 4 push)
- 원인: `fetchActiveUsers`가 uid별 1엔트리, token 중복 dedup 없음 → 4개 uid 모두 payload 생성 → Expo가 같은 token으로 4번 발송
- fix: `scripts/shared-price-checker/index.ts:474-516` `seenTokens: Map<token, firstUid>` 추가, 첫 등장 uid만 보존, dup uid 스킵 + 로그 (`[ActiveUsers] dup-token uid=… kept-first=…`). 모든 payload 빌드(morning/evening/drops/ups/targets) 자동 dedup
- 알려진 trade-off: orphan uid에만 등록된 trackers는 알림 미수령 — 별도 cleanup 후속

**3) 갤럭시S21+ 알림 0건 진단** (1회성 인스펙션):
- 갤럭시 본체 doc 강력 후보: `QBsAA6mAJshIHjWi55qPhMRrtAo2` — Auth는 4/30 13:20 GMT 가입, **users/{uid} doc 자체 없음**, tracked 6개 보유 (productIds 정확 매칭 가능)
- 근본 버그: `users/{uid}` doc 생성은 `services/firebase.ts:131 savePushToken` 단 1곳에서만 일어남 → 알림 권한 거부/`getExpoPushTokenAsync` 실패 시 user doc 절대 안 만들어짐 → fetchActiveUsers에서 unknown으로 분류 → 발송 제외. 그러나 tracked subcollection은 부모 doc 부재해도 작성 가능 → orphan 패턴 발생
- 동일 패턴 추정: unknown 110개 다수 (특히 5/2~5/5 토큰 없는 신규 가입자)
- 1회 응급 처리: `QBsAA6mAJ…` user doc 수동 생성 (`{ app:'jigumiya', notificationEnabled:true, expoPushToken:null, createdAt:serverTimestamp() }`). expoPushToken 채우려면 앱 재실행 → `savePushToken` 호출되어 merge 필요

## 직전 (2026-05-05 후반): A~E 알림 시스템 재설계 + 신규 cron 2종

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

## 다음 작업 순서 (2026-05-06 이후)

**최우선** (검증 + 신규):
1. **🚨 검증** shared-price-check cron 3차 재활성화 후 첫 자동 실행:
   - `[CategoryCycle] 합계 api=N pointer 갱신 완료` (drops/ups 카운트 사라짐, fetch + 문서 갱신만)
   - `[Skip-DropRateGuard] {pid} dropRate=...% — 알림 스킵` 발생 확인 (60% 가드 동작)
   - 추적 상품에 가짜 변동 알림 0건
   - 요일별 morning/evening 문구 매칭 (07:30/20:00 cron, KST 요일과 일치)
2. **🚨 검증** 골드박스 cron (07:30 KST) — `goldbox/{YYYY-MM-DD}` 생성 + productUrl affiliate prefix 확인 (raw면 deeplink 추가)
3. **🚨 검증** 이벤트 cron (02:35 KST) — D-7 윈도우 graceful exit / parentsday(05-08) 진입 시 갱신
4. **🚨 검증** 쿠팡 PL cron (07:30 KST, 5/6 신설) — `coupang_pl/{YYYY-MM-DD}` 생성 + 100개 + productUrl affiliate 확인
5. **빌드** 1.0.12 — 다음 항목 통합:
   - `ensureUserDoc()` 추가 — `signInAnonymously()` 직후 user doc 무조건 생성 (권한/토큰 무관, `app:'jigumiya'` + `createdAt` 박힘). 갤럭시 알림 0건 사고 근본 fix
   - `registerForPushNotifications` 실패 시 재시도 로직 (네트워크/일시 실패 흡수)
   - iOS 쿠팡 복귀 시 무한로딩 fix — `feed.tsx` AppState 핸들러 + fetch timeout + price-drops 재구독
   - feed.tsx `generateDeepLink` 불필요 호출 제거 (이미 deepLink 보유 시 재변환 X)
   - vendorItemId 저장 보강 (고정값 누락 케이스)
   - 홈화면 UI 수정
   - 가격그래프 Y축 버그 fix
6. **확인** `category_best/{categoryId}.products[0].productUrl` prefix raw vs affiliate (Firebase Console 직접)
7. **승급 대기** 1.0.11 iOS 심사 통과 → App Store 출시 / Android 내부 테스트 → 프로덕션 승급
8. **갱신** 1.0.10 양 스토어 승급 후 `meta/config_jigumiya.minRequiredVersion = "1.0.10"` → 1.0.11 승급 후 "1.0.11"

**뒤로 미뤄둔**: 그래프 Y축 버그 / 공지사항 팝업 + 전체 푸시 / cron schedule 최적화 §8-D-2 / shared-price-check dry-run 모드

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

### 2026-05-06 이후 미완
- [ ] **🚨 검증** shared-price-check cron 3차 재활성화 후 첫 자동 실행 (A~E 검증)
- [ ] **🚨 검증** 골드박스 cron (07:30 KST) 첫 실행 — 문서 생성 + productUrl affiliate
- [ ] **🚨 검증** 이벤트 cron (02:35 KST) 첫 실행 — D-7 윈도우 동작
- [ ] **검증** 쿠팡 PL cron 자동 실행 (07:30 KST 정기) — workflow_dispatch 외 schedule 트리거
- [ ] **검증** 다음 cron 사이클에 `[ActiveUsers] token-dedup N건 제외` 로그 표시 + 갤럭시/아이폰 사용자가 morning push 1건씩 수령
- [ ] **빌드** 1.0.12 — `ensureUserDoc` + 토큰 재시도 + iOS 쿠팡 복귀 fix + feed.tsx generateDeepLink 정리 + vendorItemId 고정 + 홈화면 UI + 가격그래프 버그 (위 5번 항목)
- [ ] **확인** category_best.products[0].productUrl raw vs affiliate (Firebase Console)
- [ ] **검증** 요일별 morning/evening 문구 매칭 (07:30/20:00 cron)
- [ ] **승급 대기** 1.0.11 iOS 심사 / Android 내부 테스트 → 프로덕션
- [ ] **검증** 1.0.11 실기기 — drop 상품별 N건 + 단일 형식 메시지 + KST 날짜 가드
- [ ] **갱신** `meta/config_jigumiya.minRequiredVersion` 1.0.10 → 1.0.11 (양 스토어 승급 후)
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

## 현재 상태: A~E 알림 시스템 재설계 완료 + 신규 cron 2종 + 재활성화 (2026-05-05 후반 기준)
- **알림 시스템 재설계 완료** (커밋 `48c1fed` + `fb324d9`):
  - A: 카테고리 베스트 알림 완전 제거 — shared_products 단일 출처
  - B: dropRate 60% 가드 + flush 직전 events.drops/ups dedup
  - C: morning/evening 요일별 단일 문구 (KST DOW)
  - D: 골드박스 cron 신설 — 07:30 KST, `goldbox/{YYYY-MM-DD}` 1콜/일
  - E: 이벤트 cron 신설 — 02:35 KST, 11개 이벤트, D-7 윈도우, search limit 10
- **shared-price-check cron 3차 재활성화** — A~E로 모든 가짜 변동 메커니즘 차단
- **새벽 cron 타임라인 (KST)**:
  - 01:00 event-best (아이고) / 01:15 baby1 / 01:30 baby2 / **02:00 category-best** / **02:35 event-best-jigumiya** / 03:00 baby3 / 03:20 baby4 / 04:30 shared-price Block zone 종료 / **07:30 goldbox**
- **1.0.11 (bn46/vc46) 양 스토어 업로드 (5/5)**: iOS 심사 요청 완료 / Android 내부 테스트 트랙 업로드 완료
  - 빌드 산출물: `~/jigumiya/builds/ios/jigumiya-1.0.11-46.ipa` (16.1 MB) / `~/jigumiya/builds/android/jigumiya-1.0.11-46.aab` (58.7 MB)
- Functions `resolveAndGenerateAffiliateUrl` `minInstances: 1` 배포 완료 (Cloud Run minScale=1, 콜드 스타트 제거, 월 ~$5~10)
- **1.0.10 (bn45/vc45)** Play Store 프로덕션 검토 중 / App Store 심사 대기 중 (상태 유지) — 양 스토어 승급 시 1.0.11 후속 적용
- **GitHub 레포**: https://github.com/Tegisee/jigumiya (Public, Actions 무제한 무료)
- **`meta/config_jigumiya.minRequiredVersion = "1.0.8"`** (2026-05-02 갱신) — 1.0.10 양 스토어 승급 후 "1.0.10" → 1.0.11 승급 후 "1.0.11"

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
