# 008. Share Intent 연동

## 상태: ✅ 완료

## 구현 내용
- expo-share-intent 설치 완료
- app.json 플러그인 설정 완료 (JigumiyaShareExtension, App Group)
- ShareIntentProvider로 _layout.tsx 래핑
- +native-intent.tsx로 딥링크 → /shareintent 리다이렉트
- shareintent.tsx에서 URL 추출 → add-item 모달 자동 오픈
- add-item.tsx Share Intent URL 자동 입력 (readOnly)
- 쿠팡 URL 검증 (coupang.com, link.coupang.com 모두 인식)

## 핵심 파일
| 파일 | 역할 |
|------|------|
| app/+native-intent.tsx | getShareExtensionKey()로 share URL 감지 → /shareintent 리다이렉트 |
| app/_layout.tsx | ShareIntentProvider 래핑, resetOnBackground: true |
| app/shareintent.tsx | useShareIntentContext()로 데이터 수신 → 쿠팡 URL 추출 → add-item 모달 push |
| app/modal/add-item.tsx | sharedUrl params로 URL 자동 입력, readOnly, 20개 제한 |

## 작동 플로우
1. 쿠팡 공유 → jigumiya://dataUrl=... 딥링크로 앱 실행
2. +native-intent.tsx가 /shareintent 경로로 리다이렉트
3. shareintent.tsx에서 useShareIntentContext()로 데이터 수신
4. webUrl 우선, 없으면 text에서 정규식으로 쿠팡 URL 추출
5. replace('/')로 홈 이동 → 300ms 후 push로 add-item 모달 오픈
6. URL 자동 입력 + 목표가 입력 → 저장 → 홈 리스트에 표시

## EAS Build 이력
- iOS 시뮬레이터 빌드: 성공
- iOS 실기기 빌드: 성공 (App Group Provisioning Profile 수동 등록으로 해결)
  - Apple Developer Portal에서 group.com.jigumiya.app App Group 수동 생성
  - com.jigumiya.app.share-extension App ID에 App Group capability 수동 활성화
  - EAS credentials에서 기존 Profile 삭제 후 인터랙티브 모드로 재빌드

## 해결한 이슈
1. Unmatched Route 에러 → +native-intent.tsx 생성으로 해결
2. Share Intent 데이터 미수신 → ShareIntentProvider + useShareIntentContext 패턴으로 변경
3. 모달 안 뜸 → replace 대신 replace('/') + setTimeout push 패턴으로 해결
4. link.coupang.com 미인식 → coupang.com 포함 여부로 통합 검증
5. App Group Provisioning Profile 에러 → Apple Developer Portal 수동 등록

## app.json 핵심 설정
- bundleIdentifier: com.jigumiya.app
- Share Extension: com.jigumiya.app.share-extension
- App Group: group.com.jigumiya.app
- scheme: jigumiya
