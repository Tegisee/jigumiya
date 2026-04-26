/**
 * 카테고리 베스트 갱신 대상 목록.
 *
 * ⚠️ TODO (019 §8-A 단계 ②): 쿠팡 파트너스 공식 카테고리 ID 실측 후 채워넣을 것.
 * - 현재 추측값으로 두면 모든 호출이 실패할 수 있음
 * - 실측 방법: services/coupangApi.ts:fetchBestCategories(candidateId, 5) 호출 → rCode='0' 응답 카테고리만 등록
 * - 쿠팡 답변 수신 시 displayName / displayOrder 정합성 재검증 권장
 *
 * 운영 원칙 (019 §7-3):
 * - 지금이야 카테고리만 본 파일에서 관리
 * - 아이고는 별도 파일/소스로 관리하되, 본 cron이 양 앱 합집합을 갱신
 */

export interface CategoryDef {
  categoryId: number;
  categoryName: string;
  displayOrder: number;
}

/**
 * 지금이야 카테고리 목록 (probe-categories.ts 실측 결과 반영, 2026-04-26).
 *
 * displayOrder 는 호출/표시 순서. 사용자 정의 우선순위 미지정 → probe 통과 ID 오름차순.
 */
export const JIGUMIYA_CATEGORIES: CategoryDef[] = [
  { categoryId: 1010, categoryName: '뷰티',       displayOrder: 1 },
  { categoryId: 1011, categoryName: '출산/유아',  displayOrder: 2 },
  { categoryId: 1012, categoryName: '식품',       displayOrder: 3 },
  { categoryId: 1013, categoryName: '생활/주방',  displayOrder: 4 },
  { categoryId: 1015, categoryName: '홈인테리어', displayOrder: 5 },
  { categoryId: 1016, categoryName: '가전디지털', displayOrder: 6 },
  { categoryId: 1017, categoryName: '스포츠/레저', displayOrder: 7 },
];

/**
 * 보류 후보 — probe 통과했으나 운영 반영 보류한 ID.
 *
 * - 1001 (여성패션 추정) / 1002 (남성패션 추정): probe 결과 동일 상품이 양쪽에 나와 분리 의미 없음.
 *   → 별도 검증 후 단일 ID로 통합하거나 다른 ID 탐색 필요.
 * - 1014 (추정 권역): probe 미실시 또는 미통과 — 차후 2차 probe 대상.
 */
export const JIGUMIYA_CATEGORIES_PENDING: CategoryDef[] = [];
