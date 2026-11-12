import { Modal, Pressable, ScrollView, Switch, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as T from '../core/timer';
import type { Settings } from '../hooks/useFlipTimer';
import type { AlertMode } from '../lib/alerts';

interface Props {
  visible: boolean;
  settings: Settings;
  quietLabel: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onAdjust: (id: string, field: T.PresetField, delta: 1 | -1) => void;
  onSet: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onPickFlip: (id: T.FlipSoundId) => void;
  onPickAlarm: (id: T.AlarmSoundId) => void;
  onQuiet: (minutes: number | null) => void;
  onStart: () => void;
}

const ALERTS: { id: AlertMode; label: string }[] = [
  { id: 'both', label: 'Sound + vibrate' },
  { id: 'beep', label: 'Sound' },
  { id: 'vibrate', label: 'Vibrate' },
];

const Label = ({ children }: { children: string }) => (
  <Text className="font-outfit text-xs uppercase tracking-[2px] text-muted">{children}</Text>
);

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="w-20">
        <Label>{label}</Label>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label}`}
        onPress={onMinus}
        className="h-11 w-11 items-center justify-center rounded-full bg-card active:opacity-60"
      >
        <Text className="font-outfit-medium text-2xl text-ink">−</Text>
      </Pressable>
      <View className="h-14 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-card">
        <Text className="font-outfit-semibold text-[30px] leading-[38px] text-digit" style={{ fontVariant: ['tabular-nums'] }}>
          {value}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label}`}
        onPress={onPlus}
        className="h-11 w-11 items-center justify-center rounded-full bg-card active:opacity-60"
      >
        <Text className="font-outfit-medium text-2xl text-ink">+</Text>
      </Pressable>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      className={`h-11 justify-center rounded-full px-4 ${on ? 'bg-ink' : 'bg-card'} active:opacity-70`}
    >
      <Text className={`font-outfit-medium text-sm ${on ? 'text-[#111]' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View className="min-h-11 flex-row items-center justify-between gap-3 rounded-2xl bg-[#141414] px-4 py-2">
      <View className="flex-1">
        <Text className="font-outfit-medium text-[15px] text-ink">{label}</Text>
        {hint ? <Text className="font-outfit text-xs text-muted">{hint}</Text> : null}
      </View>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ false: '#3a3a40', true: '#F5B83D' }} thumbColor="#ffffff" />
    </View>
  );
}

export function PresetSheet(props: Props) {
  const { visible, settings, quietLabel, onClose, onSelect, onAdjust, onSet, onPickFlip, onPickAlarm, onQuiet, onStart } = props;
  const { width, height } = useWindowDimensions();
  const portrait = height > width;
  const current = T.resolvePreset(settings.presetId, settings.overrides);
  const step = (label: string, field: T.PresetField, value: string) => (
    <Stepper key={field} label={label} value={value} onMinus={() => onAdjust(current.id, field, -1)} onPlus={() => onAdjust(current.id, field, 1)} />
  );

  const presets = (
    <View className="gap-2.5">
      {T.PRESETS.map((base) => {
        const p = T.resolvePreset(base.id, settings.overrides);
        const on = p.id === settings.presetId;
        return (
          <Pressable
            key={p.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onSelect(p.id)}
            className={`h-[60px] flex-row items-center gap-3.5 rounded-2xl px-4 ${on ? 'border-2 border-accent bg-[#232323]' : 'bg-[#141414]'}`}
          >
            <View className={`h-2.5 w-2.5 rounded-full ${on ? 'bg-accent' : 'bg-[#4a4a4a]'}`} />
            <View className="flex-1">
              <Text className="font-outfit-medium text-base text-ink">{p.name}</Text>
              <Text className="font-outfit text-[13px] text-muted">{p.subtitle}</Text>
            </View>
            <Text className="font-outfit text-[15px] text-digit">{p.workout && p.rounds > 1 ? T.fmt(T.sessionSec(p)) : T.fmt(p.focusSec)}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const controls = (
    <View className="gap-4">
      {current.id === 'custom' && step('Warm-up', 'warmupSec', T.fmt(current.warmupSec ?? 0))}
      {step(current.workout ? current.focusLabel : 'Flip to', 'focusSec', T.fmt(current.focusSec))}
      {step(current.breakLabel, 'breakSec', T.fmt(current.breakSec))}
      {current.workout && current.rounds > 0 && step('Rounds', 'rounds', String(current.rounds))}
      {current.id === 'custom' && step('Cool-down', 'cooldownSec', T.fmt(current.cooldownSec ?? 0))}
      {current.workout ? <Text className="font-outfit text-[13px] text-muted">Whole session: {T.fmt(T.sessionSec(current))}</Text> : null}

      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Label>Flip sound</Label>
          <Switch accessibilityLabel="Flip sound" value={settings.flipSound} onValueChange={(v) => onSet('flipSound', v)} trackColor={{ false: '#3a3a40', true: '#F5B83D' }} thumbColor="#ffffff" />
        </View>
        <View className={`flex-row flex-wrap gap-2 ${settings.flipSound ? '' : 'opacity-50'}`} accessibilityRole="radiogroup">
          {T.FLIP_SOUNDS.map((s) => (
            <Chip key={s.id} label={s.name} on={settings.flipSound && s.id === settings.flipStyle} onPress={() => onPickFlip(s.id)} />
          ))}
        </View>
      </View>

      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Label>Alarm sound</Label>
          <Text className="font-outfit text-xs text-muted">tap to preview</Text>
        </View>
        <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
          {T.ALARM_SOUNDS.map((s) => (
            <Chip key={s.id} label={s.name} on={s.id === settings.alarmSound} onPress={() => onPickAlarm(s.id)} />
          ))}
        </View>
      </View>

      <View className="gap-2">
        <Label>When time's up</Label>
        <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
          {ALERTS.map((a) => (
            <Chip key={a.id} label={a.label} on={a.id === settings.alert} onPress={() => onSet('alert', a.id)} />
          ))}
        </View>
      </View>

      <Toggle label="Voice coach" hint='"3, 2, 1", rounds and break calls' value={settings.voice} onChange={(v) => onSet('voice', v)} />
      <Toggle label="Remind me if I ignore it" hint="Rings again after 2 and 5 minutes" value={settings.escalate} onChange={(v) => onSet('escalate', v)} />

      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Label>Quiet (meeting)</Label>
          {quietLabel ? <Text className="font-outfit text-xs text-accent">until {quietLabel}</Text> : null}
        </View>
        <View className="flex-row flex-wrap gap-2">
          <Chip label="30 min" on={false} onPress={() => onQuiet(30)} />
          <Chip label="1 hour" on={false} onPress={() => onQuiet(60)} />
          <Chip label="Alerts on" on={!quietLabel} onPress={() => onQuiet(null)} />
        </View>
      </View>
    </View>
  );

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
          <Text className="font-outfit-semibold text-xl text-ink">Timer & sounds</Text>
          <Pressable accessibilityRole="button" onPress={onClose} className="h-11 justify-center px-2">
            <Text className="font-outfit text-sm text-muted">Close</Text>
          </Pressable>
        </View>

        {portrait ? (
          <ScrollView contentContainerClassName="gap-6 px-6 pb-4 pt-2">
            {presets}
            {controls}
          </ScrollView>
        ) : (
          <View className="flex-1 flex-row gap-8 px-8 pt-2">
            <ScrollView className="w-[42%] flex-none" contentContainerClassName="pb-4">
              {presets}
            </ScrollView>
            <ScrollView className="flex-1" contentContainerClassName="pb-4">
              {controls}
            </ScrollView>
          </View>
        )}

        <View className="px-6 pb-2 pt-2">
          <Pressable
            accessibilityRole="button"
            onPress={onStart}
            className="h-[52px] flex-row items-center justify-center rounded-full bg-accent active:opacity-80"
          >
            <Text className="font-outfit-semibold text-[17px] text-[#111]">▶  Start flipping</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
