import { View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { theme } from '../constants/theme';

interface Props {
  priceHistory: { date: string; price: number }[];
}

// 5개 미만은 의미가 없고, gifted-charts SVG는 Android 스크롤에 부담 → 스킵.
const MIN_POINTS = 5;

export function SparklineChart({ priceHistory }: Props) {
  if (priceHistory.length < MIN_POINTS) return null;
  const data = priceHistory.map((p) => ({ value: p.price }));

  return (
    <View style={{ overflow: 'hidden' }}>
      <LineChart
        data={data}
        width={260}
        height={60}
        color={theme.primary}
        thickness={2}
        hideDataPoints
        hideYAxisText
        hideRules
        yAxisColor="transparent"
        xAxisColor="transparent"
        curved
        isAnimated={false}
        initialSpacing={0}
        spacing={40}
        adjustToWidth
      />
    </View>
  );
}
