import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { fetchCurrentPrice, extractProductId } from './coupang-api.js';
import {
  sendSmartNotifications,
  type SmartPushTarget,
} from './notifier.js';

// Firebase Admin 초기화
const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}',
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

interface UserItem {
  id: string;
  url: string;
  resolvedUrl?: string;
  productName: string;
  currentPrice: number;
  targetPrice: number;
  priceHistory: { date: string; price: number }[];
}

/** 만료 토큰의 유저 데이터 정리 (앱 삭제 대응) */
async function cleanupInvalidUsers(invalidTokens: string[]) {
  if (invalidTokens.length === 0) return;

  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const token = userDoc.data().expoPushToken;
    if (!token || !invalidTokens.includes(token)) continue;

    console.log(`[Cleanup] 만료 유저 정리: ${userDoc.id}`);

    // 하위 items 컬렉션 삭제
    const itemsSnap = await userDoc.ref.collection('items').get();
    const batch = db.batch();
    itemsSnap.docs.forEach((doc) => batch.delete(doc.ref));
    batch.delete(userDoc.ref);
    await batch.commit();
    console.log(`[Cleanup] 삭제 완료: ${itemsSnap.size}개 상품 + 유저`);
  }
}

/** 30일 이상 비활성 유저 정리 */
async function cleanupInactiveUsers() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    const lastActive = data.lastActiveAt?.toDate?.() || data.lastActiveAt;
    if (!lastActive) continue; // lastActiveAt 없으면 스킵 (기존 유저)

    if (new Date(lastActive) < thirtyDaysAgo) {
      console.log(`[Cleanup] 비활성 유저 정리: ${userDoc.id} (lastActive: ${lastActive})`);
      const itemsSnap = await userDoc.ref.collection('items').get();
      const batch = db.batch();
      itemsSnap.docs.forEach((doc) => batch.delete(doc.ref));
      batch.delete(userDoc.ref);
      await batch.commit();
      console.log(`[Cleanup] 삭제 완료: ${itemsSnap.size}개 상품 + 유저`);
    }
  }
}

async function main() {
  console.log('[PriceChecker] 시작:', new Date().toISOString());

  const usersSnap = await db.collection('users').get();
  const pushTargets: SmartPushTarget[] = [];

  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data();
    const uid = userDoc.id;
    const token = userData.expoPushToken as string | undefined;
    const notifEnabled = userData.notificationEnabled !== false;

    if (!token || !notifEnabled) continue;

    const itemsSnap = await db
      .collection('users')
      .doc(uid)
      .collection('items')
      .get();

    // 상품이 없으면 스킵
    if (itemsSnap.empty) continue;

    for (const itemDoc of itemsSnap.docs) {
      const item = itemDoc.data() as UserItem;
      if (!item.url || !item.productName) continue;

      console.log(`[PriceChecker] 조회: ${item.productName?.slice(0, 30)}`);

      const productId =
        extractProductId(item.resolvedUrl || '') ||
        extractProductId(item.url);
      console.log(`  productId=${productId || 'none'} url=${(item.resolvedUrl || item.url).slice(0, 60)}`);

      const result = await fetchCurrentPrice(item.productName, productId);

      if (!result || result.price === 0) {
        console.log(`  → 가격 조회 실패, 건너뜀`);
        continue;
      }

      const prevPrice = item.currentPrice;
      const newPrice = result.price;
      const today = new Date().toISOString().slice(0, 10);

      const history = item.priceHistory || [];
      const lastEntry = history[history.length - 1];
      if (!lastEntry || lastEntry.date !== today) {
        history.push({ date: today, price: newPrice });
      } else {
        lastEntry.price = newPrice;
      }
      const trimmed = history.slice(-30);

      const updateData: Record<string, any> = {
        currentPrice: newPrice,
        priceHistory: trimmed,
      };
      const itemData = itemDoc.data();
      if (result.image && !itemData.thumbnail) {
        updateData.thumbnail = result.image;
      }
      if (itemData.productName === '상품 정보 없음' && result.name) {
        updateData.productName = result.name;
        console.log(`  → 상품명 보충: ${result.name.slice(0, 30)}`);
      }

      await itemDoc.ref.update(updateData);

      console.log(
        `  → ${prevPrice.toLocaleString()}원 → ${newPrice.toLocaleString()}원`,
      );

      // ── 스마트 알림 조건 판별 ──
      const allPrices = trimmed.map((h) => h.price);
      const lowestPrice = Math.min(...allPrices);
      const basePush = {
        token,
        itemId: item.id,
        productName: item.productName,
        currentPrice: newPrice,
        previousPrice: prevPrice,
        targetPrice: item.targetPrice,
        lowestPrice,
        noChangeDays: 0,
      };

      if (newPrice <= item.targetPrice && prevPrice > item.targetPrice) {
        pushTargets.push({ ...basePush, alertType: 'target_reached' });
        console.log(`  📢 목표가 도달!`);
      } else if (newPrice < prevPrice && newPrice <= lowestPrice && trimmed.length >= 3) {
        pushTargets.push({ ...basePush, alertType: 'lowest_ever' });
        console.log(`  📢 역대 최저가!`);
      } else if (newPrice < prevPrice) {
        pushTargets.push({ ...basePush, alertType: 'price_drop' });
        console.log(`  📢 가격 하락`);
      } else if (trimmed.length >= 7) {
        const last7 = trimmed.slice(-7);
        const allSame = last7.every((h) => h.price === last7[0].price);
        if (allSame) {
          const kstHour = (new Date().getUTCHours() + 9) % 24;
          if (kstHour >= 20 && kstHour <= 22) {
            pushTargets.push({
              ...basePush,
              alertType: 'no_change',
              noChangeDays: 7,
            });
            console.log(`  📢 7일 무변동`);
          }
        }
      }

      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // 스마트 알림 발송 + 만료 토큰 수집
  let invalidTokens: string[] = [];
  if (pushTargets.length > 0) {
    console.log(`[PriceChecker] 스마트 알림 ${pushTargets.length}건 → 푸시 발송`);
    invalidTokens = await sendSmartNotifications(pushTargets);
  }

  // 만료 토큰 유저 정리
  await cleanupInvalidUsers(invalidTokens);

  // 21시(KST) 실행 시에만 비활성 유저 정리
  const kstHour = (new Date().getUTCHours() + 9) % 24;
  if (kstHour >= 20 && kstHour <= 22) {
    await cleanupInactiveUsers();
  }

  console.log('[PriceChecker] 완료:', new Date().toISOString());
}

main().catch(console.error);
