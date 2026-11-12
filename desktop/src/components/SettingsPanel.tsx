import { type ReactNode, useEffect, useState } from 'react';
import * as T from '../core/timer';
import { ACCENTS, type Corner, type Settings, type Tint } from '../hooks/useFlipTimer';
import { getAutostart, isMac, setAutostart } from '../lib/native';

type Tab = 'timer' | 'sounds' | 'look' | 'behaviour';

interface Props {
  settings: Settings;
  quietLabel: string | null;
  onSelect: (id: string) => void;
  onAdjust: (id: string, field: T.PresetField, delta: 1 | -1) => void;
  onSet: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onPickFlip: (id: T.FlipSoundId) => void;
  onPickAlarm: (id: T.AlarmSoundId) => void;
  onQuiet: (minutes: number | null) => void;
  onDone: () => void;
}

const roundBtn = 'h-8 w-8 shrink-0 rounded-full border border-glass-line bg-glass text-lg hover:bg-glass-hover';

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[74px] text-[11px] tracking-[0.14em] text-muted uppercase">{label}</span>
      <button type="button" onClick={onMinus} aria-label={`Decrease ${label}`} className={roundBtn}>
        −
      </button>
      <span className="glass-card flex-1 rounded-lg py-1 text-center text-lg font-semibold text-digit tabular-nums">{value}</span>
      <button type="button" onClick={onPlus} aria-label={`Increase ${label}`} className={roundBtn}>
        +
      </button>
    </div>
  );
}

function Switch({ label, on, onChange, hint, aria }: { label: string; on: boolean; onChange: (v: boolean) => void; hint?: string; aria?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={aria ?? (label || undefined)}
      onClick={() => onChange(!on)}
      className={`flex items-center gap-2.5 rounded-lg py-1 text-left text-[13px] text-ink ${label ? 'w-full' : ''}`}
    >
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-track'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      {label && (
        <span className="flex flex-col">
          {label}
          {hint && <span className="text-[11px] text-muted">{hint}</span>}
        </span>
      )}
    </button>
  );
}

function Choice({ label, on, onClick, hint }: { label: string; on: boolean; onClick: () => void; hint?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      title={hint}
      onClick={onClick}
      className={`h-8 truncate rounded-lg px-2 text-[12px] font-medium transition-colors ${
        on ? 'bg-solid text-on-solid shadow-[0_2px_8px_rgb(0_0_0/0.2)]' : 'border border-glass-line bg-glass text-ink hover:bg-glass-hover'
      }`}
    >
      {label}
    </button>
  );
}

const Label = ({ children }: { children: string }) => <span className="text-[11px] tracking-[0.14em] text-muted uppercase">{children}</span>;

const Group = ({ label, children, right }: { label: string; children: ReactNode; right?: ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex min-h-6 items-center justify-between">
      <Label>{label}</Label>
      {right}
    </div>
    {children}
  </div>
);

const CORNERS: { id: Corner; label: string }[] = [
  { id: 'tl', label: 'Top left' },
  { id: 'tr', label: 'Top right' },
  { id: 'bl', label: 'Bottom left' },
  { id: 'br', label: 'Bottom right' },
];

const TINTS: { id: Tint; label: string }[] = [
  { id: 'clear', label: 'Clear' },
  { id: 'medium', label: 'Frosted' },
  { id: 'solid', label: 'Solid' },
];

const kbd = (k: string) => (isMac ? `⌃⌥${k}` : `Ctrl+Alt+${k}`);

export function SettingsPanel(props: Props) {
  const { settings, onSet, onDone } = props;
  const [tab, setTab] = useState<Tab>('timer');
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" className="grid grid-cols-4 gap-1 rounded-xl border border-glass-line bg-glass p-1">
        {(['timer', 'sounds', 'look', 'behaviour'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`h-7 rounded-lg text-[12px] font-medium capitalize ${tab === t ? 'bg-solid text-on-solid' : 'text-muted hover:text-ink'}`}
          >
            {t === 'behaviour' ? 'Habits' : t}
          </button>
        ))}
      </div>

      {tab === 'timer' && <TimerTab {...props} />}
      {tab === 'sounds' && <SoundsTab {...props} />}
      {tab === 'look' && (
        <div className="flex flex-col gap-3">
          <Group label="Corner">
            <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Corner">
              {CORNERS.map((c) => (
                <Choice key={c.id} label={c.label} on={settings.corner === c.id} onClick={() => onSet('corner', c.id)} />
              ))}
            </div>
          </Group>
          <Group label="Theme">
            <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Theme">
              <Choice label="Dark glass" on={settings.theme === 'dark'} onClick={() => onSet('theme', 'dark')} />
              <Choice label="Light glass" on={settings.theme === 'light'} onClick={() => onSet('theme', 'light')} />
            </div>
          </Group>
          <Group label="Glass">
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Glass">
              {TINTS.map((t) => (
                <Choice key={t.id} label={t.label} on={settings.tint === t.id} onClick={() => onSet('tint', t.id)} />
              ))}
            </div>
          </Group>
          <Group label="Accent">
            <div className="flex gap-2" role="radiogroup" aria-label="Accent colour">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={settings.accent === a.id}
                  aria-label={a.id}
                  onClick={() => onSet('accent', a.id)}
                  className={`h-8 w-8 rounded-full border-2 ${settings.accent === a.id ? 'border-ink' : 'border-transparent'}`}
                  style={{ background: a.hex }}
                />
              ))}
            </div>
          </Group>
          <Switch label="Compact size" on={settings.compact} onChange={(v) => onSet('compact', v)} />
        </div>
      )}
      {tab === 'behaviour' && <HabitsTab {...props} />}

      <button type="button" onClick={onDone} className="mt-1 h-10 shrink-0 rounded-full bg-accent text-sm font-semibold text-on-accent shadow-[0_4px_14px_color-mix(in_srgb,var(--color-accent)_35%,transparent)] hover:brightness-110">
        Done
      </button>
    </div>
  );
}

function TimerTab({ settings, onSelect, onAdjust }: Props) {
  const p = T.resolvePreset(settings.presetId, settings.overrides);
  const step = (label: string, field: T.PresetField, value: string) => (
    <Stepper key={field} label={label} value={value} onMinus={() => onAdjust(p.id, field, -1)} onPlus={() => onAdjust(p.id, field, 1)} />
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {T.PRESETS.map((base) => {
          const q = T.resolvePreset(base.id, settings.overrides);
          const on = q.id === settings.presetId;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onSelect(q.id)}
              aria-pressed={on}
              className={`flex flex-col items-start rounded-xl px-3 py-2 text-left transition-colors ${
                on ? 'glass-card ring-2 ring-accent' : 'border border-glass-line bg-glass hover:bg-glass-hover'
              }`}
            >
              <span className="text-[13px] font-medium">{q.name}</span>
              <span className="text-[12px] text-muted tabular-nums">
                {q.workout && q.rounds > 1 ? `${q.rounds}× ${T.fmt(q.focusSec)}` : T.fmt(q.focusSec)}
                {q.breakSec ? ` → ${T.fmt(q.breakSec)}` : ''}
              </span>
            </button>
          );
        })}
      </div>
      {(p.warmupSec ?? 0) > 0 || p.id === 'custom' ? step('Warm-up', 'warmupSec', T.fmt(p.warmupSec ?? 0)) : null}
      {step(p.workout ? p.focusLabel : 'Flip to', 'focusSec', T.fmt(p.focusSec))}
      {step(p.breakLabel, 'breakSec', T.fmt(p.breakSec))}
      {p.workout && p.rounds > 0 && step('Rounds', 'rounds', String(p.rounds))}
      {p.id === 'custom' && step('Cool-down', 'cooldownSec', T.fmt(p.cooldownSec ?? 0))}
      {p.workout && <p className="m-0 text-[12px] text-muted">Whole session: {T.fmt(T.sessionSec(p))}</p>}
    </div>
  );
}

function SoundsTab({ settings, onSet, onPickFlip, onPickAlarm }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <Group label="Flip sound" right={<Switch label="" aria="Flip sound on" on={settings.flipSound} onChange={(v) => onSet('flipSound', v)} />}>
        <div className={`grid grid-cols-3 gap-1.5 ${settings.flipSound ? '' : 'opacity-50'}`} role="radiogroup" aria-label="Flip sound">
          {T.FLIP_SOUNDS.map((s) => (
            <Choice key={s.id} label={s.name} on={settings.flipSound && s.id === settings.flipStyle} onClick={() => onPickFlip(s.id)} />
          ))}
        </div>
      </Group>
      <Group label="Alarm sound" right={<Switch label="" aria="Alarm sound on" on={settings.sound} onChange={(v) => onSet('sound', v)} />}>
        <div className={`grid grid-cols-3 gap-1.5 ${settings.sound ? '' : 'opacity-50'}`} role="radiogroup" aria-label="Alarm sound">
          {T.ALARM_SOUNDS.map((s) => (
            <Choice key={s.id} label={s.name} hint={s.hint} on={s.id === settings.alarmSound} onClick={() => onPickAlarm(s.id)} />
          ))}
        </div>
      </Group>
      <Switch label="Voice coach" hint='Says "3, 2, 1", rounds and break reminders' on={settings.voice} onChange={(v) => onSet('voice', v)} />
      <Switch label="System notifications" on={settings.notifications} onChange={(v) => onSet('notifications', v)} />
      <span className="text-[11px] text-muted">Tap a sound to preview it.</span>
    </div>
  );
}

function HabitsTab({ settings, quietLabel, onSet, onQuiet }: Props) {
  const [autostart, setAuto] = useState<boolean | null>(null);
  useEffect(() => {
    void getAutostart().then(setAuto);
  }, []);
  return (
    <div className="flex flex-col gap-3">
      <Switch
        label="Count time away as a break"
        hint={`If you're away from the keyboard ${settings.awayMin}+ min, the sitting timer restarts.`}
        on={settings.autoBreak}
        onChange={(v) => onSet('autoBreak', v)}
      />
      {settings.autoBreak && (
        <div className="grid grid-cols-4 gap-1.5 pl-11" role="radiogroup" aria-label="Away after">
          {[2, 3, 5, 10].map((m) => (
            <Choice key={m} label={`${m} min`} on={settings.awayMin === m} onClick={() => onSet('awayMin', m)} />
          ))}
        </div>
      )}
      <Switch label="Remind me if I ignore it" hint="Rings again after 2 min; after 5 min the widget moves to the middle of the screen." on={settings.escalate} onChange={(v) => onSet('escalate', v)} />
      <Group label="Meeting / quiet mode" right={quietLabel ? <span className="text-[12px] text-accent">until {quietLabel}</span> : undefined}>
        <div className="grid grid-cols-3 gap-1.5">
          <Choice label="30 min" on={false} onClick={() => onQuiet(30)} />
          <Choice label="1 hour" on={false} onClick={() => onQuiet(60)} />
          <Choice label="Resume" on={!quietLabel} onClick={() => onQuiet(null)} />
        </div>
      </Group>
      <Switch
        label="Start at login"
        on={!!autostart}
        onChange={(v) => {
          setAuto(v);
          void setAutostart(v);
        }}
      />
      <div className="glass-card flex flex-col gap-1 rounded-xl px-3 py-2 text-[12px]">
        <span className="text-[11px] tracking-[0.14em] text-muted uppercase">Keyboard shortcuts</span>
        <span>
          <kbd className="font-semibold">{kbd('T')}</kbd> start / pause, anywhere
        </span>
        <span>
          <kbd className="font-semibold">{kbd('F')}</kbd> show / hide the widget
        </span>
      </div>
    </div>
  );
}
