/**
 * URL에서 productId 추출 (다중 패턴) — services/coupangApi.ts와 동기화
 *
 * 매칭 패턴:
 *   - /products/{id}            (vp/vm 정상 URL)
 *   - ?productId={id}           (쿼리)
 *   - pId%3D{id} / ?pId={id}    (단축/리다이렉트 페이지 변형)
 *
 * 단축 URL(`link.coupang.com/a/...`)은 본문 fetch 없이는 productId 노출 안 됨 → null.
 */
export function extractProductId(url: string | undefined | null): string | null {
  if (!url) return null;
  const patterns = [
    /\/products\/(\d+)/,
    /[?&]productId=(\d+)/,
    /pId%3D(\d+)/i,
    /[?&]pId=(\d+)/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/** URL에서 vendorItemId 추출 (쿼리 + URL-encoded 변형) */
export function extractVendorItemId(url: string | undefined | null): string | null {
  if (!url) return null;
  const patterns = [
    /[?&]vendorItemId=(\d+)/,
    /vendorItemId%3D(\d+)/i,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}
