import { useState, useEffect, useCallback, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import CoupangScraper, { ScrapedProduct } from './CoupangScraper';
import { useAppStore } from '../store/useAppStore';

const NOTIFICATION_MESSAGES = [
  '찜해둔 상품이 목표가 밑으로 떨어졌어요!',
  '드디어 때가 왔습니다. 결제하러 가실 시간이에요!',
  '헉! 방금 가격 내려갔어요. 언제 다시 오를지 몰라요!',
  '잊고 계셨죠? 찜해둔 그 아이템, 지금이 줍줍할 타이밍!',
];

/** 포그라운드 가격 체크 — 상품들을 순차적으로 WebView 스크래핑 */
export default function PriceChecker({ active }: { active: boolean }) {
  const { trackedItems, updateItemPrice, notificationEnabled } = useAppStore();
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const queueRef = useRef<typeof trackedItems>([]);
  const currentItemRef = useRef<(typeof trackedItems)[0] | null>(null);
  const runningRef = useRef(false);

  const processNext = useCallback(() => {
    if (queueRef.current.length === 0) {
      runningRef.current = false;
      setCurrentUrl(null);
      console.log('[PriceChecker] 완료');
      return;
    }

    const item = queueRef.current.shift()!;
    currentItemRef.current = item;
    console.log(`[PriceChecker] 체크: ${item.productName?.slice(0, 30)}`);
    setCurrentUrl(item.url);
  }, []);

  // active가 true로 바뀌면 체크 시작
  useEffect(() => {
    if (!active || runningRef.current || trackedItems.length === 0) return;

    // mock 데이터 제외
    const realItems = trackedItems.filter((i) => !i.id.startsWith('mock-'));
    if (realItems.length === 0) return;

    console.log(`[PriceChecker] 시작: ${realItems.length}개 상품`);
    runningRef.current = true;
    queueRef.current = [...realItems];
    processNext();
  }, [active, trackedItems, processNext]);

  const handleResult = useCallback(
    async (data: ScrapedProduct) => {
      const item = currentItemRef.current;
      if (!item) return;

      const prevPrice = item.currentPrice;
      const newPrice = data.price;

      console.log(
        `[PriceChecker] ${item.productName?.slice(0, 20)}: ${prevPrice.toLocaleString()} → ${newPrice.toLocaleString()}원`,
      );

      if (newPrice > 0 && newPrice !== prevPrice) {
        updateItemPrice(item.id, newPrice);
      }

      // 목표가 달성 로컬 푸시
      if (
        notificationEnabled &&
        newPrice > 0 &&
        newPrice <= item.targetPrice &&
        prevPrice > item.targetPrice
      ) {
        const body =
          NOTIFICATION_MESSAGES[
            Math.floor(Math.random() * NOTIFICATION_MESSAGES.length)
          ];
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '지금이야',
            body: `${item.productName?.slice(0, 30)} ${newPrice.toLocaleString()}원 — ${body}`,
            data: { itemId: item.id, screen: 'detail' },
          },
          trigger: null, // 즉시 발송
        });
      }

      // 다음 상품 (딜레이로 WebView 정리 시간 확보)
      setTimeout(() => {
        setCurrentUrl(null);
        setTimeout(processNext, 500);
      }, 500);
    },
    [updateItemPrice, notificationEnabled, processNext],
  );

  const handleError = useCallback(() => {
    console.log(
      `[PriceChecker] 실패: ${currentItemRef.current?.productName?.slice(0, 20)}`,
    );
    setTimeout(() => {
      setCurrentUrl(null);
      setTimeout(processNext, 500);
    }, 500);
  }, [processNext]);

  return (
    <CoupangScraper
      url={currentUrl}
      onResult={handleResult}
      onError={handleError}
    />
  );
}
