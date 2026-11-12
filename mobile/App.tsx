import './global.css';

import { Outfit_400Regular } from '@expo-google-fonts/outfit/400Regular';
import { Outfit_500Medium } from '@expo-google-fonts/outfit/500Medium';
import { Outfit_600SemiBold } from '@expo-google-fonts/outfit/600SemiBold';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlipCard } from './src/components/FlipCard';
import { PresetSheet } from './src/components/PresetSheet';
import { StatsSheet } from './src/components/StatsSheet';
import { StretchBanner, StretchPreview } from './src/components/StretchBanner';
import { useFlipTimer } from './src/hooks/useFlipTimer';

const ACCENT = '#F5B83D';
const DIGIT = '#b3b3b3';

function PlayIcon() {
  return (
    <View
      style={{
        marginLeft: 3,
        width: 0,
        height: 0,
        borderTopWidth: 8,
        borderBottomWidth: 8,
        borderLeftWidth: 13,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: '#e6e6e6',
      }}
    />
  );
}

function PauseIcon() {
  return (
    <View className="flex-row gap-1.5">
      <View className="h-4 w-1 rounded-sm bg-ink" />
      <View className="h-4 w-1 rounded-sm bg-ink" />
    </View>
  );
}

function RoundButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-full bg-card active:opacity-60"
    >
      {children}
    </Pressable>
  );
}

function TimerScreen() {
  const { loaded, settings, stats, actions, view } = useFlipTimer();
  const [sheet, setSheet] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  if (!loaded) return <View className="flex-1 bg-black" />;

  // Landscape: cards side by side (bedside flip clock). Portrait: cards stacked.
  const portrait = height > width;
  const padX = portrait ? 20 : 40;
  const gap = portrait ? 18 : 32;
  const usableW = width - insets.left - insets.right - padX * 2;
  const usableH = height - insets.top - insets.bottom;
  // Room for the stretch banner during breaks.
  const banner = view.stretch ? (portrait ? 96 : 64) : view.done && view.firstStretch ? (portrait ? 40 : 0) : 0;
  const cardW = portrait ? usableW : (usableW - gap) / 2;
  const cardH = portrait
    ? Math.max(130, Math.min((usableH - 200 - banner - gap) / 2, cardW * 0.9))
    : Math.max(110, Math.min(usableH - 124 - banner, cardW * 0.78));
  const digitColor = view.done ? ACCENT : DIGIT;
  const ring = view.done ? ACCENT : undefined;
  const { face } = view;

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} className="flex-1 bg-black">
      <StatusBar hidden={!portrait} style="light" />
      <View className="flex-1 justify-center gap-3.5 py-4" style={{ paddingHorizontal: padX }}>
        {/* top line */}
        <View className="h-6 flex-row items-center justify-between gap-3">
          <View className="flex-row items-center gap-2.5">
            <View className={`h-2 w-2 rounded-full ${view.running ? 'bg-accent' : 'bg-[#4a4a4a]'}`} />
            <Text className="font-outfit text-[13px] uppercase tracking-[2px] text-muted">{view.modeLabel}</Text>
          </View>
          {!portrait && (
            <Text className="flex-1 text-center font-outfit text-[13px] uppercase tracking-[2px] text-muted" numberOfLines={1}>
              {view.statusText}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Today's stats"
            onPress={() => setStatsOpen(true)}
            className="h-11 flex-row items-center gap-1.5 px-1 active:opacity-60"
          >
            <Text className="font-outfit text-[13px] tracking-[1px] text-muted">
              {view.today.breaksTaken}/{settings.dailyGoal} breaks{view.streak > 1 ? ` · ${view.streak}d` : ''}
            </Text>
          </Pressable>
        </View>

        {/* flip cards — tap to start/pause */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={view.running ? 'Pause timer' : 'Start timer'}
          onPress={view.done ? undefined : actions.toggle}
          className={portrait ? 'items-center' : 'flex-row justify-center'}
          style={{ gap }}
        >
          <FlipCard digits={face.left} width={cardW} height={cardH} color={digitColor} ring={ring} caption={face.leftCaption} />
          <FlipCard
            digits={face.right}
            width={cardW}
            height={cardH}
            color={digitColor}
            ring={ring}
            caption={face.rightCaption}
            footnote={`/ ${view.target}`}
            seconds={face.seconds}
          />
        </Pressable>

        {view.stretch && <StretchBanner step={view.stretch} slim={!portrait} />}

        {portrait && !view.done && !view.stretch && (
          <Text className="text-center font-outfit text-[13px] uppercase tracking-[2px] text-muted">{view.statusText}</Text>
        )}

        {/* bottom line */}
        {view.done ? (
          <View className="gap-3">
            {portrait && view.firstStretch ? <StretchPreview stretch={view.firstStretch} /> : null}
            <View className={portrait ? 'gap-3' : 'h-11 flex-row items-center gap-3'}>
              <View className="flex-row items-center gap-3" style={portrait ? undefined : { flex: 1 }}>
                <View className="h-2.5 w-2.5 rounded-full bg-accent" />
                <Text className="flex-1 font-outfit-medium text-lg text-[#f2f2f2]" numberOfLines={2}>
                  {view.doneTitle}
                </Text>
              </View>
              <View className="flex-row gap-3">
                <Pressable
                  accessibilityRole="button"
                  onPress={actions.snooze}
                  className="h-11 items-center justify-center rounded-full bg-card px-[18px] active:opacity-60"
                  style={portrait ? { flex: 1 } : undefined}
                >
                  <Text className="font-outfit text-[15px] text-ink">Snooze 5</Text>
                </Pressable>
                {view.breakWaiting && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={actions.skipBreak}
                    className="h-11 items-center justify-center rounded-full bg-card px-[18px] active:opacity-60"
                    style={portrait ? { flex: 1 } : undefined}
                  >
                    <Text className="font-outfit text-[15px] text-ink">Skip</Text>
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="button"
                  onPress={actions.next}
                  className="h-11 items-center justify-center rounded-full bg-accent px-5 active:opacity-80"
                  style={portrait ? { flex: 1.6 } : undefined}
                >
                  <Text className="font-outfit-semibold text-[15px] text-[#111]">{view.nextLabel}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : (
          <View className="h-11 flex-row items-center gap-3.5">
            <RoundButton label={view.running ? 'Pause' : 'Start'} onPress={actions.toggle}>
              {view.running ? <PauseIcon /> : <PlayIcon />}
            </RoundButton>
            <RoundButton label="Reset" onPress={actions.reset}>
              <Text className="font-outfit-medium text-xl text-ink">↺</Text>
            </RoundButton>
            <View className="h-1 flex-1 overflow-hidden rounded-full bg-[#262626]">
              <View className="h-1 bg-accent" style={{ width: `${view.progress * 100}%` }} />
            </View>
            {view.quietLabel ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Turn alerts back on" onPress={() => actions.quiet(null)} className="h-11 justify-center rounded-full bg-card px-3 active:opacity-60">
                <Text className="font-outfit text-[13px] text-accent">Quiet</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Presets and sounds"
              onPress={() => setSheet(true)}
              className="h-11 flex-row items-center gap-2 rounded-full bg-card px-[18px] active:opacity-60"
            >
              <Text className="font-outfit text-[15px] text-ink">{portrait ? '☰' : '☰  Presets'}</Text>
            </Pressable>
          </View>
        )}
        {view.stretch && portrait ? (
          <Text className="text-center font-outfit text-[11px] text-faint">Move gently — stop if anything hurts.</Text>
        ) : null}
      </View>

      <PresetSheet
        visible={sheet}
        settings={settings}
        quietLabel={view.quietLabel}
        onClose={() => setSheet(false)}
        onSelect={actions.selectPreset}
        onAdjust={actions.adjust}
        onSet={actions.set}
        onPickFlip={actions.pickFlip}
        onPickAlarm={actions.pickAlarm}
        onQuiet={actions.quiet}
        onStart={() => {
          setSheet(false);
          actions.start();
        }}
      />
      <StatsSheet
        visible={statsOpen}
        stats={stats}
        goal={settings.dailyGoal}
        streak={view.streak}
        onGoal={(n) => actions.set('dailyGoal', n)}
        onClose={() => setStatsOpen(false)}
      />
    </SafeAreaView>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold });
  return (
    <SafeAreaProvider>
      {fontsLoaded ? <TimerScreen /> : <View className="flex-1 bg-black" />}
    </SafeAreaProvider>
  );
}
