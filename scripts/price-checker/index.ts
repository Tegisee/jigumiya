import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fetchCurrentPrice, extractProductId } from './coupang-api.js';
import {
  sendPriceDropNotifications,
  sendDailyNotifications,
  type PushTarget,
} from './notifier.js';

// Firebase Admin 초기화
const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}',
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// 21:00 KST 실행 여부 판별
function isDailyRun(): boolean {
  const now = new Date();
  const kstHour = (now.getUTCHours() + 9) % 24;
  return kstHour >= 20 && kstHour <= 22;
}

interface UserItem {
  id: string;
  url: string;
  resolvedUrl?: string;
  productName: string;
  currentPrice: number;
  targetPrice: number;
  priceHistory: { date: string; price: number }[];
}

async function main() {
  console.log('[PriceChecker] 시작:', new Date().toISOString());

  // 전체 유저 조회
  const usersSnap = await db.collection('users').get();
  const pushTargets: PushTarget[] = [];
  const dailyTokens: string[] = [];

  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data();
    const uid = userDoc.id;
    const token = userData.expoPushToken as string | undefined;
    const notifEnabled = userData.notificationEnabled !== false;

    if (!token || !notifEnabled) continue;
    if (isDailyRun()) dailyTokens.push(token);

    // 유저의 상품 목록 조회
    const itemsSnap = await db
      .collection('users')
      .doc(uid)
      .collection('items')
      .get();

    for (const itemDoc of itemsSnap.docs) {
      const item = itemDoc.data() as UserItem;
      if (!item.url || !item.productName) continue;

      console.log(`[PriceChecker] 조회: ${item.productName?.slice(0, 30)}`);

      // URL에서 productId 추출 (resolvedUrl → url 순서로 시도)
      const productId =
        extractProductId(item.resolvedUrl || '') ||
        extractProductId(item.url);
      console.log(`  productId=${productId || 'none'} url=${(item.resolvedUrl || item.url).slice(0, 60)}`);

      // 파트너스 API로 가격 조회
      const result = await fetchCurrentPrice(item.productName, productId);

      if (!result || result.price === 0) {
        console.log(`  → 가격 조회 실패, 건너뜀`);
        continue;
      }

      const prevPrice = item.currentPrice;
      const newPrice = result.price;
      const today = new Date().toISOString().slice(0, 10);

      // Firestore 업데이트: currentPrice + priceHistory
      const history = item.priceHistory || [];
      const lastEntry = history[history.length - 1];
      if (!lastEntry || lastEntry.date !== today) {
        history.push({ date: today, price: newPrice });
      } else {
        lastEntry.price = newPrice;
      }
      // 최근 30일만 유지
      const trimmed = history.slice(-30);

      const updateData: Record<string, any> = {
        currentPrice: newPrice,
        priceHistory: trimmed,
      };
      // 썸네일이 비어있으면 API 결과로 보충
      const itemData = itemDoc.data();
      if (result.image && !itemData.thumbnail) {
        updateData.thumbnail = result.image;
      }

      await itemDoc.ref.update(updateData);

      console.log(
        `  → ${prevPrice.toLocaleString()}원 → ${newPrice.toLocaleString()}원`,
      );

      // 목표가 이하로 하락 감지
      if (newPrice <= item.targetPrice && prevPrice > item.targetPrice) {
        pushTargets.push({
          token,
          itemId: item.id,
          productName: item.productName,
          currentPrice: newPrice,
          previousPrice: prevPrice,
        });
      }

      // API 요청 간 딜레이 (레이트 리밋 방지)
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // 가격 하락 알림 발송
  if (pushTargets.length > 0) {
    console.log(`[PriceChecker] 가격 하락 ${pushTargets.length}건 → 푸시 발송`);
    await sendPriceDropNotifications(pushTargets);
  }

  // 21:00 KST 일간 알림
  if (isDailyRun() && dailyTokens.length > 0) {
    console.log(`[PriceChecker] 일간 알림 → ${dailyTokens.length}명`);
    await sendDailyNotifications(dailyTokens);
  }

  console.log('[PriceChecker] 완료:', new Date().toISOString());
}

main().catch(console.error);
