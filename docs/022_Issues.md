# 022 — 미해결 이슈 트래커

해결되지 않은 이슈와 잠재적 위험 요소만 모아두는 단일 파일. 해결되면 changelog로 이동시키고 여기서 삭제한다.

---

## Issue 1 — 가격추적 그래프 자동 업데이트 안 됨 (앱 측, 1.0.16 빌드 필요)

**상태**: 진단 완료, 수정 대기 (2026-05-10 진단)

**증상**: cron이 매 사이클 정상 동작(`shared_products` priceHistory 누적 중)인데 앱에서 백그라운드 → 포그라운드 전환 시 그래프 변화 없음.

**호출 흐름**:
- `app/(tabs)/index.tsx:46-51` AppState `active` 전환 → `syncFromFirestore()`
- `services/firebase.ts:270 fetchItemsFromFirestore` → **`users/{uid}/items` 컬렉션만 read**
- cron `scripts/shared-price-checker/index.ts:764-770`은 `shared_products/{productId}.priceHistory` 만 update
- 앱이 cron 결과를 영원히 못 봄 (컬렉션 출처 불일치)

**5/7 Fix B와의 관계**: 5/7 Fix B (syncFromFirestore 머지 정책)는 "앱 로컬 누적 priceHistory 보존"용이라 이번 이슈와 별개. 신선한 데이터 출처 자체가 끊겨있는 상태.

**수정 방향**:
- `syncFromFirestore`가 tracked 항목별로 `shared_products/{productId}` read 후 머지
- `services/firebase.ts`에 `fetchSharedProductByIds(productIds: string[])` 신설
- 머지 정책: `shared.priceHistory.length > merged.priceHistory.length`면 shared 채택 (5/7 Fix B와 같은 우선순위 정책)
- 비용 ~10 read/foreground 전환

---

## Issue 2 — 가격변동 알림 0건 (cron 측, 서버만 수정)

**증상 (진단)**: cron 로그 분석 (5/8 14:17 ~ 5/9 15:08, 약 25 사이클): 거의 전부 `[Flush] payloads 0건`. PriceDrop은 정상 기록(예: 5/9 15:08 — `8522615082` -15.3%, `8850725306` -4.5%, trackers=1 each).

**결론**: 수신 문제 아님 — 발송 자체가 0건 (Expo push API 호출 X).

### Issue 2-A — token 공유 시 알림 영구 미발송 ✅ 수정 완료 (2026-05-10, commit `a5dfc5d`)

**근본 원인**: 5/7 swap 정책은 "신 uid에만 tracked 있으면 1회 swap" → 동일 토큰 공유 uid가 3+개 + 2+개가 tracked 보유 시 2번째 이후는 여전히 dup-skip.

**실측 (5/9 15:08)**: `nVZEN00Uj`(swap-in, has tracked) → `qw3R…UCh2`(also has tracked, 익스트림 액티브 에너지젤 `8611087425` 추적자) 가 dup-skip → `jigumiyaUsers.get('qw3R')`=undefined → flush L911-931에서 payload 미빌드. drop 잡혀서 `events.drops`에 들어가도 trackers의 uid가 dup-skip되면 영원히 push 안 됨.

**수정 (commit `a5dfc5d`)**: `fetchActiveUsers` 정책 전면 개편.
- 후보 = jigumiya + token + notif on + **tracked 보유 uid**만 (tracked 미보유 자동 제외)
- 같은 token 공유 시 winner = `lastNotifications` 최댓값 timestamp desc → tiebreak `createdAt` desc → 1개만 선택
- 패자 uid 완전 제외 → push가 winner의 trackers 기반으로만 발송 → 알림 탭 시 winner의 items에서 정상 조회 (UX 버그 차단)
- token당 push 1건 자연 보장 (5/6 morning_greeting 4건 사고 재발 방지)
- 신규 헬퍼 `maxLastNotifTime(ln)` 추가
- 로그: `[ActiveUsers] shared-token winner=… (lastNotif=… createdAt=…) dropped=[…]`

**검증 대기**: 다음 cron 사이클에 shared-token winner 로그 표시 + 익스트림 액티브 에너지젤(`8611087425`) 추적자 알림 정상 수신 확인.

### Issue 2-C — unknown 40명 미분류 (긴급, 수정 대기)

**근본 원인**: `[ActiveUsers] jigumiya=17 | unknown=40 | trackedUids=10` — `app === 'jigumiya'` strict 필터(L508)가 `app` 필드 없는 user doc 40개를 통째 제외. 1.0.11+ 의 `ensureUserDoc`이 박지만, 이 기간 앱 미실행자(40명)는 영원히 unknown. 이들 중 tracked 보유자가 있다면 그 사용자의 drop은 영원히 알림 안 옴.

**수정 방향**: `users` 컬렉션 `app` 누락 + token + tracked 보유 doc 골라 `app:'jigumiya'` 박기 (1회성 스크립트, `scripts/cleanup/users-app-backfill-jigumiya-20260510.mjs`).

---

## Issue 3 — 데이터/캐시 삭제 후 첫 상품 추가 실패 (재현 확인 필요)

**상태**: 5/7~5/8 보고, 1.0.15 출시 후 재현 여부 검증 필요

**증상**: AsyncStorage 초기화 + 신규 anon 로그인 직후 첫 add-item 호출에서 무한로딩/실패 발생 추정.

**의심**: `ensureUserDoc` / Auth 워밍업 race condition.

**수정 방향**: 1.0.15 (Functions timeout 8s 복원 + Auth 1.5s 대기) 환경에서 재현 여부 검증 → 재현 시 추가 fix.

---

## Issue 4 — 검증 대기 (1.0.15 출시 후)

- [ ] **검증** Fix A/B/C 효과 — 백그라운드 복귀 시 그래프 데이터 보존 / 홈 카드 trend 뱃지 노출 (priceHistory 2개 이상)
- [ ] **검증** token-dedup swap 동작 — 다음 cron 사이클에 `[ActiveUsers] swap-token uid=qw3R… replaces FMwP… (no tracked)` 로그 표시 + 익스트림 액티브 에너지젤(`8611087425`) 추적자 알림 정상 수신
- [ ] **검증** 가격 그래프 — priceHistory 5개 이상 상품에서 SparklineChart 정상 노출, 5개 미만은 스킵
- [ ] **검증** 골드박스 cron (07:30 KST) 첫 자동 실행 — `goldbox/{YYYY-MM-DD}` 생성 + productUrl affiliate prefix
- [ ] **검증** shared-price-check cron 3차 재활성화 후 첫 자동 실행 (A~E 검증)
- [ ] **검증** 이벤트 cron (02:35 KST) 첫 실행 — D-7 윈도우 동작
- [ ] **검증** 쿠팡 PL cron 자동 실행 (07:30 KST 정기) — workflow_dispatch 외 schedule 트리거 + categoryName 응답 포함 여부
- [ ] **검증** vendorItemId 매칭 로그 (`[API] vendorItemId=... 정확 매칭 → ...원 (옵션 고정)`)
- [ ] **확인** category_best.products[0].productUrl raw vs affiliate (Firebase Console)
- [ ] **모니터링** Functions 응답시간 로그 (`minInstances:1` 후 콜드 스파이크 사라짐 확인, 최소 20회 표본)

---

## Issue 5 — 다음 빌드 (1.0.16) 정리

- [ ] **fix** Issue 1 (위 참조)
- [ ] **fix** Issue 3 재현 시
- [ ] **feat** 앱 공유 시 iOS/Android 구분 없이 앱스토어 + 구글플레이 링크 모두 발송
- [ ] **chore** expo-image 마이그레이션 잔여 사용처 (1.0.14에서 8개 메인 사용처 처리 — 누락된 곳 점검)
- [ ] **chore** Android proguard 설정 — 빌드 크기 축소 + 코드 보호

---

## Issue 6 — 아이고 이식 작업 (별도 레포 `~/aigo/aigo`)

- [ ] **port** 지금이야 1.0.12~1.0.15 변경 일괄 이식 — 상세 항목은 `~/aigo/aigo/docs/021_Jigumiya_Migration.md` 참조 (5/8 신설)

---

## Issue 7 — 누적 미완 (이전부터)

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

---

## 운영 정책

- 이슈가 해결되면 이 파일에서 삭제하고 `docs/changelog.md` 상단에 해결 내용을 기록
- 새로 발견된 이슈는 이 파일에 추가 (CLAUDE.md에 직접 쓰지 않음)
- CLAUDE.md는 미해결 이슈를 1줄 요약 + 이 문서 링크로만 표시
