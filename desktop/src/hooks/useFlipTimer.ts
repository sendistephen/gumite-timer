import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as S from '../core/stats';
import * as St from '../core/stretches';
import * as T from '../core/timer';
import { idleSeconds, inTauri, notify, prepareNotifications, saveStats, speak } from '../lib/native';
import { playAlarm, playFlip, stopAlarm, unlockAudio } from '../lib/sounds';

export type Corner = 'br' | 'bl' | 'tr' | 'tl';
export type Tint = 'clear' | 'medium' | 'solid';
export type AccentId = 'amber' | 'teal' | 'coral' | 'lime' | 'violet' | 'sky';

export const ACCENTS: { id: AccentId; hex: string }[] = [
  { id: 'amber', hex: '#f5b83d' },
  { id: 'teal', hex: '#2dd4bf' },
  { id: 'coral', hex: '#fb7185' },
  { id: 'lime', hex: '#a3e635' },
  { id: 'violet', hex: '#a78bfa' },
  { id: 'sky', hex: '#38bdf8' },
];

export interface Settings {
  presetId: string;
  overrides: Record<string, T.PresetOverride>;
  // sound
  sound: boolean;
  alarmSound: T.AlarmSoundId;
  flipSound: boolean;
  flipStyle: T.FlipSoundId;
  notifications: boolean;
  voice: boolean;
  // behaviour
  autoBreak: boolean;
  awayMin: number;
  escalate: boolean;
  dailyGoal: number;
  // look
  corner: Corner;
  compact: boolean;
  theme: 'dark' | 'light';
  accent: AccentId;
  tint: Tint;
}

const DEFAULT_SETTINGS: Settings = {
  presetId: 'coding',
  overrides: {},
  sound: true,
  alarmSound: T.DEFAULT_ALARM_SOUND,
  flipSound: true,
  flipStyle: T.DEFAULT_FLIP_SOUND,
  notifications: true,
  voice: true,
  autoBreak: true,
  awayMin: 3,
  escalate: true,
  dailyGoal: 6,
  corner: 'br',
  compact: false,
  theme: 'dark',
  accent: 'amber',
  tint: 'medium',
};

const KEY_SETTINGS = 'fliptimer/settings/v1';
const KEY_STATE = 'fliptimer/state/v1';
const KEY_STATS = 'fliptimer/stats/v1';
const KEY_QUIET = 'fliptimer/quiet/v1';
const KEY_SEED = 'fliptimer/stretch-seed/v1';
const SNOOZE_SEC = 5 * 60;

function load<V>(key: string, fallback: V): V {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? { ...fallback, ...v } : v;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/** What the voice coach says when a phase starts. */
function voiceLine(p: T.Preset, phase: T.Phase, round: number): string {
  switch (phase) {
    case 'warmup':
      return 'Warm up.';
    case 'break':
      return p.workout ? 'Rest.' : `Time to stand up and ${p.breakLabel.toLowerCase()}.`;
    case 'cooldown':
      return 'Cool down. Last stretch.';
    default:
      return p.workout ? `Round ${round}${p.rounds ? ` of ${p.rounds}` : ''}. Go!` : 'Back to it.';
  }
}

export function useFlipTimer(onAlarm?: (e: T.TimerEvent) => void) {
  const [settings, setSettings] = useState<Settings>(() => load(KEY_SETTINGS, DEFAULT_SETTINGS));
  const [state, setState] = useState<T.TimerState>(() => {
    const fresh = T.initialState(T.resolvePreset(settings.presetId, settings.overrides));
    const saved = load<T.TimerState | null>(KEY_STATE, null);
    // Catch up on time that passed while the app was closed (silently).
    return saved && saved.preset ? T.tick(saved, Date.now()).state : fresh;
  });
  const [stats, setStats] = useState<S.StatsStore>(() => load(KEY_STATS, S.emptyStats()));
  const [quietUntil, setQuietUntil] = useState<number | null>(() => load<number | null>(KEY_QUIET, null));
  const [away, setAway] = useState<{ since: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [doneAt, setDoneAt] = useState<number | null>(null);
  const [nudge, setNudge] = useState<0 | 1 | 2>(0);
  const [statsPath, setStatsPath] = useState<string | null>(null);
  // Which stretches the next/current break uses; fixed per break so the preview matches.
  const [stretchSeed, setStretchSeed] = useState<number>(() => load<number>(KEY_SEED, 0));
  const [now, setNow] = useState(() => Date.now());

  const stateRef = useRef(state);
  stateRef.current = state;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const quietRef = useRef(quietUntil);
  quietRef.current = quietUntil;
  const alarmRef = useRef(onAlarm);
  alarmRef.current = onAlarm;
  const awayRef = useRef(away);
  awayRef.current = away;
  const pendingAlarm = useRef<T.TimerEvent | null>(null);

  // ---------- persistence ----------
  useEffect(() => save(KEY_SETTINGS, settings), [settings]);
  useEffect(() => save(KEY_STATE, state), [state]);
  useEffect(() => save(KEY_QUIET, quietUntil), [quietUntil]);
  useEffect(() => save(KEY_SEED, stretchSeed), [stretchSeed]);
  useEffect(() => {
    save(KEY_STATS, stats);
    // Also mirror to a file other tools (e.g. a daily-report app) can read.
    const id = window.setTimeout(() => {
      void saveStats(JSON.stringify(stats, null, 2)).then((p) => p && setStatsPath(p));
    }, 1500);
    return () => window.clearTimeout(id);
  }, [stats]);

  const showNotice = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((n) => (n === text ? null : n)), 9000);
  }, []);

  // ---------- alarms ----------
  const ring = useCallback((e: T.TimerEvent, reminder = false) => {
    const s = settingsRef.current;
    const p = stateRef.current.preset;
    if (s.sound) void playAlarm(s.alarmSound, e.type === 'done' ? 2 : 1);
    if (s.voice) {
      if (e.type === 'phaseEnd') speak(voiceLine(p, e.to, e.round));
      else if (T.nextPhase(p, e.phase, e.round) == null) speak('Done. Great work.');
      else if (e.phase === 'focus') speak(reminder ? 'Still sitting? Time for a stretch.' : voiceLine(p, 'break', e.round));
      else speak(voiceLine(p, 'focus', e.round + 1));
    }
    if (s.notifications) {
      if (reminder) void notify('Still sitting?', 'Your stretch break is waiting. Stand up for a few minutes.');
      else if (e.type === 'done') {
        const copy = T.doneCopy(p, e.phase, T.nextPhase(p, e.phase, e.round) != null);
        void notify(copy.title, copy.body);
      } else {
        const copy = T.phaseCopy(p, e.to, e.round);
        void notify(copy.title, copy.body);
      }
    }
  }, []);

  const fire = useCallback(
    (events: T.TimerEvent[], t: number) => {
      const last = events[events.length - 1];
      if (!last) return;
      const p = stateRef.current.preset;
      // Workout finished → log it.
      if (last.type === 'done' && p.workout && T.nextPhase(p, last.phase, last.round) == null) {
        setStats((st) => S.logWorkout(st, { at: t, preset: p.name, rounds: Math.max(1, p.rounds), durationSec: T.sessionSec(p) }));
      }
      if (last.type === 'done') setDoneAt(t);
      if (last.type === 'done' && last.phase === 'break') setStretchSeed((n) => n + 7); // fresh set next time
      if (T.isQuiet(quietRef.current, t)) {
        pendingAlarm.current = last; // ring once quiet time ends
      } else {
        ring(last);
      }
      alarmRef.current?.(last);
    },
    [ring],
  );

  // ---------- clock ----------
  const running = state.status === 'running';
  const lastTick = useRef(Date.now());
  const focusAcc = useRef(0);
  const lastSpoken = useRef(-1);
  useEffect(() => {
    if (!running) return;
    lastTick.current = Date.now();
    const id = window.setInterval(() => {
      const t = Date.now();
      const cur = stateRef.current;
      // Sitting-time accounting (capped so a sleeping laptop doesn't count).
      if (cur.phase === 'focus') focusAcc.current += Math.min(5, (t - lastTick.current) / 1000);
      lastTick.current = t;
      if (focusAcc.current >= 15) {
        const add = Math.floor(focusAcc.current);
        focusAcc.current -= add;
        setStats((st) => S.addFocus(st, t, add));
      }
      // Voice countdown in the last 3 seconds of a workout phase.
      if (settingsRef.current.voice && cur.preset.workout && !T.isQuiet(quietRef.current, t)) {
        const left = Math.ceil(T.targetSec(cur) - T.elapsedMs(cur, t) / 1000);
        if (left >= 1 && left <= 3 && left !== lastSpoken.current && T.targetSec(cur) >= 10) {
          lastSpoken.current = left;
          speak(String(left));
        }
        if (left > 3) lastSpoken.current = -1;
      }
      const { state: next, events } = T.tick(cur, t);
      if (events.length) {
        setState(next);
        fire(events, t);
      }
      setNow(t);
    }, 250);
    return () => window.clearInterval(id);
  }, [running, fire]);

  // ---------- quiet mode (meetings) ----------
  useEffect(() => {
    if (quietUntil == null) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      if (T.isQuiet(quietRef.current, t)) return;
      setQuietUntil(null);
      if (pendingAlarm.current && stateRef.current.status === 'done') ring(pendingAlarm.current);
      pendingAlarm.current = null;
    }, 5000);
    return () => window.clearInterval(id);
  }, [quietUntil, ring]);

  // ---------- reminders if the alarm is ignored ----------
  const breakWaiting = state.status === 'done' && state.phase === 'focus' && state.preset.breakSec > 0;
  useEffect(() => {
    if (!breakWaiting || doneAt == null || !settings.escalate) {
      setNudge(0);
      return;
    }
    const [first, second] = T.NUDGE_AFTER_SEC;
    const ev: T.TimerEvent = { type: 'done', phase: 'focus', round: stateRef.current.round };
    const elapsed = (Date.now() - doneAt) / 1000;
    const timers: number[] = [];
    const at = (sec: number, fn: () => void) => timers.push(window.setTimeout(fn, Math.max(0, (sec - elapsed) * 1000)));
    at(first, () => {
      setNudge(1);
      if (!T.isQuiet(quietRef.current, Date.now())) ring(ev, true);
    });
    at(second, () => {
      if (T.isQuiet(quietRef.current, Date.now())) return;
      setNudge(2);
      ring(ev, true);
    });
    return () => timers.forEach((x) => window.clearTimeout(x));
  }, [breakWaiting, doneAt, settings.escalate, ring]);

  // ---------- away from the computer = break taken ----------
  const watchAway = settings.autoBreak && inTauri && (away != null || (state.phase === 'focus' && (running || state.status === 'done')));
  useEffect(() => {
    if (!watchAway) return;
    const id = window.setInterval(async () => {
      const idle = await idleSeconds();
      const t = Date.now();
      const cur = stateRef.current;
      if (!awayRef.current) {
        if (idle >= settingsRef.current.awayMin * 60 && cur.phase === 'focus' && (cur.status === 'running' || cur.status === 'done')) {
          const since = t - idle * 1000;
          setAway({ since });
          stopAlarm();
          if (cur.status === 'running') setState(T.pauseAt(cur, since));
        }
      } else if (idle < 3) {
        const mins = Math.max(1, Math.round((t - awayRef.current.since) / 60000));
        setAway(null);
        setDoneAt(null);
        setStats((st) => S.bump(S.bump(st, t, 'autoBreaks'), t, 'breaksTaken'));
        setState((s) => T.restart(s, t));
        showNotice(`Welcome back — ${mins} min away counted as a break.`);
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [watchAway, showNotice]);

  // ---------- actions ----------
  const apply = useCallback((fn: (s: T.TimerState, t: number) => T.TimerState) => {
    unlockAudio();
    stopAlarm();
    void prepareNotifications();
    const t = Date.now();
    setNow(t);
    setDoneAt(null);
    setNudge(0);
    setState((cur) => fn(cur, t));
  }, []);

  const actions = useMemo(
    () => ({
      toggle: () => apply(T.toggle),
      start: () => apply(T.start),
      reset: () => {
        const cur = stateRef.current;
        if (cur.status === 'done' && cur.phase === 'focus' && cur.preset.breakSec > 0) setStats((st) => S.bump(st, Date.now(), 'breaksSkipped'));
        apply((s) => T.reset(s));
      },
      snooze: () => {
        const cur = stateRef.current;
        if (cur.status === 'done' && cur.phase === 'focus') setStats((st) => S.bump(st, Date.now(), 'breaksSnoozed'));
        apply((s, t) => T.snooze(s, t, SNOOZE_SEC));
      },
      next: () => {
        const cur = stateRef.current;
        const n = T.nextPhase(cur.preset, cur.phase, cur.round);
        if (cur.phase === 'focus' && n?.phase === 'break' && !cur.preset.workout) setStats((st) => S.bump(st, Date.now(), 'breaksTaken'));
        if (settingsRef.current.voice && n) speak(voiceLine(cur.preset, n.phase, n.round));
        apply(T.next);
      },
      skipBreak: () => {
        setStats((st) => S.bump(st, Date.now(), 'breaksSkipped'));
        apply(T.skipBreak);
      },
      selectPreset: (id: string) => {
        setSettings((s) => ({ ...s, presetId: id }));
        setState(T.initialState(T.resolvePreset(id, settingsRef.current.overrides)));
      },
      adjust: (id: string, field: T.PresetField, delta: 1 | -1) => {
        const cur = T.resolvePreset(id, settingsRef.current.overrides);
        const v = (cur[field] as number | undefined) ?? 0;
        let nextV: number;
        if (field === 'rounds') nextV = Math.min(50, Math.max(1, v + delta));
        else {
          const min = field === 'focusSec' ? 5 : 0;
          nextV = Math.min(T.MAX_TARGET_SEC, Math.max(min, v + delta * T.stepFor(v, delta)));
        }
        const overrides = { ...settingsRef.current.overrides, [id]: { ...settingsRef.current.overrides[id], [field]: nextV } };
        setSettings((s) => ({ ...s, overrides }));
        if (stateRef.current.preset.id === id) setState(T.initialState(T.resolvePreset(id, overrides)));
      },
      set: <K extends keyof Settings>(key: K, value: Settings[K]) => {
        unlockAudio();
        setSettings((s) => ({ ...s, [key]: value }));
        if (key === 'flipSound' && value) playFlip(settingsRef.current.flipStyle);
        if (key === 'voice' && value) speak('Voice coach on.');
      },
      pickFlip: (flipStyle: T.FlipSoundId) => {
        unlockAudio();
        setSettings((s) => ({ ...s, flipStyle, flipSound: true }));
        playFlip(flipStyle);
      },
      pickAlarm: (id: T.AlarmSoundId) => {
        unlockAudio();
        setSettings((s) => ({ ...s, alarmSound: id }));
        void playAlarm(id, 1);
      },
      quiet: (minutes: number | null) => {
        stopAlarm();
        setNudge(0);
        setQuietUntil(minutes == null ? null : Date.now() + minutes * 60_000);
        if (minutes == null && pendingAlarm.current && stateRef.current.status === 'done') ring(pendingAlarm.current);
        if (minutes == null) pendingAlarm.current = null;
      },
      copySummary: async () => {
        const line = `Flip Timer — ${S.summaryLine(S.getDay(stats, Date.now()))}`;
        try {
          await navigator.clipboard.writeText(line);
          showNotice('Summary copied — paste it into your report.');
        } catch {
          showNotice(line);
        }
      },
    }),
    [apply, ring, stats, showNotice],
  );

  // ---------- view model ----------
  const sec = T.elapsedSec(state, now);
  const target = T.targetSec(state);
  const face = T.clockFace(sec, target);

  // Flip sound whenever a big card changes (not for the small seconds readout).
  const cardKey = face.left.join('') + face.right.join('');
  const lastCardKey = useRef(cardKey);
  useEffect(() => {
    if (cardKey === lastCardKey.current) return;
    lastCardKey.current = cardKey;
    if (settingsRef.current.flipSound && !T.isQuiet(quietRef.current, Date.now())) playFlip(settingsRef.current.flipStyle);
  }, [cardKey]);

  const p = state.preset;
  const done = state.status === 'done';
  const hasNext = T.nextPhase(p, state.phase, state.round) != null;
  const doneText = T.doneCopy(p, state.phase, hasNext);
  const today = S.getDay(stats, now);

  // Guided stretches during desk breaks (not during workouts).
  const plan = useMemo(() => St.planStretches(p.breakSec, stretchSeed), [p.breakSec, stretchSeed]);
  const stretch = !p.workout && state.phase === 'break' && state.status !== 'idle' ? St.stretchAt(plan, sec) : null;
  const firstStretch = !p.workout && breakWaiting ? plan[0] : null;

  const quiet = T.isQuiet(quietUntil, now);
  const quietLabel = quiet && quietUntil ? new Date(quietUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

  return {
    settings,
    state,
    actions,
    stats,
    statsPath,
    view: {
      presetName: p.name,
      face,
      clock: T.fmt(sec),
      progress: T.progress(state, now),
      target: T.fmt(target),
      running,
      done,
      breakWaiting,
      nudge,
      away: away != null,
      notice,
      quietLabel,
      stretch,
      firstStretch,
      today,
      streak: S.streak(stats, now, settings.dailyGoal),
      modeLabel: `${T.phaseLabel(state)}${p.rounds > 1 ? ` · ${state.round}/${p.rounds}` : ''}`,
      statusText: away
        ? 'Away — paused'
        : quiet
          ? `Quiet until ${quietLabel}`
          : done
            ? "Time's up"
            : running
              ? `Flipping to ${T.fmt(target)}`
              : state.status === 'paused'
                ? 'Paused'
                : 'Ready',
      doneTitle: doneText.title,
      nextLabel: !hasNext ? 'Start again' : state.phase === 'focus' && p.breakSec > 0 ? `Start ${p.breakLabel.toLowerCase()}` : `Start ${T.labelFor(p, T.nextPhase(p, state.phase, state.round)!.phase).toLowerCase()}`,
    },
  };
}
