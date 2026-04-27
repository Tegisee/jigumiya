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
| 019 | SharedProducts + 카테고리 베스트 통합 설계 | 🔄 §8-A 구현 완료 (2026-04-26), §8-B 통합 완료, §8-C 대기 | 019_Phase3_SharedProducts.md |

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

- 다음:
  1. **아이고 실기기 테스트 통과** 후 cron 전체 활성화 (지금이야 + 아이고 동시 반영)
  2. **지금이야 1.0.7 빌드** (App Store 1.0.6 출시 완료 후)
  3. **shared-price-checker workflow_dispatch 수동 테스트** (cron 활성화 전 dry-run)
  4. **cron 활성화 시점에 `shared-price-check.yml` + `price-check.yml` schedule 주석 동시 해제** (§8-D-2)

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
- [ ] **테스트**: shared-price-checker `workflow_dispatch` 수동 실행 → 풀 처리 dry-run 검증
- [ ] **빌드**: 지금이야 1.0.7 (App Store 1.0.6 출시 완료 후 — `app.config.js` version/buildNumber/versionCode bump)
- [ ] **활성화**: shared-price-check.yml + price-check.yml cron schedule 동시 주석 해제 — 선결: 아이고 실기기 테스트 통과 + §8-C 아이고 통합
- [ ] **대기**: 쿠팡 파트너스 문의 답변 — `bestcategories` 호출 카운팅 방식 (1콜 = 1회 vs 100회) + 카테고리 ID 전체 목록
- [ ] **추가**: `category-best-update.yml` 낮 2회 보조 업데이트 (현재 02:00 KST 1회만)
- [ ] **검증**: 가격변동 탭 실제 데이터 — cron 재활성화 후 `recordPriceDrop` 동작 확인
- [ ] **선결**: 아이고 Firebase → jigumiya 통합 (베타 출시 이후, §8-C)

## 다음 작업 순서 (2026-04-26 이후)
1. **아이고 Firebase → jigumiya 통합** (§8-C) — 아이고 베타 출시 이후 진행 합의. `google-services.json` / `GoogleService-Info.plist` 교체 + `app.config.js` Firebase 설정 갱신 + 기존 아이고 유저 데이터 마이그레이션 계획
2. **아이고 Functions 수정 이식** — 지금이야 `e69d05e` 커밋 내용(HTML `redirectWebUrl` 파싱 + Secret `.trim()` + `request.auth` 검증 + `allUsers:run.invoker`)을 아이고 `functions/src/index.ts`에도 동일 적용
3. **아이고 알림 버그 + 계정 삭제 수정** — 별도 작업 (상세 파악 필요)
4. **가족 계정 구매 테스트** — Play Store / App Store 1.0.5/1.0.6 승급 확인 후 가족 계정(다른 결제수단 + 다른 배송지)으로 Functions 경유 생성된 링크 클릭 → 구매 → 파트너스 대시보드 실적 집계 확인
5. **쿠팡 파트너스 문의 답변 수신** — `bestcategories` 호출 카운팅 방식(1콜 = 1회 vs 100회) 확정 후 cron 호출량 재산정
6. ~~**`category-best-update.yml` 낮 2회 보조 업데이트 추가**~~ — 폐기 (rate-limited 시 당일 중단 원칙, 019 §4-1·§5-2)
7. **cron 재활성화** — 위 선결 항목(특히 §1 아이고 통합) 완료 후 확정 스케줄 적용:
   - shared_products 가격체크: 04:30 ~ 01:00 KST 분당 40회 순차 (rate-limited 시 당일 중단)
   - category_best 갱신: 02:00 KST 1회 (sleep 80초)
   - 지금이야 알림: 11:30 / 20:30 KST
   - 아이고 알림: 10:00 / 19:00 KST
8. **가격변동 탭 실데이터 검증** — cron 재활성화 후 `recordPriceDrop` 기록 + UI 표시 확인

## 수익모델: 쿠팡 파트너스 단일 전략
- 수수료: 3~10% (구매 발생 시 자동 수취)
- ✅ 파트너스 최종 승인 완료 — API Access Key / Secret Key 발급됨
- EAS Secrets에 EXPO_PUBLIC_COUPANG_ACCESS_KEY / SECRET_KEY 등록 완료
- Functions Secrets(Secret Manager)에 COUPANG_ACCESS_KEY / SECRET_KEY 등록 완료 — 실기기 검증 시 말미 `\n` 발견 → 함수 코드에서 `.trim()` 방어 처리 (2026-04-24)
- API 딥링크 정상 작동 확인: 파트너스 deeplink API는 `https://link.coupang.com/a/XXXXX` 형태로 shortenUrl 반환 (입력 공유 URL과 동일 prefix라 slug 비교로만 원본/제휴 구분 가능)
- 코드: services/coupangApi.ts (클라이언트 HMAC — fallback용), functions/src/index.ts (서버 HMAC + HTML `redirectWebUrl` 파싱 + 딥링크)

## 현재 상태: 1.0.6 배포 진행 중 (2026-04-26 기준)
- iOS: **1.0.6 buildNumber 40 TestFlight 업로드 + App Store 심사 제출 완료** (2026-04-26)
- Android: **1.0.6 versionCode 40 Play Console 내부 테스트 → 프로덕션 승급 완료** (2026-04-26)
- 1.0.6 주요 변경: 019 §8-A 카테고리 베스트(950 상품) + feed 탭 UI 교체 + 가격변동 탭 신설(4탭 구조) + price_drops 컬렉션
- 1.0.5 (bn38/vc38) 배포 완료 (2026-04-24): Firebase Functions Resolver 클라이언트 통합(dual-path), 파트너스 제휴 링크 근본 해결 (018)
- `eas.json` `appVersionSource: local` + `autoIncrement` 제거 → `app.config.js`가 버전 source of truth
- `673c601`: `generateDeepLink` 조건 `/vp/|/vm/` → `coupang.com`로 확장 (Functions fallback 경로 유지 위해 원복 안 함 — Functions 실패 시 client fallback이 link.coupang.com/a/... 직접 시도)
- iOS 이전 출시: 1.0.1 App Store 정식 출시 ✅, 1.0.2 buildNumber 28 심사 제출, 1.0.4 bn37 App Store 미제출
- Android 이전 출시: 1.0.1 versionCode 17 프로덕션, 1.0.4 vc37 Play Store 미출시
- 1.0.4 미배포: Phase 3-D MVP 변경(3탭/자주사는/피드 배너, 뱃지 초기화, 홈/상세 하트 토글, 스와이프 삭제, 10개 제한)은 1.0.5에 통합되어 사용자에게 전달됨
- 카테고리: 쇼핑/유틸리티, 연령등급: 4+
- 개인정보처리방침: https://dafamstore.tistory.com/9
- GitHub 레포: https://github.com/Tegisee/jigumiya (private)
- 빌드 전 개발 서버(npx expo start)로 테스트 먼저 진행할 것

## 주요 기술 현황
- 서버사이드 가격 체크 (Phase 3 신규, 019 §5-2): scripts/shared-price-checker/ — shared_products 풀 기반 cron
  - 04:30~01:00 KST 분당 40회(sleep 1500ms) 순차, createdAt asc, trackerCount=0/당일 추가 스킵, rate-limited 즉시 종료
  - category_best 캐시 hit 시 API 스킵 (019 §4-2), collectionGroup `tracked.productId` 인덱스로 추적자 역방향 검색 → Expo 푸시
  - `.github/workflows/shared-price-check.yml`: 현재 workflow_dispatch만 활성, schedule 주석 (§8-D-2 활성화 대기)
  - 활성화 선결: §8-C 아이고 통합 + 파트너스 문의 답변
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
| 04:30~01:00 | 지금이야 | shared_products 가격체크 (분당 40회 순차, 20.5h) |

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
- **cron 현재 비활성 (2026-04-24 야간)**: 재시도 루프 제거(지금이야 `46c20e5`, 아이고 `840f1ea`) 후 Phase 3 `shared_products` 설계 반영해 재활성화 예정. 이전 시간대 분리 스케줄(지금이야 08/12/20 ↔ 아이고 07/09/11/13/16/19)은 폐기 — 향후 공유상품 갱신은 **jigumiya 레포 단일 cron**(shared_products 가격체크 04:30~01:00 KST 분당 40회 순차 + category_best 02:00 KST), 알림은 앱별 스케줄(지금이야 11:30/20:30, 아이고 10:00/19:00)
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

