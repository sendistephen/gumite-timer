import { Text, View } from 'react-native';
import type { Stretch, StretchStep } from '../core/stretches';

/** The stretch to do right now, during a desk break. */
export function StretchBanner({ step, slim }: { step: StretchStep; slim?: boolean }) {
  const { stretch: s, index, count, left, switchSides } = step;
  const pct = Math.max(0, Math.min(100, ((s.sec - left) / s.sec) * 100));
  return (
    <View accessibilityLiveRegion="polite" className="gap-1.5 rounded-2xl bg-card px-4 py-3">
      <View className="flex-row items-center gap-2">
        <View className="rounded-full bg-accent px-2 py-0.5">
          <Text className="font-outfit-semibold text-[10px] uppercase tracking-[1.5px] text-[#111]">{s.area}</Text>
        </View>
        <Text className="flex-1 font-outfit-semibold text-base text-ink" numberOfLines={1}>
          {s.name}
        </Text>
        <Text className="font-outfit text-xs text-muted">
          {index + 1}/{count} · {Math.ceil(left)}s
        </Text>
      </View>
      {!slim && (
        <Text className="font-outfit text-[13px] leading-[18px] text-muted" numberOfLines={2}>
          {switchSides ? 'Switch sides now.' : s.how}
        </Text>
      )}
      <View className="h-1 overflow-hidden rounded-full bg-[#2a2a2e]">
        <View className="h-1 bg-accent" style={{ width: `${pct}%` }} />
      </View>
    </View>
  );
}

export function StretchPreview({ stretch }: { stretch: Stretch }) {
  return (
    <Text className="font-outfit text-[13px] text-muted" numberOfLines={2}>
      First up: <Text className="font-outfit-medium text-ink">{stretch.name}</Text> · {stretch.how}
    </Text>
  );
}
