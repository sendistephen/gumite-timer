import { memo, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

interface Props {
  value: string;
  width: number;
  height: number;
  color: string;
  background: string;
}

const FOLD_MS = 150;
const LAND_MS = 210;

interface HalfProps {
  digit: string;
  part: 'top' | 'bottom';
  width: number;
  height: number;
  half: number;
  fontSize: number;
  color: string;
  background: string;
}

function Half({ digit, part, width, height, half, fontSize, color, background }: HalfProps) {
  return (
    <View style={{ width, height: half, overflow: 'hidden', backgroundColor: background }}>
      <Text
        allowFontScaling={false}
        className="font-outfit-semibold"
        style={{
          position: 'absolute',
          top: part === 'top' ? 0 : -half,
          left: 0,
          width,
          height,
          lineHeight: height,
          fontSize,
          color,
          textAlign: 'center',
          includeFontPadding: false,
          textAlignVertical: 'center',
        }}
      >
        {digit}
      </Text>
    </View>
  );
}

/**
 * A split-flap digit: the old top half folds down over the new digit,
 * then the new bottom half lands on top of the old one.
 */
function FlipDigitBase({ value, width, height, color, background }: Props) {
  const [current, setCurrent] = useState(value);
  const [previous, setPrevious] = useState(value);
  const lastValue = useRef(value);
  const topAngle = useSharedValue(0);
  const bottomAngle = useSharedValue(0);

  useEffect(() => {
    if (value === lastValue.current) return;
    setPrevious(lastValue.current);
    setCurrent(value);
    lastValue.current = value;
    topAngle.value = 0;
    bottomAngle.value = 90;
    topAngle.value = withTiming(-90, { duration: FOLD_MS, easing: Easing.in(Easing.quad) });
    bottomAngle.value = withDelay(FOLD_MS, withTiming(0, { duration: LAND_MS, easing: Easing.out(Easing.back(1.4)) }));
  }, [value, topAngle, bottomAngle]);

  const topFlap = useAnimatedStyle(() => ({
    transform: [{ perspective: height * 3 }, { rotateX: `${topAngle.value}deg` }],
  }));
  const bottomFlap = useAnimatedStyle(() => ({
    transform: [{ perspective: height * 3 }, { rotateX: `${bottomAngle.value}deg` }],
  }));

  const half = height / 2;
  const fontSize = height * 0.98;

  const h = { width, height, half, fontSize, color, background };

  return (
    <View style={{ width, height }}>
      {/* new top, revealed as the old top folds away */}
      <View style={{ position: 'absolute', top: 0 }}>
        <Half {...h} digit={current} part="top" />
      </View>
      {/* old bottom, covered when the new bottom lands */}
      <View style={{ position: 'absolute', top: half }}>
        <Half {...h} digit={previous} part="bottom" />
      </View>
      <Animated.View style={[{ position: 'absolute', top: 0, transformOrigin: 'bottom', backfaceVisibility: 'hidden' }, topFlap]}>
        <Half {...h} digit={previous} part="top" />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', top: half, transformOrigin: 'top', backfaceVisibility: 'hidden' }, bottomFlap]}>
        <Half {...h} digit={current} part="bottom" />
      </Animated.View>
    </View>
  );
}

export const FlipDigit = memo(FlipDigitBase);
