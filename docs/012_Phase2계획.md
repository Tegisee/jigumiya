# 012. Phase 2 계획

## 목표
실제 가격 추적 + 푸시 알림 작동 + 앱스토어 출시

## 작업 목록
| 작업 | 상태 | 상세 MD |
|------|------|---------|
| FCM 푸시 알림 + 가격 체크 봇 | 🔄 | 012_FCM푸시알림.md |
| EAS 재빌드 (Push capability) | ⬜ | 011_EAS빌드_배포.md |
| 쿠팡 파트너스 안내 문구 삽입 | ⬜ | 004_수익모델.md |
| 개인정보처리방침 작성 | ⬜ | — |
| 앱스토어 제출 (production 빌드) | ⬜ | 011_EAS빌드_배포.md |
| 쿠팡 파트너스 API 활성화 (15만원 후) | ⏸ | 010_쿠팡파트너스API.md |

## 완료된 것
- ✅ 앱 클라이언트 알림 코드 (expo-notifications, 토큰 등록, 딥링크)
- ✅ 서버 봇 코드 (scripts/price-checker/, GitHub Actions 워크플로우)
- ✅ GitHub 레포 생성 (Tegisee/jigumiya, private)
- ✅ WebView 기반 상품 스크래핑 (상품명/가격/이미지)

## 출시 전 체크리스트
- [ ] Push 포함 EAS 빌드 성공
- [ ] 실기기 푸시 알림 수신 테스트
- [ ] 파트너스 안내 문구 삽입
- [ ] 개인정보처리방침 URL 준비
- [ ] production 빌드 → App Store Connect 제출
