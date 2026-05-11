# 022 — 미해결 이슈 트래커

해결되지 않은 이슈와 잠재적 위험 요소만 모아두는 단일 파일. 해결되면 changelog로 이동시키고 여기서 삭제한다.

---

> Issue 1 / Issue 2-A / Issue 2-C는 모두 해결되어 `changelog.md`로 이동. 1.0.16 RealPrice 아키텍처(`docs/023`) 전체 구현 완료로 그래프/알림 출처 불일치 자체가 해소됨.

---

> Issue NEW-A (Android Push Token null)은 1.0.16 google-services Gradle plugin 적용으로 해결되어 changelog(2026-05-12)로 이동.

---

## Issue 3 — 상품 추가 / 가격 조회 실패 (Akamai Bot Manager 챌린지)

**상태**: 2026-05-12 inspect 스크립트로 진단 — 쿠팡이 Akamai BM 챌린지 페이지를 1차 응답으로 발사. **1.0.17용 fix 코드 적용 완료, 빌드 대기.**

**증상**: 상품 URL 추가 또는 관리자 모드 가격 조회 시 CoupangScraper 무한로딩 또는 onError. 5/7 보고된 "AsyncStorage 초기화 후 첫 추가 실패"와는 별개.

**원인 (2026-05-12 inspect 검증, `scripts/cleanup/inspect-coupang-html-20260512.mjs`)**:
- `https://www.coupang.com/vp/products/{id}` 직접 fetch (iPhone/Android UA) → 2606byte Akamai 챌린지 페이지 응답 (`#sec-if-cpt-container`, `Powered and protected by Akamai`, 7개 set-cookie + JS reload script)
- 데스크톱 UA는 HTTP 403 "Access Denied" — 더 엄격
- WebView는 정상 IP/장치에서 cookie 챌린지 + JS 실행으로 통과 가능
- 사용자 IP가 봇으로 분류된 경우(동시 실행 / 단시간 다수 호출) reload 후에도 챌린지 → SCRAPE_JS는 빈 챌린지 DOM에서 모든 셀렉터 MISS → price=0 → 폴링 20회 후 onError (무한로딩처럼 보이는 증상)

**1.0.17 fix (코드 적용 완료 2026-05-12, 빌드 대기)**:
- `components/CoupangScraper.tsx` SCRAPE_JS:
  - `detectChallenge()` 헬퍼 신설 — `#sec-if-cpt-container` / `.behavioral-content` 또는 akamai 키워드(`Powered and protected by Akamai|sec-if-cpt-container|scf-akamai`) 검사
  - tick 진입 시 챌린지 감지되면 `type='CHALLENGE'` postMessage + 폴링 중단
  - debug에 `akamai=` 플래그 + `bodyPreview.slice(0,500)` 추가 (price=0 마지막 시도일 때만) — 실기기 콘솔로 사후 진단
- `components/CoupangScraper.tsx` handleMessage:
  - CHALLENGE 첫 수신 시 30s 후 1회 재인젝션 (cookie 챌린지 통과 시간 확보) + 외부 timeout 60s로 갱신
  - 두 번째도 챌린지면 `onError('challenge')` 호출
- `onError(reason?: 'challenge' | 'unknown')` 시그니처 확장 — 호출처 4곳(`admin.tsx` / `modal/add-item.tsx` / `detail/[id].tsx` / `components/PriceChecker.tsx`) 모두 reason 처리
- 호출처에서 `reason === 'challenge'`일 때 명시 안내:
  - admin: 순회 자체 중단 (`stopRef.current = true`) + Alert "쿠팡 봇 차단"
  - add-item: 자동 재시도 안 함 + Alert + setScrapeFailed
  - detail: Alert 메시지 분기 ("쿠팡 봇 차단" vs "가격 정보를 가져올 수 없습니다")

**운영 대응 (현재 1.0.16)**:
- 1시간 후 재시도 (IP reputation 회복)
- 다른 Wi-Fi 또는 모바일 데이터로 시도 (다른 공인 IP)
- 관리자 모드 동시 실행 금지 + 대기 30분 이상 (운영 주의사항 참조)

**1.0.17 빌드 후 모니터링**:
- CHALLENGE postMessage 빈도 (cron skip 카운터 + Functions 로그 분석)
- debug `akamai=true` 비율 / `bodyPreview` 키워드 분포 → 챌린지 차단인지 (a) vs 셀렉터 미스매치인지 (b) 구별
- (b) 비율이 의미 있으면 1.0.18에서 셀렉터 확장 + `__NEXT_DATA__` 추출 적용

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

### 관리자 모드 — 같은 Wi-Fi에서 두 기기 동시 실행 금지

**증상**: 동일 공인 IP에서 두 관리자 기기(Android + iPad)가 동시 WebView 호출 시 쿠팡 IP 차단 발생. 모든 상품 추가/새로고침 1시간가량 실패.

**원인**: 쿠팡은 단시간 다수 동일 IP 트래픽을 봇으로 판정. 두 기기가 각자 30~40개 상품을 sequential하게 처리(상품당 3~5초) → 분당 12~24회 호출 × 2 = 24~48회/분 → 차단 임계 초과.

**운영 가이드**:
- 한 기기씩 순차 실행 (다른 기기는 대기시간 중)
- 대기시간 30분 이상 설정 권장 (현재 admin UI: 10/15/30/60/120분 chip)
- 3대+ 확장 시(Issue 5 1.0.17) deviceId hash modulo + 시간차 staggered 호출 검토

---

## 운영 정책

- 이슈가 해결되면 이 파일에서 삭제하고 `docs/changelog.md` 상단에 해결 내용을 기록
- 새로 발견된 이슈는 이 파일에 추가 (CLAUDE.md에 직접 쓰지 않음)
- CLAUDE.md는 미해결 이슈를 1줄 요약 + 이 문서 링크로만 표시
