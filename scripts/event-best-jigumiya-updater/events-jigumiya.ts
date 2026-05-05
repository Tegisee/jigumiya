/**
 * 지금이야 이벤트 정의 (커플/기념일/시즌 행사 — 일반 사용자 대상).
 *
 * 매일 02:30 KST cron이 오늘 KST 기준 D-7 이내(오늘 포함 7일) 이벤트만 갱신.
 * 활성 기간 외에는 stale 데이터 그대로 둠 (Firestore 문서 미갱신).
 *
 * 키워드 설계 원칙:
 *   1. 모호한 키워드 회피 ("선물" 단독 X)
 *   2. 시즌/대상 한정어 포함 ("커플", "발렌타인", "어린이날" 등)
 *   3. 카테고리 좁히는 키워드 (선물세트/초콜릿/꽃 등)
 *   4. minPrice 클라이언트 필터로 저가 노이즈 제거
 *
 * 키워드 결과는 productId 기준 dedupe 후 단일 문서로 저장.
 */

export type EventDateMonthDay = `${string}-${string}`; // 'MM-DD' (KST)

export interface EventDef {
  /** Firestore 문서 ID (ASCII slug) */
  slug: string;
  /** 사람이 읽는 이벤트 이름 */
  eventName: string;
  /** KST 기준 'MM-DD' — D-7 이내 매칭 시 갱신 */
  date: EventDateMonthDay;
  /** 검색 키워드 (3~5개 권장, 결과 합쳐서 dedupe) */
  keywords: string[];
  /** 클라이언트 minPrice 필터 — 저가 노이즈/사은품 제거 */
  minPrice: number;
}

export const JIGUMIYA_EVENTS: EventDef[] = [
  {
    slug: 'valentine',
    eventName: '발렌타인데이',
    date: '02-14',
    keywords: ['발렌타인 선물', '발렌타인 초콜릿', '커플 선물세트', '발렌타인 케이크'],
    minPrice: 20000,
  },
  {
    slug: 'samgyeopsal',
    eventName: '삼겹살데이',
    date: '03-03',
    keywords: ['삼겹살', '돼지고기', '고기 선물세트', '바베큐 용품'],
    minPrice: 5000,
  },
  {
    slug: 'whiteday',
    eventName: '화이트데이',
    date: '03-14',
    keywords: ['화이트데이 선물', '사탕 선물', '커플 선물', '화이트데이 초콜릿'],
    minPrice: 20000,
  },
  {
    slug: 'childrensday',
    eventName: '어린이날',
    date: '05-05',
    keywords: ['어린이날 선물', '어린이날 장난감', '어린이 선물세트'],
    minPrice: 20000,
  },
  {
    slug: 'parentsday',
    eventName: '어버이날',
    date: '05-08',
    keywords: ['어버이날 선물', '카네이션', '부모님 선물세트', '건강식품 선물'],
    minPrice: 30000,
  },
  {
    slug: 'teachersday',
    eventName: '스승의날',
    date: '05-15',
    keywords: ['스승의날 선물', '선생님 선물', '꽃다발', '감사 선물'],
    minPrice: 30000,
  },
  {
    slug: 'couplesday',
    eventName: '부부의날',
    date: '05-21',
    keywords: ['부부의날 선물', '커플 선물', '기념일 선물', '와인 선물세트'],
    minPrice: 30000,
  },
  {
    slug: 'roseday',
    eventName: '로즈데이',
    date: '06-14',
    keywords: ['로즈데이 선물', '장미 선물', '커플 기념일', '꽃 선물'],
    minPrice: 30000,
  },
  {
    slug: 'halloween',
    eventName: '할로윈',
    date: '10-31',
    keywords: ['할로윈 용품', '할로윈 파티', '할로윈 의상', '할로윈 사탕'],
    minPrice: 5000,
  },
  {
    slug: 'pepero',
    eventName: '빼빼로데이',
    date: '11-11',
    keywords: ['빼빼로 선물세트', '빼빼로', '과자 선물세트', '초콜릿 선물'],
    minPrice: 5000,
  },
  {
    slug: 'christmas',
    eventName: '크리스마스',
    date: '12-25',
    keywords: ['크리스마스 선물', '크리스마스 트리', '산타 선물', '겨울 선물세트'],
    minPrice: 20000,
  },
];
