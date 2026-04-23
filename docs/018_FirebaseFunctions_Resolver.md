# 018. Firebase Functions 파트너스 링크 Resolver

## 상태: ✅ 실기기 검증 완료 (2026-04-24) — 가족 구매 실적 검증 대기

## 진행 요약
- **§1 스캐폴드**: ✅ (2026-04-21) 수동 구성 — `firebase.json`, `.firebaserc`, `functions/{package.json, tsconfig.json, src/index.ts}`
- **§2 함수 작성**: ✅ (2026-04-21) `resolveAndGenerateAffiliateUrl` (onCall, asia-northeast3, Node 22)
- **§3 클라이언트 통합**: ✅ (2026-04-21) `services/firebase.ts`에 `callResolveAffiliate` wrapper + `add-item.tsx` dual-path
- **§4 로컬 에뮬레이터 테스트**: ⏭ 스킵 (production 배포 검증으로 대체)
- **§5 배포**: ✅ (2026-04-21) Secrets 등록 + Node 22 배포 + Cleanup policy (1일 이미지 자동 삭제)
  - IAM: `roles/cloudbuild.builds.builder`를 `250441543259-compute@developer.gserviceaccount.com`에 부여
- **§6 실기기 검증 + 3대 버그 수정**: ✅ (2026-04-24) — 아래 §실기기 검증 참고
- **§7 cron 재활성화**: ✅ (2026-04-24) 지금이야 `3c667ef` (08/12/20 KST) + 아이고 `24b1e0c` (07/09/11/13/16/19 KST), 시간대 분리 재조정
- **§8 앱 배포**: ✅ (2026-04-24) iOS 1.0.5 bn38 App Store 심사 제출 + Android 1.0.5 vc38 프로덕션 출시
- **§9 실적 검증**: 🔄 가족 계정 구매 테스트 대기 (1.0.5 승급 후)
- **§10 아이고 이식**: 🔄 지금이야 `e69d05e` 내용을 아이고 Functions에도 반영 필요

**관련 커밋**:
- `72e5792` feat: Firebase Functions resolver 클라이언트 통합 (§1~§3 WIP)
- `b545633` chore: .easignore에 functions/ 제외
- `5970bcd` chore: 1.0.5 bn38/vc38 버전 bump
- `d64d750` chore: Functions runtime Node.js 20 → 22
- `e69d05e` fix: resolveAndGenerateAffiliateUrl — Secret `\n` 제거 + link.coupang.com HTML 파싱 (3대 버그)
- `3c667ef` chore: price-check cron 재활성화 + 아이고와 시간대 분리

## 배경

### 문제 (2026-04-20 공식 확정)
- 쿠팡 파트너스 공식 가이드 **p.13 명시**: "쿠팡 내 공유 기능 사용 링크는 수익 집계 안 됨"
- 실측 원인: `link.coupang.com/a/...` 공유 URL이 iOS Universal Link로 흡수 → `add-item.tsx`에서 resolve 실패 → `/vp/` 조건 불통과 → `generateDeepLink` 미호출 → 원본 URL 저장 → 수수료 트래킹 끊김
- 아이고 앱도 동일 문제 확인 (AQ-4) — 형제 앱 공통 이슈

### 임시 수정의 한계 (커밋 `673c601`, 1.0.4 bn37/vc37)
- `add-item.tsx` 딥링크 생성 조건을 `coupang.com` 포함으로 완화
- 단, `link.coupang.com/a/...`를 `/deeplink` API에 직접 넣으면 `rCode !== '0'` 실패 가능성 높음
- 실패해도 폴백은 원본 URL 유지 → 여전히 수수료 끊김
- **근본 해결 필수 → 본 작업**

## 목표
- 서버사이드에서 `link.coupang.com/a/...` → `www.coupang.com/vp/products/...` resolve 수행
- resolve된 원본 URL로 `/deeplink` API 호출 → 정상 파트너스 단축 링크 반환
- iOS Universal Link는 **클라이언트 전용** → 서버 `fetch`는 영향 없음 (핵심 전제)

## 배포 구조
- **Firebase 프로젝트**: `jigumiya` 기존 프로젝트 재사용 (`projectId: jigumiya-c0c0c` 등 기존 그대로)
- **Runtime**: Node.js 20 (기본) 또는 22 (요금 동일)
- **Region**: `asia-northeast3` (서울) — 쿠팡 서버와 지연 최소화
- **함수명**: `resolveAndGenerateAffiliateUrl` (HTTPS callable 또는 onRequest)

## 실행 이력 (2026-04-21 완료 작업)

### 1. Firebase Functions 프로젝트 초기화 ✅
```bash
cd ~/jigumiya/jigumiya
firebase init functions
# - 기존 jigumiya 프로젝트 선택
# - TypeScript 선택
# - ESLint: 프로젝트 컨벤션 따라 Yes
# - 의존성 설치 Yes
```
- 결과: `functions/` 디렉토리 생성, `functions/src/index.ts` 스캐폴드
- `firebase.json`에 functions 엔트리 추가 확인

**주의**:
- 기존 앱 Firestore 설정 유지 (`firestore.rules`, `firestore.indexes.json` 건드리지 말 것)
- `functions/.env.local`에 `COUPANG_ACCESS_KEY`, `COUPANG_SECRET_KEY` 저장 (실제 배포 시 `firebase functions:secrets:set`로 이동)

### 2. `resolveAndGenerateAffiliateUrl` 함수 작성 ✅

**입력 / 출력**
```ts
// 입력
{ sharedUrl: string }  // "https://link.coupang.com/a/XXXXX" 또는 이미 /vp/ URL

// 출력 성공
{ ok: true, shortenUrl: string, originalUrl: string }

// 출력 실패
{ ok: false, error: "resolve_failed" | "deeplink_failed" | "invalid_url", detail?: string }
```

**핵심 로직**
1. **URL 검증**: `coupang.com` 포함 여부 확인, 아니면 `invalid_url`
2. **Resolve 단계** (`link.coupang.com` 포함 시에만):
   - `fetch(sharedUrl, { redirect: 'manual' })` 1차 시도 → `Location` 헤더 획득
   - Location이 `link.coupang.com`으로 재지정되면 **최대 5회 체인 추적** (리다이렉트 루프 방지)
   - 최종 URL이 `www.coupang.com/vp/products/` 또는 `/vm/products/` 포함 확인
   - 실패 시 `resolve_failed`
3. **딥링크 생성 단계**:
   - resolved URL로 쿠팡 `/deeplink` API 호출 (기존 HMAC 서명 로직 재사용)
   - `rCode === '0'`이면 `shortenUrl` 반환
   - 실패 시 `deeplink_failed`

**User-Agent 설정**
```
Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1
```
- 쿠팡이 봇 UA 차단하므로 모바일 Safari UA 고정
- 클라이언트 `add-item.tsx` iOS HTML fetch와 동일 UA 사용 → 행동 일관성

**리다이렉트 루프 방지**
```ts
const MAX_REDIRECTS = 5;
let visited = new Set<string>();
for (let i = 0; i < MAX_REDIRECTS; i++) {
  if (visited.has(currentUrl)) throw new Error('loop');
  visited.add(currentUrl);
  // fetch manual redirect ...
  if (isProductUrl(nextUrl)) break;
}
```

**에러 핸들링**
- 쿠팡 서버 타임아웃: `AbortController`로 10초 제한
- 쿠팡 5xx: 최대 2회 재시도 (지수 백오프 200ms → 400ms)
- 모든 에러는 `console.error` + Firestore 에러 로그 (선택, 우선은 로그만)

### 3. 앱 `add-item.tsx` 수정 ✅

**변경 전** (현재)
```ts
// 클라이언트 직접 HMAC 호출
if (hasCoupangApiKeys() && resolved.includes('coupang.com')) {
  const deepLink = await generateDeepLink(resolved);
  if (deepLink?.shortenUrl) affiliateUrlRef.current = deepLink.shortenUrl;
}
```

**변경 후**
```ts
// Firebase Functions 호출
const resolveAffiliate = httpsCallable(functions, 'resolveAndGenerateAffiliateUrl');
const { data } = await resolveAffiliate({ sharedUrl: parsedUrl });
if (data.ok) {
  affiliateUrlRef.current = data.shortenUrl;
  resolvedUrlRef.current = data.originalUrl;  // vp/ URL도 받아서 저장
} else {
  console.warn('[AddItem] Functions 실패:', data.error, data.detail);
  // 폴백: 기존 클라이언트 flow (resolve + generateDeepLink) 유지 가능
}
```

**고민 포인트**:
- Functions 실패 시 클라이언트 fallback을 유지할지 제거할지
- 초기엔 **유지** 권장 (Functions 배포/네트워크 이슈 대비) → 안정화 후 제거
- `handleNext`/`handleSave` 두 지점 동일 적용

**클라이언트 코드 정리 검토**:
- Functions 전환 성공 시 `services/coupangApi.ts`의 `generateDeepLink`는 클라이언트에서 제거 가능 (API 키 노출 제거 효과)
- 단, `searchProducts` 등 다른 호출은 유지 (별도 용도)
- 1차 배포에서는 dual-path 유지, 2차 정리에서 키 제거

### 4. 로컬 테스트 ⏭ (스킵 — production 배포 + 실기기 테스트로 대체)

```bash
cd ~/jigumiya/jigumiya/functions
npm run serve  # Firebase Emulator 실행
```

**테스트 케이스**:
1. `link.coupang.com/a/XXXXX` (단축 공유 URL) → `www.coupang.com/vp/...` resolve + `shortenUrl` 반환
2. `www.coupang.com/vp/products/123` (이미 vp URL) → resolve 스킵, 바로 deeplink → `shortenUrl`
3. `link.coupang.com/re/...` (모바일 redirect URL) → `www.coupang.com/vm/...` resolve
4. 잘못된 URL (`google.com`) → `invalid_url` 에러
5. 존재하지 않는 단축코드 → `resolve_failed`
6. 쿠팡 서버 타임아웃 시뮬레이션 → 재시도 후 실패

**로그 확인**:
- Functions 로그에 `rCode`, resolve 단계별 URL, 최종 shortenUrl 출력
- Firestore 에러 로그 컬렉션(옵션) 쓰기 확인

### 5. 빌드 → 실기기 테스트 (배포만 ✅ / 빌드·기기 테스트는 2026-04-22)

```bash
cd ~/jigumiya/jigumiya/functions
firebase deploy --only functions:resolveAndGenerateAffiliateUrl
```

**앱 빌드**: 버전 1.0.5로 bump (iOS bn38 / Android vc38) — 로컬 빌드
```bash
# app.config.js: version 1.0.5, buildNumber 38, versionCode 38
# android/app/build.gradle: versionCode 38, versionName 1.0.5
eas build --local --profile production --platform ios
eas build --local --profile production --platform android
```

**실기기 테스트**:
- 쿠팡 앱에서 상품 공유 → 지금이야로 → 추가
- 로그 확인: Functions 응답 성공/실패, 최종 저장된 `url` 필드가 `link.coupang.com/re/...` 형태인지
- 저장 후 상세화면 "쿠팡에서 보기" 버튼 탭 → 쿠팡 앱으로 이동 + 제휴 쿠키 세팅 여부 확인 (브라우저 devtools 대용으로 Charles/Proxyman으로 트래픽 검증 선택)

### 6. 실기기 검증 + 3대 버그 수정 ✅ (2026-04-24)

1.0.5 bn38/vc38 실기기 테스트 중 3가지 숨은 버그 발견 → 순차 수정 후 end-to-end 성공.

#### 6-1. 401 Unauthorized — Cloud Run invoker IAM 누락
- **증상**: 클라이언트 `callResolveAffiliate` 호출 시 2회 연속 401
- **근본 원인**: Firebase Functions 2세대는 Cloud Run 위에서 동작. 2024-04 GCP 조직 정책 변경 이후 `firebase deploy`가 자동으로 `allUsers:run.invoker` 권한을 설정하지 않음 → URL 도달 시점에서 Cloud Run이 거부
- **해결**:
  - 함수 코드에 `if (!request.auth) throw new HttpsError('unauthenticated', ...)` 추가 (앱은 `signInAnonymously`로 Firebase Auth 세션 보유)
  - `gcloud run services add-iam-policy-binding resolveandgenerateaffiliateurl --region=asia-northeast3 --member=allUsers --role=roles/run.invoker --project=jigumiya`
- **보안 설계**: 이중 레이어 — ①IAM(`allUsers`): URL 엔드포인트 도달 허용. ②함수 코드(`request.auth`): Firebase Auth ID 토큰 검증. Firebase 공식 권장 패턴

#### 6-2. `link.coupang.com/a/...` resolve 실패
- **증상**: Functions 로그에 `[resolve] non-3xx response, stop chain` + `status: 200`. 리다이렉트 체인이 끊김
- **근본 원인**: 쿠팡 단축 URL은 **3xx 리다이렉트가 아닌 200 HTML(JS 리다이렉트 페이지)**을 반환. 우리의 `redirect: 'manual'` fetch는 Location 헤더만 따라가므로 체인 불성립
  - HTML 내부 구조: `<script>...redirectWebUrl='https\x3A\x2F\x2Fwww\x2Ecoupang\x2Ecom\x2Fvp\x2Fproducts\x2F...'...</script>` — JS 변수에 hex-escape(`\xNN`)된 vp URL이 박혀있음
- **해결**: `extractRedirectUrlFromHtml()` 추가. 200 응답 본문에서 `redirectWebUrl` JS 변수를 regex로 추출 + `\xNN` hex escape 디코드 → vp URL 획득 후 체인 계속 진행
- **참고**: Coupang 단축 URL 서빙 구조 변경을 대비해 regex 실패 시 폴백 고려 (현재는 단일 패턴만 구현)

#### 6-3. 딥링크 API 헤더 인젝션 예외 (무증상 실패)
- **증상**: HTTP 200 + `ok: true`처럼 보이지만 저장된 URL이 원본 `link.coupang.com/a/...`와 동일한 포맷 → "원본 그대로 저장"으로 오인
- **실제 동작**: Functions 응답이 `{ ok: false, error: 'deeplink_failed' }`로 내려오고 클라이언트 fallback도 실패 → `add-item.tsx`가 원본 URL을 저장
- **근본 원인**: `COUPANG_ACCESS_KEY` Secret 값 말미에 개행문자(`\n`)가 포함되어 있었음. Authorization 헤더 문자열 구성 시 `\n`이 값 중간에 주입 → undici(Node 22 fetch)가 RFC 7230에 따라 TypeError 거부 → outer try/catch가 조용히 삼킴
  ```
  TypeError: Headers.append: "CEA algorithm=HmacSHA256, access-key=3c52ca22-3b7d-4429-bb3f-2732d30a7f06
  , signed-date=260423T142813Z, ..." is an invalid header value.
  ```
- **해결**: `COUPANG_ACCESS_KEY.value().trim()` + `COUPANG_SECRET_KEY.value().trim()` — Secret에 whitespace가 섞여도 방어
- **부가 수정**: `callDeeplinkApi` 예외 경로 및 `res.json()` 파싱 실패 경로에도 `logger.error` 추가 — 향후 무증상 실패 방지

#### 6-4. shortenUrl 포맷 주의
- **검증 성공 로그 (14:33:15 KST)**:
  ```
  [entry]     입력: link.coupang.com/a/eu6mel
  [resolve]   HTML redirectWebUrl 추출 → www.coupang.com/vp/products/5562324210?...
  [deeplink]  response status: 200
  [exit] ok   shortenUrl: link.coupang.com/a/eu6mre
  ```
- **주의**: 파트너스 deeplink API의 `shortenUrl`은 `https://link.coupang.com/a/XXXXX` 형태로, **입력 공유 URL과 prefix가 동일**. slug(예: `eu6mel` vs `eu6mre`)만 다르므로 육안으로는 구분이 어려움. 수수료 집계는 slug 기반 → 저장된 shortenUrl이 입력 URL과 다른 slug인지 반드시 확인

#### 로그 정비
추적용으로 `[entry]`, `[resolve] extracted from HTML redirectWebUrl`, `[resolve] product URL reached`, `[deeplink] request start`, `[deeplink] response status`, `[deeplink] success`, `[exit] ok` + outer catch의 `[resolve] exception` / `[deeplink] exception` 로거 추가. 프로덕션 장기 운영 시 과다 출력 정리 고려.

### 7. cron 재활성화 + 시간대 분리 ✅ (2026-04-24)
- **커밋**: 지금이야 `3c667ef`, 아이고 `24b1e0c`
- **지금이야**: 08:00 / 12:00 / 20:00 KST (3회)
- **아이고**: 07:00 / 09:00 / 11:00 / 13:00 / 16:00 / 19:00 KST (6회)
- **동시 시간대 겹침 없음** — 분당 50회 합산 우려 원천 차단

### 8. 앱 배포 ✅ (2026-04-24)
- iOS 1.0.5 bn38: App Store 심사 제출 완료
- Android 1.0.5 vc38: Play Store 프로덕션 출시 완료
- 내부 IPA/AAB: `~/jigumiya/builds/ios/jigumiya-1.0.5-38.ipa`, `~/jigumiya/builds/android/jigumiya-1.0.5-38.aab`

### 9. 파트너스 실적 확인 🔄 (대기)

- **일정**: 2026-04-21 15:00 KST 이후
- **테스트 구매**: 가족 계정(다른 결제수단 + 다른 배송지)으로 Functions 경유 생성된 링크 클릭 → 구매 완료
- **확인 지표**:
  - partners.coupang.com 대시보드 → 실적 리포트 → 클릭 수 / 전환 수 집계
  - 클릭만 잡혀도 1차 성공 (resolve + deeplink 정상)
  - 구매 전환까지 잡히면 2차 완전 성공
- **실패 시 대응**:
  - 클릭도 집계 안 되면 → deeplink API 응답 재확인, subId 파라미터 누락 여부 점검
  - 클릭은 있으나 전환 없음 → 쿠팡 정책 재확인 (본인/가족 계정 규정)

## 기타 합의 사항 (2026-04-20)

### cron 스케줄 충돌 없음 확인
- 지금이야: 08 / 14 / 21 KST (3회/일)
- 아이고: 07 / 10 / 13 / 16 / 19 / 22 KST (6회/일)
- **동시 실행 시간 겹침 없음** → 기존 CLAUDE.md의 "cron 어긋나게 조정" TODO 해소

### Firebase 공유 구조 (아이고 베타 이후)
- 지금이야 Firebase 프로젝트 기반으로 아이고도 통합 검토
- **시점**: 아이고 베타 출시 이후 진행 합의
- 본 작업(018)은 지금이야 단독 프로젝트로 먼저 구현 → 안정화 후 아이고 이관 옵션 검토

### `baby_category` 월령별 구조
- 아이고 측 별도 설계 예정 (지금이야 범위 외)
- 참고만: 지금이야의 `shared_products` 구조와 독립

## 이후 작업 (Phase 3-C 서버 이관 준비)
- 본 Functions resolver가 첫 서버사이드 엔드포인트 → Phase 3-C의 `shared_products` 관리/가격 체크 이관의 인프라 기반
- `functions/src/` 내 공통 모듈(HMAC 서명, 에러 로깅, rate limit)을 Phase 3-C 함수들이 재사용
- 상세: `docs/017_앱구조개편_Phase3.md` §Phase 3-C

## 이후 작업 (2026-04-24 이후)

1. **아이고 Functions 수정 이식** — 지금이야 `e69d05e` 내용을 아이고 `functions/src/index.ts`에 동일 적용
   - HTML `redirectWebUrl` 파싱 로직
   - `COUPANG_ACCESS_KEY`/`COUPANG_SECRET_KEY` `.trim()`
   - `request.auth` 검증
   - Cloud Run `allUsers:run.invoker` 부여 (gcloud 명령)
2. **아이고 알림 버그 수정** — 별도 작업 (상세 파악 필요)
3. **가족 계정 구매 테스트** — Play Store / App Store 1.0.5 승급 확인 후 가족 계정(다른 결제수단 + 다른 배송지)으로 Functions 경유 생성된 shortenUrl 클릭 → 구매 → 파트너스 대시보드 실적 집계 확인
4. **디버그 로그 정리** — 6-3 수정 시 추가한 추적 로그를 프로덕션 레벨로 축소 (성공 경로 최소화, 실패 경로 유지)

## 관련 문서
- `docs/010_쿠팡파트너스API.md` §파트너스 실적 미집계 원인 확정 — 근본 원인 분석
- `docs/010_쿠팡파트너스API.md` §Rate Limit 초과 사건 — 2026-04-21 사고 기록
- `docs/015_Phase2.5_버그수정_및_개선.md` §2026.04.20 추가 수정 — 임시 수정 이력
- `docs/017_앱구조개편_Phase3.md` §Phase 3-C — 서버 이관 전체 맥락
