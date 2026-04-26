/**
 * 카테고리 ID 실측 스크립트 (docs/019 §8-A 단계 ②)
 *
 * 목적:
 *   - 쿠팡 파트너스 공식 카테고리 ID가 미공개 → 추측 후보를 1콜씩 시도해 응답 검증
 *   - rCode='0' + 상품 ≥ 1 인 후보만 categories.ts 에 반영
 *
 * 호출 정책 (보수):
 *   - 후보당 1콜, limit=3 (응답 구조 + 첫 상품만 확인용)
 *   - 후보 사이 SLEEP_BETWEEN_PROBES_MS sleep (기본 30초)
 *   - rate-limited 응답 감지 시 즉시 중단 (다음 회차 재시도)
 *   - 안전 마진 위해 후보 수를 처음에는 10개 내외로 제한
 *
 * 실행:
 *   COUPANG_ACCESS_KEY=xxx COUPANG_SECRET_KEY=yyy npm run probe
 *
 * 출력 예시:
 *   [Probe] 1001 → rCode=0 first="..." / 25,900원
 *   [Probe] 1002 → rCode=ERROR msg="카테고리 ID 없음"
 *   [Probe] 1010 → rate-limited → 중단
 */

import { fetchBestCategoryProducts } from './coupang-api.js';

const SLEEP_MS = Number(process.env.SLEEP_BETWEEN_PROBES_MS || 30_000);
const PROBE_LIMIT = 3;

/**
 * 후보 목록.
 *
 * 검증 완료 → categories.ts 반영 (재호출 불필요):
 *   1010 뷰티 / 1011 출산·유아 / 1012 식품 / 1013 생활·주방
 *   1015 홈인테리어 / 1016 가전디지털 / 1017 스포츠·레저
 *   1018 자동차용품 / 1022 반려동물용품
 *
 * 보류 (재검증 우선순위 낮음):
 *   1001 / 1002 — 패션 추정, 동일 상품 충돌 (1·2차 모두)
 *   1019 / 1020 — 사용자 보류 결정 (사유 미기록)
 *
 * ─── 3차 대폭 탐색 (2026-04-26) ───
 * 목적: 미공개 카테고리 ID 체계 전수 매핑.
 *       1000번대 빈자리 + 2000/3000번대 + 100번대 상위 권역.
 *       아이고 앱 월령별 권역(출산·유아동패션/신발/완구/이유식/유아가구/세면/임부복/유아도서)도
 *       위 범위에 자연 포함될 가능성 → 응답 첫 상품명으로 식별 후 categories.ts 반영.
 *
 * Rate Limit 분석 (사용자 합의, 2026-04-26):
 *   - 1·2차 probe 실측(17콜 30초 sleep, rate-limited 0건) → 1콜 = 1회 카운트 확정
 *   - /products/search 도 limit≠카운트 (price-checker 분당 35콜 운영 중)
 *   - 30초 sleep × 337콜 = 분당 2회 / 합산 한도 100회 대비 2% 사용 → 안전
 *   - 잔존 리스크: probe 코드 rate-limited 즉시 중단 가드로 방어
 *   - 예상 소요: 약 2시간 54분
 */

function range(
  from: number,
  to: number,
  label: string,
): Array<{ id: number; guessName: string }> {
  const out: Array<{ id: number; guessName: string }> = [];
  for (let i = from; i <= to; i++) {
    out.push({ id: i, guessName: `${label} ${i}` });
  }
  return out;
}

const CANDIDATES: Array<{ id: number; guessName: string }> = [
  // 100~200: 상위 권역 추정 (101개)
  ...range(100, 200, '상위?'),

  // 1000번대 빈자리 (1003~1009 + 1014 + 1021)
  ...range(1003, 1009, '1000빈자리'),
  { id: 1014, guessName: '1000빈자리 1014' },
  { id: 1021, guessName: '1000빈자리 1021' },

  // 1024~1100: 1000번대 후순위 (77개)
  ...range(1024, 1100, '1000후순위'),

  // 2001~2100: 2000번대 (100개)
  ...range(2001, 2100, '2000번대'),

  // 3001~3050: 3000번대 (50개)
  ...range(3001, 3050, '3000번대'),
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ProbeResult {
  id: number;
  guessName: string;
  status: 'ok' | 'empty' | 'error' | 'rate-limited';
  rCode?: string;
  rMessage?: string;
  productCount?: number;
  firstProductName?: string;
  firstProductPrice?: number;
}

async function probeOne(
  cand: { id: number; guessName: string },
): Promise<ProbeResult> {
  const result = await fetchBestCategoryProducts(cand.id, PROBE_LIMIT);

  if (result.rateLimited) {
    return { ...cand, status: 'rate-limited', rCode: result.rCode, rMessage: result.rMessage };
  }
  if (!result.ok) {
    return {
      ...cand,
      status: 'error',
      rCode: result.rCode,
      rMessage: result.rMessage,
    };
  }
  if (result.products.length === 0) {
    return { ...cand, status: 'empty' };
  }
  const first = result.products[0]!;
  return {
    ...cand,
    status: 'ok',
    productCount: result.products.length,
    firstProductName: first.productName,
    firstProductPrice: first.productPrice,
  };
}

async function main() {
  console.log('[Probe] 시작:', new Date().toISOString());
  console.log(
    `[Probe] 후보 ${CANDIDATES.length}개, sleep=${SLEEP_MS}ms, limit=${PROBE_LIMIT}`,
  );

  if (!process.env.COUPANG_ACCESS_KEY || !process.env.COUPANG_SECRET_KEY) {
    console.error('[Probe] COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY 환경변수 필요');
    process.exit(1);
  }

  const results: ProbeResult[] = [];

  for (let i = 0; i < CANDIDATES.length; i++) {
    const cand = CANDIDATES[i]!;
    console.log(`[Probe] ${cand.id} (${cand.guessName}) 호출...`);
    const r = await probeOne(cand);
    results.push(r);

    if (r.status === 'ok') {
      console.log(
        `  → ✅ rCode=0, first="${(r.firstProductName || '').slice(0, 40)}" / ${(r.firstProductPrice || 0).toLocaleString()}원`,
      );
    } else if (r.status === 'empty') {
      console.log(`  → ⚪ 응답 OK but 상품 0개`);
    } else if (r.status === 'rate-limited') {
      console.log(`  → ⛔ rate-limited (rCode=${r.rCode}) — 즉시 중단`);
      break;
    } else {
      console.log(`  → ❌ rCode=${r.rCode} rMessage="${r.rMessage}"`);
    }

    if (i < CANDIDATES.length - 1) {
      await sleep(SLEEP_MS);
    }
  }

  console.log('\n[Probe] === 검증 통과 후보 (categories.ts 후보) ===');
  const okList = results.filter((r) => r.status === 'ok');
  if (okList.length === 0) {
    console.log('  (없음)');
  } else {
    okList.forEach((r, idx) => {
      console.log(
        `  { categoryId: ${r.id}, categoryName: '확정필요', displayOrder: ${idx + 1} }, // 추측: ${r.guessName} / first: "${(r.firstProductName || '').slice(0, 30)}"`,
      );
    });
  }

  console.log('\n[Probe] 종료:', new Date().toISOString());
}

main().catch((e) => {
  console.error('[Probe] 치명적 오류:', e);
  process.exit(1);
});
