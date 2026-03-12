# 009. Firebase 연동

## 상태: ✅ 완료

## 완료된 작업 (코드)
- @react-native-firebase/app, auth, firestore 패키지 설치
- app.json 플러그인 자동 등록 (@react-native-firebase/app, auth)
- services/firebase.ts 구현:
  - signInAnonymously() — 앱 시작 시 익명 로그인
  - getCurrentUid()
  - saveItemToFirestore() / removeItemFromFirestore() / updateItemInFirestore()
  - fetchItemsFromFirestore()
  - syncLocalToFirestore() — 로컬 전체 데이터 백업
- store/useAppStore.ts — addItem/removeItem/updateTargetPrice에 Firestore 동기화 연결
- _layout.tsx — 앱 시작 시 signInAnonymously() 호출

## 핵심 파일
| 파일 | 역할 |
|------|------|
| services/firebase.ts | Auth + Firestore CRUD + 동기화 |
| store/useAppStore.ts | 로컬 저장 + Firestore 동기화 |
| app/_layout.tsx | 앱 시작 시 익명 로그인 |

## 데이터 구조 (Firestore)
```
users/{uid}/items/{itemId}
├── id: string
├── url: string
├── productName: string
├── currentPrice: number
├── targetPrice: number
├── thumbnail: string
├── priceHistory: [{ date, price }]
└── createdAt: number
```

## 남은 작업 (Firebase 콘솔)
1. Firebase 콘솔에서 새 프로젝트 생성 (jigumiya)
2. iOS 앱 등록 (com.jigumiya.app) → GoogleService-Info.plist 다운로드
3. Android 앱 등록 (com.jigumiya.app) → google-services.json 다운로드
4. Authentication → 로그인 방법 → 익명(Anonymous) 활성화
5. Firestore Database 생성 (asia-northeast3 / 서울)
6. 설정 파일을 프로젝트 루트에 배치
7. EAS Build로 네이티브 빌드 후 테스트

## 설정 파일 위치 (다운로드 후)
- iOS: jigumiya/GoogleService-Info.plist
- Android: jigumiya/google-services.json

## Firestore 보안 규칙 (초기)
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

## 설계 원칙
- AsyncStorage = 1차 저장소 (항상 동작)
- Firestore = 클라우드 백업 (Firebase 미설정 시 graceful fail)
- 모든 Firestore 호출은 try-catch + console.warn으로 실패해도 앱 크래시 없음
