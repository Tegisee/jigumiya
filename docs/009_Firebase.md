# 009. Firebase 연동

## 상태: ✅ 완료

## 구현 방식
- **Firebase JS SDK v12.10.0** 사용 (npm `firebase` 패키지)
- @react-native-firebase 네이티브 패키지는 CocoaPods 빌드 실패로 사용 불가 → JS SDK로 전환
- `initializeAuth` + `getReactNativePersistence(AsyncStorage)`로 Auth 세션 영속화
- `@firebase/auth/dist/rn/index.js`에서 RN용 persistence import (`@ts-ignore` 필요)

## Firebase 프로젝트 정보
- 프로젝트 ID: jigumiya
- 리전: asia-northeast3 (서울)
- iOS 앱: com.jigumiya.app
- messagingSenderId: 250441543259

## 완료된 작업
- Anonymous Auth (익명 로그인) — 앱 시작 시 자동
- Firestore CRUD — 상품 저장/삭제/조회/업데이트
- 로컬→Firestore 동기화 (syncLocalToFirestore)
- Push Token 저장 (expoPushToken) — Phase 2 알림용
- 알림 ON/OFF 설정 저장 (notificationEnabled)
- 포그라운드 복귀 시 Firestore→로컬 동기화

## 핵심 파일
| 파일 | 역할 |
|------|------|
| services/firebase.ts | Auth + Firestore CRUD + Push Token 저장 |
| store/useAppStore.ts | 로컬 저장 + Firestore 동기화 + syncFromFirestore |
| app/_layout.tsx | 앱 시작 시 익명 로그인 + 푸시 토큰 등록 |

## Firestore 데이터 구조
```
users/{uid}
├── expoPushToken: string
├── notificationEnabled: boolean
└── items/{itemId}
    ├── id: string
    ├── url: string
    ├── productName: string
    ├── currentPrice: number
    ├── targetPrice: number
    ├── thumbnail: string
    ├── priceHistory: [{ date, price }]
    └── createdAt: number
```

## Firestore 보안 규칙
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

## 실기기 테스트 결과
- ✅ 익명 로그인 성공 (uid 발급 확인)
- ✅ Firestore 상품 저장/조회 정상
- ✅ Auth AsyncStorage 영속화 (앱 재시작 시 재로그인 불필요)
- ✅ Auth WARN 해결 (initializeAuth + getReactNativePersistence)

## 설계 원칙
- AsyncStorage = 1차 저장소 (항상 동작)
- Firestore = 클라우드 백업 (Firebase 미설정 시 graceful fail)
- 모든 Firestore 호출은 try-catch + console.warn으로 실패해도 앱 크래시 없음
