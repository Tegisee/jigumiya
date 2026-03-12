import { View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { theme } from '../constants/theme';

interface Props {
  priceHistory: { date: string; price: number }[];
}

export function SparklineChart({ priceHistory }: Props) {
  const data = priceHistory.map((p) => ({ value: p.price }));

  if (data.length < 2) return null;

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
