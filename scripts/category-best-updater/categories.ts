/**
 * 카테고리 베스트 갱신 대상 목록.
 *
 * 출처: 쿠팡 파트너스 공식 카테고리 목록 (2026-04-26 사용자 확인).
 * displayOrder = 공식 ID 오름차순.
 *
 * 운영 원칙 (019 §7-3):
 * - 지금이야 카테고리만 본 파일에서 관리
 * - 아이고는 별도 파일/소스로 관리하되, 본 cron이 양 앱 합집합을 갱신
 *
 * 호출량 산정:
 * - 19개 × 1콜 × 120초 sleep ≈ 약 38분 (timeout-minutes 60 여유)
 * - 1콜 = 1회 카운트 / 합산 한도 100회/분 대비 분당 0.5회 → 매우 안전
 */

export interface CategoryDef {
  categoryId: number;
  categoryName: string;
  displayOrder: number;
}

export const JIGUMIYA_CATEGORIES: CategoryDef[] = [
  { categoryId: 1001, categoryName: '여성패션',     displayOrder: 1 },
  { categoryId: 1002, categoryName: '남성패션',     displayOrder: 2 },
  { categoryId: 1010, categoryName: '뷰티',         displayOrder: 3 },
  { categoryId: 1011, categoryName: '출산/유아동', displayOrder: 4 },
  { categoryId: 1012, categoryName: '식품',         displayOrder: 5 },
  { categoryId: 1013, categoryName: '주방용품',     displayOrder: 6 },
  { categoryId: 1014, categoryName: '생활용품',     displayOrder: 7 },
  { categoryId: 1015, categoryName: '홈인테리어',   displayOrder: 8 },
  { categoryId: 1016, categoryName: '가전디지털',   displayOrder: 9 },
  { categoryId: 1017, categoryName: '스포츠/레저', displayOrder: 10 },
  { categoryId: 1018, categoryName: '자동차용품',   displayOrder: 11 },
  { categoryId: 1019, categoryName: '도서/음반/DVD', displayOrder: 12 },
  { categoryId: 1020, categoryName: '완구/취미',   displayOrder: 13 },
  { categoryId: 1021, categoryName: '문구/오피스', displayOrder: 14 },
  { categoryId: 1024, categoryName: '헬스/건강식품', displayOrder: 15 },
  { categoryId: 1025, categoryName: '국내여행',     displayOrder: 16 },
  { categoryId: 1026, categoryName: '해외여행',     displayOrder: 17 },
  { categoryId: 1029, categoryName: '반려동물용품', displayOrder: 18 },
  { categoryId: 1030, categoryName: '유아동패션',   displayOrder: 19 },
];
