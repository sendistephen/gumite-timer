import AsyncStorage from '@react-native-async-storage/async-storage';
import { type AudioSource, setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as S from '../core/stats';
import * as St from '../core/stretches';
import * as T from '../core/timer';
import { type AlertMode, buzz, cancelAlarms, clearStatus, scheduleAlarms, setupNotifications, showStatus } from '../lib/alerts';

export interface Settings {
  presetId: string;
  overrides: Record<string, T.PresetOverride>;
  alert: AlertMode;
  alarmSound: T.AlarmSoundId;
  /** soft sound each time a big card flips */
  flipSound: boolean;
  flipStyle: T.FlipSoundId;
  /** spoken "3, 2, 1" and round calls */
  voice: boolean;
  /** ring again if the stretch alarm is ignored */
  escalate: boolean;
  dailyGoal: number;
}

const DEFAULT_SETTINGS: Settings = {
  presetId: 'coding',
  overrides: {},
  alert: 'both',
  alarmSound: T.DEFAULT_ALARM_SOUND,
  flipSound: true,
  flipStyle: T.DEFAULT_FLIP_SOUND,
  voice: true,
  escalate: true,
  dailyGoal: 6,
};
const KEY_SETTINGS = 'fliptimer/settings/v1';
const KEY_STATE = 'fliptimer/state/v1';
const KEY_STATS = 'fliptimer/stats/v1';
const KEY_EXTRA = 'fliptimer/extra/v1';
const KEEP_AWAKE_TAG = 'flip-timer';
const SNOOZE_SEC = 5 * 60;

const ALARM_FILES: Record<T.AlarmSoundId, AudioSource> = {
  chime: require('../../assets/sounds/alarm-chime.wav'),
  marimba: require('../../assets/sounds/alarm-marimba.wav'),
  classic: require('../../assets/sounds/alarm-classic.wav'),
  digital: require('../../assets/sounds/alarm-digital.wav'),
  arcade: require('../../assets/sounds/alarm-arcade.wav'),
  bowl: require('../../assets/sounds/alarm-bowl.wav'),
};
const FLIP_FILES: Record<T.FlipSoundId, AudioSource> = {
  soft: require('../../assets/sounds/flip-soft.wav'),
  tick: require('../../assets/sounds/flip-tick.wav'),
  paper: require('../../assets/sounds/flip-paper.wav'),
};
/** Flip sounds repeat all day — keep them quiet and in the background. */
const FLIP_VOLUME = 0.35;

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

function speak(text: string) {
  try {
    Speech.stop();
    Speech.speak(text, { rate: 1.0 });
  } catch {}
}

/** Small extra state that should survive restarts. */
interface Extra {
  quietUntil: number | null;
  stretchSeed: number;
  doneAt: number | null;
}

export function useFlipTimer() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [state, setState] = useState<T.TimerState>(() => T.initialState(T.resolvePreset('coding')));
  const [stats, setStats] = useState<S.StatsStore>(S.emptyStats);
  const [extra, setExtra] = useState<Extra>({ quietUntil: null, stretchSeed: 0, doneAt: null });
  const [now, setNow] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(false);

  const alarmPlayer = useAudioPlayer(ALARM_FILES[settings.alarmSound]);
  const flipPlayer = useAudioPlayer(FLIP_FILES[settings.flipStyle] ?? FLIP_FILES.soft);
  useEffect(() => {
    try {
      flipPlayer.volume = FLIP_VOLUME;
    } catch {}
  }, [flipPlayer]);
  const previewRef = useRef(false);
  const flipPreviewRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const extraRef = useRef(extra);
  extraRef.current = extra;

  // ---------- load & persist ----------
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
    (async () => {
      try {
        const [rawS, rawT, rawStats, rawX] = await Promise.all(
          [KEY_SETTINGS, KEY_STATE, KEY_STATS, KEY_EXTRA].map((k) => AsyncStorage.getItem(k)),
        );
        const s: Settings = rawS ? { ...DEFAULT_SETTINGS, ...JSON.parse(rawS) } : DEFAULT_SETTINGS;
        setSettings(s);
        if (rawStats) setStats(JSON.parse(rawStats));
        if (rawX) setExtra((x) => ({ ...x, ...JSON.parse(rawX) }));
        if (rawT) {
          // Catch up on whatever happened while the app was closed — silently.
          const saved = JSON.parse(rawT) as T.TimerState;
          setState(T.tick(saved, Date.now()).state);
        } else {
          setState(T.initialState(T.resolvePreset(s.presetId, s.overrides)));
        }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(KEY_SETTINGS, JSON.stringify(settings)).catch(() => {});
  }, [settings, loaded]);
  useEffect(() => {
    if (loaded) AsyncStorage.setItem(KEY_STATE, JSON.stringify(state)).catch(() => {});
  }, [state, loaded]);
  useEffect(() => {
    if (loaded) AsyncStorage.setItem(KEY_STATS, JSON.stringify(stats)).catch(() => {});
  }, [stats, loaded]);
  useEffect(() => {
    if (loaded) AsyncStorage.setItem(KEY_EXTRA, JSON.stringify(extra)).catch(() => {});
  }, [extra, loaded]);

  // ---------- sound ----------
  const ringAlarm = useCallback(() => {
    if (settingsRef.current.alert === 'vibrate') return;
    try {
      alarmPlayer.seekTo(0);
      alarmPlayer.play();
    } catch {}
  }, [alarmPlayer]);

  const stopAlarm = useCallback(() => {
    try {
      alarmPlayer.pause();
    } catch {}
  }, [alarmPlayer]);

  const clack = useCallback(() => {
    try {
      flipPlayer.seekTo(0);
      flipPlayer.play();
    } catch {}
  }, [flipPlayer]);

  const quietNow = (t: number) => T.isQuiet(extraRef.current.quietUntil, t);

  const fire = useCallback(
    (events: T.TimerEvent[], t: number) => {
      const last = events[events.length - 1];
      if (!last) return;
      const p = stateRef.current.preset;
      const hasNext = last.type === 'phaseEnd' || T.nextPhase(p, last.phase, last.round) != null;
      if (last.type === 'done' && p.workout && !hasNext) {
        setStats((st) => S.logWorkout(st, { at: t, preset: p.name, rounds: Math.max(1, p.rounds), durationSec: T.sessionSec(p) }));
      }
      if (last.type === 'done') {
        setExtra((x) => ({ ...x, doneAt: t, stretchSeed: last.phase === 'break' ? x.stretchSeed + 7 : x.stretchSeed }));
      }
      if (quietNow(t)) return;
      ringAlarm();
      buzz(settingsRef.current.alert, last.type === 'done');
      if (settingsRef.current.voice) {
        if (last.type === 'phaseEnd') speak(voiceLine(p, last.to, last.round));
        else if (!hasNext) speak('Done. Great work.');
        else if (last.phase === 'focus') speak(voiceLine(p, 'break', last.round));
        else speak(voiceLine(p, 'focus', last.round + 1));
      }
    },
    [ringAlarm],
  );

  // ---------- clock ----------
  const running = state.status === 'running';
  const lastTick = useRef(Date.now());
  const focusAcc = useRef(0);
  const lastSpoken = useRef(-1);
  useEffect(() => {
    if (!running) return;
    lastTick.current = Date.now();
    const id = setInterval(() => {
      const t = Date.now();
      const cur = stateRef.current;
      if (cur.phase === 'focus') focusAcc.current += Math.min(5, (t - lastTick.current) / 1000);
      lastTick.current = t;
      if (focusAcc.current >= 15) {
        const add = Math.floor(focusAcc.current);
        focusAcc.current -= add;
        setStats((st) => S.addFocus(st, t, add));
      }
      if (settingsRef.current.voice && cur.preset.workout && !quietNow(t)) {
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
    }, 200);
    return () => clearInterval(id);
  }, [running, fire]);

  // Back from background: catch up without re-ringing (the notification already rang).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      const t = Date.now();
      setState((cur) => T.tick(cur, t).state);
      setNow(t);
    });
    return () => sub.remove();
  }, []);

  // Keep the screen on while flipping.
  useEffect(() => {
    if (running) activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    else deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
  }, [running]);

  // ---------- reminders if the stretch alarm is ignored (while the app is open) ----------
  const breakWaiting = state.status === 'done' && state.phase === 'focus' && state.preset.breakSec > 0 && !state.preset.workout;
  useEffect(() => {
    if (!breakWaiting || !settings.escalate || extra.doneAt == null) return;
    const elapsed = (Date.now() - extra.doneAt) / 1000;
    const timers = T.NUDGE_AFTER_SEC.map((sec) =>
      setTimeout(
        () => {
          if (quietNow(Date.now())) return;
          ringAlarm();
          buzz(settingsRef.current.alert, true);
          if (settingsRef.current.voice) speak('Still sitting? Time for a stretch.');
        },
        Math.max(0, (sec - elapsed) * 1000),
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [breakWaiting, settings.escalate, extra.doneAt, ringAlarm]);

  // OS notifications as a backup for when the app is backgrounded or locked,
  // plus "still sitting?" reminders and the Android ongoing status.
  useEffect(() => {
    if (!loaded) return;
    const t = Date.now();
    const quiet = T.isQuiet(extra.quietUntil, t);
    if (state.status === 'running') {
      const alarms = T.upcomingAlarms(state, t);
      const last = alarms[alarms.length - 1];
      if (last && settings.escalate && state.phase === 'focus' && state.preset.breakSec > 0 && !state.preset.workout) {
        for (const sec of T.NUDGE_AFTER_SEC) {
          alarms.push({ at: last.at + sec * 1000, title: 'Still sitting?', body: 'Your stretch break is waiting. Stand up for a few minutes.' });
        }
      }
      const live = quiet ? alarms.filter((a) => a.at > (extra.quietUntil ?? 0)) : alarms;
      scheduleAlarms(live, settings.alert, settings.alarmSound);
      const ends = new Date(t + (T.targetSec(state) * 1000 - T.elapsedMs(state, t)));
      showStatus(
        `${T.phaseLabel(state)} · flipping to ${T.fmt(T.targetSec(state))}`,
        `Ends at ${ends.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${quiet ? ' · quiet mode' : ''}`,
      );
    } else {
      cancelAlarms();
      clearStatus();
    }
    // Only reschedule when the timeline changes, not on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, state.status, state.startedAt, state.phase, state.extraSec, state.preset, settings.alert, settings.alarmSound, settings.escalate, extra.quietUntil]);

  // ---------- actions ----------
  const apply = useCallback(
    (fn: (s: T.TimerState, t: number) => T.TimerState) => {
      stopAlarm();
      const t = Date.now();
      setNow(t);
      setExtra((x) => ({ ...x, doneAt: null }));
      setState((cur) => fn(cur, t));
    },
    [stopAlarm],
  );

  const actions = useMemo(
    () => ({
      toggle: () => {
        setupNotifications();
        apply(T.toggle);
      },
      start: () => {
        setupNotifications();
        apply(T.start);
      },
      reset: () => {
        const cur = stateRef.current;
        if (cur.status === 'done' && cur.phase === 'focus' && cur.preset.breakSec > 0 && !cur.preset.workout) {
          setStats((st) => S.bump(st, Date.now(), 'breaksSkipped'));
        }
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
        setSettings((s) => ({ ...s, [key]: value }));
        if (key === 'flipSound' && value) clack();
        if (key === 'voice' && value) speak('Voice coach on.');
      },
      pickFlip: (flipStyle: T.FlipSoundId) => {
        setSettings((s) => ({ ...s, flipStyle, flipSound: true }));
        flipPreviewRef.current = true; // play once the player has swapped to the new file
      },
      pickAlarm: (alarmSound: T.AlarmSoundId) => {
        setSettings((s) => ({ ...s, alarmSound }));
        previewRef.current = true;
      },
      quiet: (minutes: number | null) => {
        stopAlarm();
        setExtra((x) => ({ ...x, quietUntil: minutes == null ? null : Date.now() + minutes * 60_000 }));
      },
    }),
    [apply, clack, stopAlarm],
  );

  // Previews after the players have swapped to a newly picked file.
  useEffect(() => {
    if (!previewRef.current) return;
    previewRef.current = false;
    const id = setTimeout(() => {
      try {
        alarmPlayer.seekTo(0);
        alarmPlayer.play();
      } catch {}
    }, 150);
    return () => clearTimeout(id);
  }, [settings.alarmSound, alarmPlayer]);

  useEffect(() => {
    if (!flipPreviewRef.current) return;
    flipPreviewRef.current = false;
    const id = setTimeout(clack, 120);
    return () => clearTimeout(id);
  }, [settings.flipStyle, clack]);

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
    if (loaded && settingsRef.current.flipSound && !quietNow(Date.now())) clack();
  }, [cardKey, loaded, clack]);

  const p = state.preset;
  const done = state.status === 'done';
  const hasNext = T.nextPhase(p, state.phase, state.round) != null;
  const doneText = T.doneCopy(p, state.phase, hasNext);
  const roundText = p.rounds > 1 ? ` · round ${state.round}/${p.rounds}` : '';
  const quiet = T.isQuiet(extra.quietUntil, now);
  const quietLabel = quiet && extra.quietUntil ? new Date(extra.quietUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

  // Guided stretches during desk breaks (not workouts).
  const plan = useMemo(() => St.planStretches(p.breakSec, extra.stretchSeed), [p.breakSec, extra.stretchSeed]);
  const stretch = !p.workout && state.phase === 'break' && state.status !== 'idle' ? St.stretchAt(plan, sec) : null;

  return {
    loaded,
    settings,
    state,
    stats,
    actions,
    view: {
      face,
      progress: T.progress(state, now),
      target: T.fmt(target),
      running,
      done,
      breakWaiting,
      stretch,
      firstStretch: breakWaiting ? plan[0] : null,
      quietLabel,
      today: S.getDay(stats, now),
      streak: S.streak(stats, now, settings.dailyGoal),
      modeLabel: `${T.phaseLabel(state)}${roundText}`,
      statusText: quiet
        ? `Quiet until ${quietLabel}`
        : done
          ? doneText.title
          : running
            ? `${state.phase === 'focus' && p.breakSec > 0 && !p.workout ? p.breakLabel : 'Alarm'} at ${T.fmt(target)}`
            : state.status === 'paused'
              ? 'Paused'
              : 'Tap to start',
      doneTitle: doneText.title,
      nextLabel: !hasNext
        ? 'Start again'
        : `Start ${T.labelFor(p, T.nextPhase(p, state.phase, state.round)!.phase).toLowerCase()}`,
    },
  };
}
