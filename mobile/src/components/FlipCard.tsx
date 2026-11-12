import { Text, View } from 'react-native';
import { FlipDigit } from './FlipDigit';

interface Props {
  digits: [string, string];
  width: number;
  height: number;
  color: string;
  ring?: string;
  /** small label in the top-left, e.g. HR / MIN / SEC */
  caption: string;
  /** small text in the bottom-left, e.g. "/ 45:00" */
  footnote?: string;
  /** quiet seconds readout in the bottom-right when the cards show HR:MIN */
  seconds?: string | null;
}

const CARD = '#1f1f1f';

export function FlipCard({ digits, width, height, color, ring, caption, footnote, seconds }: Props) {
  const digitH = height * 0.86;
  const digitW = Math.min(width / 2 - 6, digitH * 0.66);
  const corner = Math.max(14, Math.round(height * 0.085));
  return (
    <View
      className="items-center justify-center overflow-hidden bg-card"
      style={{
        width,
        height,
        borderRadius: Math.min(44, height * 0.15),
        borderWidth: ring ? 3 : 0,
        borderColor: ring,
      }}
    >
      <View className="flex-row">
        <FlipDigit value={digits[0]} width={digitW} height={digitH} color={color} background={CARD} />
        <FlipDigit value={digits[1]} width={digitW} height={digitH} color={color} background={CARD} />
      </View>
      {/* the hinge */}
      <View className="absolute left-0 right-0 bg-black" style={{ top: height / 2 - 2, height: 4 }} />
      <Text className="absolute left-5 top-3 font-outfit text-[11px] tracking-[2px] text-faint">{caption}</Text>
      {footnote ? (
        <Text className="absolute bottom-3 left-5 font-outfit text-xs tracking-[1px] text-faint">{footnote}</Text>
      ) : null}
      {seconds ? (
        <Text
          accessibilityLabel={`${seconds} seconds`}
          className="absolute bottom-2 right-5 font-outfit-semibold text-muted"
          style={{ fontSize: corner, fontVariant: ['tabular-nums'] }}
        >
          {seconds}
        </Text>
      ) : null}
    </View>
  );
}
