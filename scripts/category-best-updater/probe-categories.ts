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

/** 추측 후보 — 일반 패션·생활·식품 권역 우선. 검증 통과한 항목만 categories.ts에 옮길 것. */
const CANDIDATES: Array<{ id: number; guessName: string }> = [
  { id: 1001, guessName: '여성패션 (추측)' },
  { id: 1002, guessName: '남성패션 (추측)' },
  { id: 1010, guessName: '뷰티 (추측)' },
  { id: 1011, guessName: '출산/유아 (추측)' },
  { id: 1012, guessName: '식품 (추측)' },
  { id: 1013, guessName: '주방용품 (추측)' },
  { id: 1014, guessName: '생활용품 (추측)' },
  { id: 1015, guessName: '홈인테리어 (추측)' },
  { id: 1016, guessName: '가전디지털 (추측)' },
  { id: 1017, guessName: '스포츠/레저 (추측)' },
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
