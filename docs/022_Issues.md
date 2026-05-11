# 022 — 미해결 이슈 트래커

해결되지 않은 이슈와 잠재적 위험 요소만 모아두는 단일 파일. 해결되면 changelog로 이동시키고 여기서 삭제한다.

---

> Issue 1 / Issue 2-A / Issue 2-C는 모두 해결되어 `changelog.md`로 이동. 1.0.16 RealPrice 아키텍처(`docs/023`) 전체 구현 완료로 그래프/알림 출처 불일치 자체가 해소됨.

---

## Issue NEW-A — Android Push Token null 저장 케이스 (1.0.16 빌드 후 검증)

**상태**: 신규 진단 (2026-05-11), 1.0.16 출시 후 실기기 검증 예정.

**증상**: CF `onSharedProductRealPriceChange` 트리거 첫 발화 로그(`9309948201` 도달 후보 1명) 결과 `skip.noToken=1` — 추적자 user의 `expoPushToken` 필드가 미보유. 시뮬레이터/웹/권한 거부/Android FCM 발급 실패 케이스 중 하나.

**기존 흐름 (`services/notifications.ts:18 + firebase.ts:199`)**:
- `registerForPushNotifications`가 권한 거부 / `getExpoPushTokenAsync` 예외 / EAS projectId 미존재 시 null 반환 + `savePushToken` 미호출 → user doc의 `expoPushToken` 필드 자체 미설정 (undefined)
- `ensureUserDoc` (5/6 갤럭시 fix)는 user doc은 보장하지만 token은 안 박음 → CF/cron이 `!token` 분기에서 skip (의도된 동작)

**Android 토큰 발급 실패 후보** (notifications.ts catch:52에서 흡수):
- `google-services.json` 누락/mismatch (`.easignore` 처리 필수)
- Firebase Cloud Messaging V1 API 미활성화 (Legacy 폐지 흐름)
- Google Play Services 미설치/구버전
- Android 13+ `POST_NOTIFICATIONS` 런타임 권한 거부
- Expo Push 서버 일시 5xx (재시도 로직 없음 — 단발 실패 시 영구 미저장)

**iOS는 추가로**: 시뮬레이터(토큰 발급 불가), APNs cert/p8 미등록, provisional 거부.

**검증 계획 (1.0.16 출시 후)**:
- [ ] CF 트리거 발화 로그에서 `skip.noToken` 비율 모니터링
- [ ] 실기기(Android 14, iPad)에서 첫 실행 시 `expoPushToken` 박힘 확인
- [ ] 발급 실패 시 `[Notifications] 토큰 등록 실패` 로그 + AppState active 재시도 추가 검토

**개선 후보 (필요 시)**:
- `registerForPushNotifications` 분기별 console.warn 보강 (어느 분기에서 null 반환인지 식별)
- `getExpoPushTokenAsync` 실패 시 1회 재시도 + AppState active 시 재발급 시도

---

## Issue 3 — 데이터/캐시 삭제 후 첫 상품 추가 실패 (1.0.16 빌드 후 재검증)

**상태**: 5/7~5/8 보고. 1.0.16에서 iOS 무한로딩 fix(HTML fetch 폐기 + vp URL 직접 로드 + SCRAPE_JS 내부 폴링 + link.coupang.com 차단) 적용으로 자연 해소 가능성 큼 — 출시 후 재검증.

**증상**: AsyncStorage 초기화 + 신규 anon 로그인 직후 첫 add-item 호출에서 무한로딩/실패 발생 추정.

**의심**: `ensureUserDoc` / Auth 워밍업 race condition + Universal Link 흡수 가능성.

**수정 방향**: 1.0.16 환경에서 재현 여부 검증 → 재현 시 추가 fix (auth wait 시간 조정 등).

---

## Issue 4 — 1.0.16 출시 후 검증 대기

- [ ] **검증** RealPrice 트리거(`onSharedProductRealPriceChange`) — 실기기에서 updateItemPrice → CF 발화 → push 도달 → `lastNotifications.targetReached.{pid}` 가드 박힘 + needsCheck 클리어
- [ ] **검증** cron 변경 — `skipRecentRealPrice=N` 카운트 / `[needsCheck]` 마크 / `payloads` target_reached 0건 / lastRealPriceUpdatedAt 1h 가드 효과
- [ ] **검증** 관리자 모드 — isAdmin 시만 노출 / Platform.OS 홀수/짝수 분배 / 이어서 진행 / wallclock 카운트다운 백그라운드 정확성 / AsyncStorage 복원
- [ ] **검증** iOS 상품 추가 — 단축 URL/직접 URL/vp URL 4가지 케이스 무한로딩 해소
- [ ] **검증** 가격 그래프 — 신규 사용자가 추가 시점 즉시 shared 과거 이력 머지 (1A) / 백그라운드 복귀 시 realPrice 우선 머지 (3)
- [ ] **검증** Android Push Token null 케이스 (Issue NEW-A 참조)
- [ ] **모니터링** Functions 응답시간 로그 (`minInstances:1` 후 콜드 스파이크 사라짐 확인, 최소 20회 표본)
- [ ] **확인** category_best.products[0].productUrl raw vs affiliate (Firebase Console)

---

## Issue 5 — 다음 빌드 (1.0.17) 정리

- [ ] **feat** 앱 공유 시 iOS/Android 구분 없이 앱스토어 + 구글플레이 링크 모두 발송
- [ ] **chore** expo-image 마이그레이션 잔여 사용처 점검
- [ ] **chore** Android proguard 설정
- [ ] **cleanup** cron `events.targets.push` / flush target 분기 정식 삭제 (베타 검증 후)
- [ ] **feat** 크라우드소싱 — 사용자 앱 오픈 시 타인 상품 3~5개 추가 realPrice 업데이트
- [ ] **feat** 관리자 모드 — 3대+ 확장 시 deviceId hash 기반 modulo 분배

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
