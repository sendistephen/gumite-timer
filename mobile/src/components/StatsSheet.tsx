import { Modal, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as S from '../core/stats';

interface Props {
  visible: boolean;
  stats: S.StatsStore;
  goal: number;
  streak: number;
  onGoal: (n: number) => void;
  onClose: () => void;
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View className="flex-1 rounded-2xl bg-card px-4 py-3">
      <Text className="font-outfit text-[11px] uppercase tracking-[2px] text-faint">{label}</Text>
      <Text className="font-outfit-semibold text-2xl text-ink">{value}</Text>
      {hint ? <Text className="font-outfit text-xs text-muted">{hint}</Text> : null}
    </View>
  );
}

export function StatsSheet({ visible, stats, goal, streak, onGoal, onClose }: Props) {
  const now = Date.now();
  const today = S.getDay(stats, now);
  const week = S.lastDays(stats, 7, now);
  const max = Math.max(goal, ...week.map((d) => d.breaksTaken), 1);
  const workouts = S.recentWorkouts(stats, 10);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={onClose}
    >
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} className="flex-1 bg-black">
        <View className="flex-row items-center justify-between px-6 pt-2">
          <Text className="font-outfit-semibold text-xl text-ink">Today</Text>
          <Pressable accessibilityRole="button" onPress={onClose} className="h-11 justify-center px-2">
            <Text className="font-outfit text-sm text-muted">Close</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerClassName="gap-5 px-6 pb-6 pt-2">
          <View className="flex-row gap-3">
            <Tile label="Focus" value={S.fmtDuration(today.focusSec)} />
            <Tile label="Breaks" value={`${today.breaksTaken}/${goal}`} />
            <Tile label="Streak" value={`${streak}d`} hint={streak ? 'goal days in a row' : 'hit the goal today'} />
          </View>
          <Text className="font-outfit text-[13px] text-muted">
            Snoozed {today.breaksSnoozed} · Skipped {today.breaksSkipped}
          </Text>

          <View className="gap-2">
            <Text className="font-outfit text-xs uppercase tracking-[2px] text-muted">Last 7 days</Text>
            <View className="h-32 flex-row items-end gap-2">
              {week.map((d) => (
                <View key={d.date} className="flex-1 items-center gap-1" accessibilityLabel={`${d.date}: ${d.breaksTaken} breaks`}>
                  <View className="h-[104px] w-full justify-end">
                    <View
                      className={`w-full rounded-md ${d.breaksTaken >= goal ? 'bg-accent' : 'bg-[#2a2a2e]'}`}
                      style={{ height: `${Math.max(4, (d.breaksTaken / max) * 100)}%` }}
                    />
                  </View>
                  <Text className="font-outfit text-[11px] text-faint">{WEEKDAY[new Date(d.date + 'T12:00').getDay()]}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="flex-row items-center gap-3">
            <Text className="flex-1 font-outfit text-xs uppercase tracking-[2px] text-muted">Daily break goal</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Lower goal" onPress={() => onGoal(Math.max(1, goal - 1))} className="h-11 w-11 items-center justify-center rounded-full bg-card">
              <Text className="font-outfit-medium text-xl text-ink">−</Text>
            </Pressable>
            <Text className="w-8 text-center font-outfit-semibold text-lg text-ink">{goal}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Raise goal" onPress={() => onGoal(Math.min(20, goal + 1))} className="h-11 w-11 items-center justify-center rounded-full bg-card">
              <Text className="font-outfit-medium text-xl text-ink">+</Text>
            </Pressable>
          </View>

          <View className="gap-2">
            <Text className="font-outfit text-xs uppercase tracking-[2px] text-muted">Workout log</Text>
            {workouts.length === 0 ? (
              <Text className="font-outfit text-[13px] text-muted">Finish a workout preset and it shows up here.</Text>
            ) : (
              workouts.map((w) => (
                <View key={w.at} className="flex-row justify-between rounded-xl bg-[#141414] px-4 py-3">
                  <Text className="font-outfit-medium text-[15px] text-ink">{w.preset}</Text>
                  <Text className="font-outfit text-[13px] text-muted">
                    {w.rounds} rounds · {S.fmtDuration(w.durationSec)} · {new Date(w.at).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              ))
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => Share.share({ message: `Flip Timer — ${S.summaryLine(today)}` }).catch(() => {})}
            className="h-12 items-center justify-center rounded-full bg-card active:opacity-70"
          >
            <Text className="font-outfit-medium text-[15px] text-ink">Share today's summary</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
