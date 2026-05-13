# 022 — 미해결 이슈 트래커

해결되지 않은 이슈와 잠재적 위험 요소만 모아두는 단일 파일. 해결되면 changelog로 이동시키고 여기서 삭제한다.

---

> Issue 1 / Issue 2-A / Issue 2-C는 모두 해결되어 `changelog.md`로 이동. 1.0.16 RealPrice 아키텍처(`docs/023`) 전체 구현 완료로 그래프/알림 출처 불일치 자체가 해소됨.

---

> Issue NEW-A (Android Push Token null)은 1.0.16 google-services Gradle plugin 적용으로 해결되어 changelog(2026-05-12)로 이동.

---

## Issue 3 — 상품 추가 / 가격 조회 실패 (Akamai Bot Manager 챌린지)

**상태 (2026-05-14 갱신)**: **Android는 1.0.17에서 해소 확인** (상품 추가 / 관리자 순회 43개 / 알림 모두 정상). **iOS는 1.0.17에서 incognito race로 실패 → 1.0.18 incognito=false 분기로 fix 완료, 빌드 후 검증 대기.**

**증상 (이력)**:
- 1.0.16: 상품 URL 추가 또는 관리자 모드 가격 조회 시 CoupangScraper 무한로딩 또는 onError. Akamai 챌린지 페이지가 1차 응답
- 1.0.17 Android: 정상화 ✅
- 1.0.17 iOS: 상품 추가 + 상세 새로고침 + 관리자 순회 전체 실패 (5/14 베타) ❌

**근본 원인 (3중 트리거 + iOS race)**:
- (a) IP 봇 분류 — 단시간 다수 호출 / 동시 실행으로 IP reputation 하락
- (b) 쿠팡 로그인 세션 — Akamai BM이 인증 세션을 더 엄격하게 검사 (5/13 갤럭시 베타로 확인)
- (c) 기기 핑거프린트 — UA + canvas + WebGL 단위 차단 (아이패드 5/13 의심)
- (d) **iOS WKWebView nonPersistentDataStore race** — `incognito={true}` 시 Akamai sec_cpt Set-Cookie 응답을 받아도 디스크 영속화 안 되어 같은 인스턴스 reload 사이에 cookie 헤더 누락 가능성. 매 WebView 인스턴스(자동 재시도 포함)마다 새 챌린지 → timeout 누적 → 100% 실패

**1.0.17 fix (Android 검증 완료, iOS는 실패)**:
- `components/CoupangScraper.tsx` SCRAPE_JS: `detectChallenge()` + 30s 재인젝션 + 60s timeout — Android는 챌린지 통과 잘 됨
- UA 풀(iOS/Android 각 4개) + sharedCookies=false + incognito=true + cacheEnabled=false — 양 플랫폼
- admin 3~8s 지터 + 20개 5분 휴식 — 양 플랫폼
- productId fallback URL (`getCoupangProductUrl`) — 양 플랫폼

**1.0.18 fix (iOS race 해소, 빌드 대기 — 2026-05-14)**:
- `components/CoupangScraper.tsx`: `incognito={Platform.OS === 'android'}` — iOS만 false로 변경
- iOS는 `incognito=false` + `cacheEnabled=false` + `sharedCookies=false` 조합 → `WKWebsiteDataStore.defaultDataStore` 사용 (앱 프로세스 공유 persistent)
- 효과: 챌린지 1회 통과 후 cookie 영속 → 다음 호출 / 자동 재시도 / 다음 상품 추가 시 cookie 재사용 → 매번 새 챌린지 부담 제거
- 1.0.17 목표(쿠팡 로그인 세션 격리)는 `sharedCookiesEnabled=false`가 그대로 처리 — NSHTTPCookieStorage 동기화 차단은 incognito와 무관

**운영 대응 (1.0.18 빌드 전)**:
- 두 기기 동시 실행 시 네트워크 분리 (Wi-Fi + LTE)
- iOS는 1.0.16 ipa 유지 권장 (1.0.17 iOS는 실패)

**1.0.18 빌드 후 모니터링**:
- iOS: 상품 추가 / 상세 새로고침 / 관리자 순회 정상화 확인 (incognito=false 효과)
- iOS CHALLENGE 60s timeout 0건 목표 — 1회 통과 후 영속 재사용 가정
- Android: 회귀 없는지 확인 (incognito=true 유지이므로 정상 예상)
- 양 플랫폼 챌린지 발생 빈도 / UA 분포 / 관리자 완주율

---

## Issue 4 — 1.0.16 검증 잔여 항목

- [x] ~~**검증** 관리자 모드 분배~~ — 2026-05-12 실기기 "담당 ~42 / 전체 84" 정상 확인 (orderBy documentId fix + createdAt 백필 효과). changelog 이동.
- [x] ~~**검증** 가격 그래프 (1A/3 머지)~~ — 2026-05-12 신규/기존 사용자 모두 정상 표시 확인. changelog 이동.
- [x] ~~**검증** Android Push Token null 케이스~~ — 2026-05-12 google-services plugin 적용 후 정상 발급 확인. changelog 이동 (Issue NEW-A 종결).
- [x] ~~**검증** iOS 상품 추가 무한로딩 해소~~ — 1.0.16 4가지 케이스 정상.
- [ ] **검증** RealPrice 트리거(`onSharedProductRealPriceChange`) — token 보유 사용자가 target 도달 시 실제 push 수신 + `lastNotifications.targetReached.{pid}` 가드 박힘 + needsCheck 클리어 (token=YES 케이스 표본)
- [ ] **검증** cron 변경 — `skipRecentRealPrice=N` 카운트 / `[needsCheck]` 마크 / `payloads` target_reached 0건 / lastRealPriceUpdatedAt 1h 가드 효과 (로그 표본 5회 이상)
- [ ] **모니터링** Functions 응답시간 (`minInstances:1` 콜드 스파이크 사라짐, 표본 20회)
- [ ] **확인** category_best.products[0].productUrl raw vs affiliate (Firebase Console)

---

## Issue 5 — 다음 빌드 (1.0.17) 정리

> 2026-05-13~14 5단계 작업으로 다음 항목 모두 완료 — changelog로 이동:
> Akamai 완화 4종(쿠키 자동 초기화 / 지터 3~8s / 20개 휴식 5분 / UA 로테이션) /
> 자동 새로고침 2종(TTL 6h + viewport + 콜드 스타트 sync) /
> 앱 공유 양쪽 링크 / 아이고 productId fallback URL /
> cron 알림 realPrice baseline 전환 / 앱구조 개편(추적중 탭 + 홈 개편 + 한도 20)

### 잔여 — 빌드 검증 후 또는 별도 PR

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

## Issue 8 — shared_products 컬렉션에 아이고 상품 혼재

**상태**: 신규 발견 (2026-05-12). 아이고 이식 작업(Issue 6) 시 별도 처리.

**증상**: `shared_products` 컬렉션에 아이고 앱 사용자가 추가한 상품 10개 혼재. cron 가격 체크는 무차별 진행되지만 알림 발송은 `users.app === 'jigumiya'` 필터로 분리되어 잘못 알림은 안 가는 상태.

**위험**:
- 관리자 모드 순회 대상에 아이고 상품도 포함 → 불필요한 쿠팡 API/WebView 호출 + 분배 인덱스 변동
- 1.0.16 관리자 모드 "전체 84개"에 아이고 상품 ~10개 포함된 수치
- 향후 아이고 이식 시 명시적 분리 필요

**해결 방향 (Issue 6 아이고 이식 트랙)**:
- `shared_products` 문서에 `app: 'jigumiya' | 'aigo'` 또는 `apps: string[]` 필드 추가
- `fetchAllSharedProducts` (관리자 모드) + cron 모두 app 필터 적용
- 또는 컬렉션 분리 (`shared_products_jigumiya` / `shared_products_aigo`)

---

## 운영 주의사항

### iOS 1.0.17 — 상품 추가 / 새로고침 / 관리자 순회 전체 실패 (2026-05-14 추가)

**증상**: iOS 1.0.17 (bn53/vc53) 베타에서 상품 추가 + 상세 새로고침 + 관리자 순회 모두 실패.

**원인**: `incognito={true}` + WKWebView `nonPersistentDataStore` 조합에서 Akamai sec_cpt Set-Cookie 응답이 디스크에 영속화되지 않음. 같은 인스턴스 reload 사이에 cookie 헤더 누락 가능성(WKWebView 알려진 race) + 매 WebView 인스턴스마다 새 dataStore라 자동 재시도 시 매번 새 챌린지 → timeout 누적 → 100% 실패.

**fix (1.0.18)**: `CoupangScraper.tsx` `incognito={Platform.OS === 'android'}` — iOS만 false. `defaultDataStore` 사용으로 챌린지 1회 통과 후 영속 재사용. `sharedCookiesEnabled=false`로 NSHTTPCookieStorage 격리는 그대로(쿠팡 앱 로그인 세션 차단).

**운영 가이드 (1.0.18 빌드 전)**:
- iOS는 1.0.16 ipa로 유지 권장
- Android 1.0.17은 정상 작동 — 베타 계속

### 관리자 모드 — 쿠팡 로그아웃 (1.0.17 Android 이상 자동화)

**과거 (1.0.16 이하)**: 쿠팡 로그인 상태에서 관리자 순회 시 Akamai BM 차단 임계 ↓. 갤럭시 5/13 베타에서 로그인 = 실패 / 로그아웃 = 성공 확인.

**1.0.17 이상**: `sharedCookiesEnabled=false`로 NSHTTPCookieStorage 동기화 차단 → 쿠팡 앱 로그인 세션이 WebView로 흘러들지 않음. 사용자가 쿠팡 앱에 로그인되어 있어도 무관. Android 1.0.17에서 정상 동작 검증 완료.

### 관리자 모드 — 기기 핑거프린트 단위 차단 (2026-05-13 추가)

**증상**: 아이패드는 쿠팡 로그아웃 상태 + 다른 IP에서도 추가/순회 실패. 갤럭시는 같은 조건에서 성공.

**원인 추정**: Akamai의 기기 핑거프린트(UA + canvas + WebGL + WebView 빌드) 단위 차단. IP/세션 회복돼도 핑거프린트 자체가 블랙리스트화되면 즉시 차단됨.

**운영 가이드**:
- 차단 의심 기기는 시간 경과 후 재시도 (Akamai TTL 자체 해제 대기, 통상 수 시간~1일)
- 즉시 복구 필요 시 다른 단말 사용
- 1.0.17 UA 로테이션 + 1.0.18 default dataStore로 핑거프린트 변동성/cookie 영속 확보. 효과 검증 진행 중

### 관리자 모드 — 같은 Wi-Fi에서 두 기기 동시 실행 금지

**증상**: 동일 공인 IP에서 두 관리자 기기(Android + iPad)가 동시 WebView 호출 시 쿠팡 IP 차단 발생. 모든 상품 추가/새로고침 1시간가량 실패.

**원인**: 쿠팡은 단시간 다수 동일 IP 트래픽을 봇으로 판정. 두 기기가 각자 30~40개 상품을 sequential하게 처리(상품당 3~5초) → 분당 12~24회 호출 × 2 = 24~48회/분 → 차단 임계 초과.

**운영 가이드**:
- 한 기기씩 순차 실행 (다른 기기는 대기시간 중)
- **두 기기 운영 시 네트워크 분리 유지** (한 대는 Wi-Fi, 다른 한 대는 LTE — 공인 IP 분산)
- 대기시간 30분 이상 설정 권장 (현재 admin UI: 10/15/30/60/120분 chip)
- 3대+ 확장 시(Issue 5 1.0.17) deviceId hash modulo + 시간차 staggered 호출 검토

---

## 운영 정책

- 이슈가 해결되면 이 파일에서 삭제하고 `docs/changelog.md` 상단에 해결 내용을 기록
- 새로 발견된 이슈는 이 파일에 추가 (CLAUDE.md에 직접 쓰지 않음)
- CLAUDE.md는 미해결 이슈를 1줄 요약 + 이 문서 링크로만 표시
