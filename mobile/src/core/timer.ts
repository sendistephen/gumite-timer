/**
 * Flip timer core — pure, platform-free logic.
 * The same file lives in desktop/src/core/timer.ts. Keep the two in sync.
 *
 * The timer counts UP from 00:00 to a target, then fires an alarm.
 * Time is derived from timestamps (not from counting ticks), so it stays
 * correct when the app is backgrounded, the window is hidden, or the
 * device sleeps.
 */

export type Phase = 'warmup' | 'focus' | 'break' | 'cooldown';
export type Status = 'idle' | 'running' | 'paused' | 'done';

export interface Preset {
  id: string;
  name: string;
  subtitle: string;
  focusSec: number;
  /** 0 = no break phase */
  breakSec: number;
  /** 0 = unlimited cycles; otherwise number of focus rounds */
  rounds: number;
  /** true = flip straight into the next phase without waiting (workouts) */
  autoAdvance: boolean;
  focusLabel: string;
  breakLabel: string;
  /** optional warm-up before round 1 (0 = none) */
  warmupSec?: number;
  /** optional cool-down after the last round (0 = none) */
  cooldownSec?: number;
  /** true for workout-style presets: rounds, voice cues, workout log */
  workout?: boolean;
}

export const PRESETS: Preset[] = [
  {
    id: 'coding',
    name: 'Coding · anti-sitting',
    subtitle: 'Sit, then stand and stretch',
    focusSec: 45 * 60,
    breakSec: 5 * 60,
    rounds: 0,
    autoAdvance: false,
    focusLabel: 'Sitting',
    breakLabel: 'Stretch',
  },
  {
    id: 'pomodoro',
    name: 'Pomodoro',
    subtitle: 'Focus block, short break',
    focusSec: 25 * 60,
    breakSec: 5 * 60,
    rounds: 0,
    autoAdvance: false,
    focusLabel: 'Focus',
    breakLabel: 'Break',
  },
  {
    id: 'workout',
    name: 'Workout interval',
    subtitle: 'Work, rest · auto rounds',
    focusSec: 40,
    breakSec: 20,
    rounds: 8,
    autoAdvance: true,
    focusLabel: 'Work',
    breakLabel: 'Rest',
    workout: true,
  },
  {
    id: 'hold',
    name: 'Plank / hold',
    subtitle: 'Flip up, then beep',
    focusSec: 90,
    breakSec: 0,
    rounds: 1,
    autoAdvance: false,
    focusLabel: 'Hold',
    breakLabel: 'Rest',
    workout: true,
  },
  {
    id: 'custom',
    name: 'Custom intervals',
    subtitle: 'Warm-up, rounds, cool-down',
    warmupSec: 60,
    focusSec: 30,
    breakSec: 15,
    rounds: 6,
    cooldownSec: 60,
    autoAdvance: true,
    focusLabel: 'Work',
    breakLabel: 'Rest',
    workout: true,
  },
];

export interface PresetOverride {
  focusSec?: number;
  breakSec?: number;
  rounds?: number;
  warmupSec?: number;
  cooldownSec?: number;
}

export type PresetField = keyof PresetOverride;

export function resolvePreset(id: string, overrides: Record<string, PresetOverride> = {}): Preset {
  const base = PRESETS.find((p) => p.id === id) ?? PRESETS[0];
  return { ...base, ...(overrides[base.id] ?? {}) };
}

export interface TimerState {
  preset: Preset;
  phase: Phase;
  round: number;
  status: Status;
  /** epoch ms when the current running stretch began (null unless running) */
  startedAt: number | null;
  /** ms already counted before startedAt (from earlier runs/pauses) */
  carriedMs: number;
  /** seconds added by snooze */
  extraSec: number;
}

export type TimerEvent =
  | { type: 'phaseEnd'; from: Phase; to: Phase; round: number }
  | { type: 'done'; phase: Phase; round: number };

export function firstPhase(preset: Preset): Phase {
  return (preset.warmupSec ?? 0) > 0 ? 'warmup' : 'focus';
}

export function initialState(preset: Preset): TimerState {
  return { preset, phase: firstPhase(preset), round: 1, status: 'idle', startedAt: null, carriedMs: 0, extraSec: 0 };
}

export function phaseSec(preset: Preset, phase: Phase): number {
  switch (phase) {
    case 'warmup':
      return preset.warmupSec ?? 0;
    case 'focus':
      return preset.focusSec;
    case 'break':
      return preset.breakSec;
    case 'cooldown':
      return preset.cooldownSec ?? 0;
  }
}

export function labelFor(preset: Preset, phase: Phase): string {
  switch (phase) {
    case 'warmup':
      return 'Warm-up';
    case 'focus':
      return preset.focusLabel;
    case 'break':
      return preset.breakLabel;
    case 'cooldown':
      return 'Cool-down';
  }
}

/** Total length of a whole session (workouts), in seconds. */
export function sessionSec(p: Preset): number {
  const rounds = Math.max(1, p.rounds);
  return (p.warmupSec ?? 0) + rounds * p.focusSec + (rounds - 1) * p.breakSec + (p.cooldownSec ?? 0);
}

export function targetSec(s: TimerState): number {
  return phaseSec(s.preset, s.phase) + s.extraSec;
}

export function elapsedMs(s: TimerState, now: number): number {
  const live = s.status === 'running' && s.startedAt != null ? now - s.startedAt : 0;
  return Math.max(0, s.carriedMs + live);
}

/** Whole seconds shown on the flip cards, capped at the target. */
export function elapsedSec(s: TimerState, now: number): number {
  return Math.min(targetSec(s), Math.floor(elapsedMs(s, now) / 1000));
}

export function progress(s: TimerState, now: number): number {
  const t = targetSec(s);
  return t <= 0 ? 1 : Math.min(1, elapsedMs(s, now) / (t * 1000));
}

export function phaseLabel(s: TimerState): string {
  return labelFor(s.preset, s.phase);
}

/** What follows the current phase, or null when the session is over. */
export function nextPhase(preset: Preset, phase: Phase, round: number): { phase: Phase; round: number } | null {
  const cooldown = (preset.cooldownSec ?? 0) > 0 ? { phase: 'cooldown' as Phase, round } : null;
  const lastRound = preset.rounds > 0 && round >= preset.rounds;
  switch (phase) {
    case 'warmup':
      return { phase: 'focus', round: 1 };
    case 'focus':
      if (lastRound) return cooldown;
      if (preset.breakSec > 0) return { phase: 'break', round };
      return { phase: 'focus', round: round + 1 };
    case 'break':
      if (lastRound) return cooldown;
      return { phase: 'focus', round: round + 1 };
    case 'cooldown':
      return null;
  }
}

export function start(s: TimerState, now: number): TimerState {
  if (s.status === 'running') return s;
  if (s.status === 'done') return next(s, now);
  return { ...s, status: 'running', startedAt: now };
}

export function pause(s: TimerState, now: number): TimerState {
  if (s.status !== 'running') return s;
  return { ...s, status: 'paused', carriedMs: elapsedMs(s, now), startedAt: null };
}

export function toggle(s: TimerState, now: number): TimerState {
  return s.status === 'running' ? pause(s, now) : start(s, now);
}

export function reset(s: TimerState): TimerState {
  return initialState(s.preset);
}

/** Add time after the alarm (or while running) and keep flipping. */
export function snooze(s: TimerState, now: number, sec = 300): TimerState {
  const carried = elapsedMs(s, now);
  return { ...s, extraSec: s.extraSec + sec, status: 'running', startedAt: now, carriedMs: carried };
}

/** Move to the following phase and start it (used by "Start stretch" / "Back to work"). */
export function next(s: TimerState, now: number): TimerState {
  const n = nextPhase(s.preset, s.phase, s.round) ?? { phase: firstPhase(s.preset), round: 1 };
  return { ...s, phase: n.phase, round: n.round, status: 'running', startedAt: now, carriedMs: 0, extraSec: 0 };
}

/** Skip the break the alarm is offering and start the next focus block right away. */
export function skipBreak(s: TimerState, now: number): TimerState {
  return { ...s, phase: 'focus', round: s.round + 1, status: 'running', startedAt: now, carriedMs: 0, extraSec: 0 };
}

/** Restart the current preset from the top and start it running. */
export function restart(s: TimerState, now: number): TimerState {
  return { ...initialState(s.preset), status: 'running', startedAt: now };
}

/** Pause, but stop the clock at an earlier moment (e.g. when you actually walked away). */
export function pauseAt(s: TimerState, when: number): TimerState {
  if (s.status !== 'running') return s;
  return pause(s, Math.max(s.startedAt ?? when, when));
}

/**
 * Advance the clock. Returns the new state plus any events that happened
 * since the last tick (several, if the app was asleep through an auto-advancing workout).
 */
export function tick(s: TimerState, now: number): { state: TimerState; events: TimerEvent[] } {
  const events: TimerEvent[] = [];
  let cur = s;
  for (let guard = 0; guard < 500 && cur.status === 'running'; guard++) {
    const targetMs = targetSec(cur) * 1000;
    const el = elapsedMs(cur, now);
    if (el < targetMs) break;
    const n = nextPhase(cur.preset, cur.phase, cur.round);
    if (cur.preset.autoAdvance && n) {
      const overshoot = el - targetMs;
      events.push({ type: 'phaseEnd', from: cur.phase, to: n.phase, round: n.round });
      cur = { ...cur, phase: n.phase, round: n.round, startedAt: now - overshoot, carriedMs: 0, extraSec: 0 };
    } else {
      events.push({ type: 'done', phase: cur.phase, round: cur.round });
      cur = { ...cur, status: 'done', startedAt: null, carriedMs: targetMs };
    }
  }
  return { state: cur, events };
}

export interface UpcomingAlarm {
  at: number;
  title: string;
  body: string;
}

/** Every alarm the running timer will fire, for scheduling OS notifications. */
export function upcomingAlarms(s: TimerState, now: number, limit = 40): UpcomingAlarm[] {
  if (s.status !== 'running') return [];
  const out: UpcomingAlarm[] = [];
  let at = now + (targetSec(s) * 1000 - elapsedMs(s, now));
  let phase = s.phase;
  let round = s.round;
  const p = s.preset;
  while (out.length < limit) {
    const n = nextPhase(p, phase, round);
    if (p.autoAdvance && n) {
      out.push({ at, ...phaseCopy(p, n.phase, n.round) });
      phase = n.phase;
      round = n.round;
      at += phaseSec(p, phase) * 1000;
      continue;
    }
    out.push({ at, ...doneCopy(p, phase, n != null) });
    break;
  }
  return out;
}

/** Notification / voice copy when a workout moves into `phase`. */
export function phaseCopy(p: Preset, phase: Phase, round: number): { title: string; body: string } {
  switch (phase) {
    case 'break':
      return { title: `${p.breakLabel} — ${fmt(p.breakSec)}`, body: `Round ${round} done. Breathe.` };
    case 'cooldown':
      return { title: `Cool-down — ${fmt(p.cooldownSec ?? 0)}`, body: 'Last round done. Ease off.' };
    default:
      return { title: `${p.focusLabel} — round ${round}`, body: `Go! Round ${round}${p.rounds ? ` of ${p.rounds}` : ''}.` };
  }
}

export function doneCopy(p: Preset, phase: Phase, hasNext = true): { title: string; body: string } {
  if (!hasNext) return { title: 'Done!', body: `${p.name} complete. Nice work.` };
  if (phase === 'focus') {
    return p.breakSec > 0
      ? { title: `Time's up — ${p.breakLabel.toLowerCase()} for ${fmt(p.breakSec)}`, body: 'Stand up, move, rest your eyes.' }
      : { title: "Time's up", body: `${fmt(p.focusSec)} reached.` };
  }
  return { title: `${p.breakLabel} over`, body: `Back to it — next ${fmt(p.focusSec)} ${p.focusLabel.toLowerCase()}.` };
}

export const pad2 = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, '0');

/** Longest target the steppers allow (5 hours). */
export const MAX_TARGET_SEC = 5 * 3600;

/** "45:00", "05:00", or "1:30:00" once an hour or more. */
export function fmt(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

/** Stepper increment for a duration: fine for short holds, coarse for long sits. */
export function stepFor(sec: number, direction: 1 | -1): number {
  const probe = direction > 0 ? sec : sec - 1;
  if (probe < 120) return 5;
  if (probe < 3600) return 60;
  return 300;
}

/** Timers shorter than this show MIN:SEC on the big cards; longer ones show HR:MIN. */
export const SHORT_TIMER_SEC = 10 * 60;

export interface ClockFace {
  left: [string, string];
  right: [string, string];
  leftCaption: string;
  rightCaption: string;
  /** small seconds readout when the big cards show HR:MIN, otherwise null */
  seconds: string | null;
}

/**
 * What the two flip cards show. Like a bedside flip clock, long timers flip
 * hours and minutes (seconds tick quietly in the corner); short ones — workout
 * intervals, holds, stretch breaks — flip minutes and seconds.
 */
export function clockFace(sec: number, target: number): ClockFace {
  if (target < SHORT_TIMER_SEC) {
    const m = pad2(Math.min(99, Math.floor(sec / 60)));
    const s = pad2(sec % 60);
    return { left: [m[0], m[1]], right: [s[0], s[1]], leftCaption: 'MIN', rightCaption: 'SEC', seconds: null };
  }
  const h = pad2(Math.min(99, Math.floor(sec / 3600)));
  const m = pad2(Math.floor((sec % 3600) / 60));
  return { left: [h[0], h[1]], right: [m[0], m[1]], leftCaption: 'HR', rightCaption: 'MIN', seconds: pad2(sec % 60) };
}

// ---------- sounds ----------

export type AlarmSoundId = 'classic' | 'digital' | 'chime' | 'marimba' | 'arcade' | 'bowl';

export const ALARM_SOUNDS: { id: AlarmSoundId; name: string; hint: string }[] = [
  { id: 'chime', name: 'Chime', hint: 'Soft two-note bell' },
  { id: 'marimba', name: 'Marimba', hint: 'Warm, woody arpeggio' },
  { id: 'classic', name: 'Classic beep', hint: 'Three clear beeps' },
  { id: 'digital', name: 'Digital watch', hint: 'Sharp double chirps' },
  { id: 'arcade', name: 'Arcade', hint: 'Rising 8-bit run' },
  { id: 'bowl', name: 'Singing bowl', hint: 'Calm, long ring' },
];

export const DEFAULT_ALARM_SOUND: AlarmSoundId = 'chime';

export type FlipSoundId = 'soft' | 'tick' | 'paper';

export const FLIP_SOUNDS: { id: FlipSoundId; name: string }[] = [
  { id: 'soft', name: 'Soft flap' },
  { id: 'tick', name: 'Clock tick' },
  { id: 'paper', name: 'Paper' },
];

export const DEFAULT_FLIP_SOUND: FlipSoundId = 'soft';

// ---------- reminders / quiet mode ----------

/** When the alarm is ignored: ring again after these many seconds (escalation). */
export const NUDGE_AFTER_SEC = [120, 300] as const;

export function isQuiet(quietUntil: number | null | undefined, now: number): boolean {
  return quietUntil != null && (quietUntil === Infinity || quietUntil > now);
}
