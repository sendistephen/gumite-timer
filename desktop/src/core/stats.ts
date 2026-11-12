/**
 * Daily stats, streaks and the workout log. Pure functions over a plain JSON
 * store, so each app can persist it however it likes.
 * The same file lives in mobile/src/core/stats.ts. Keep the two in sync.
 */

export interface WorkoutLog {
  at: number;
  preset: string;
  rounds: number;
  durationSec: number;
}

export interface DayStats {
  date: string;
  /** seconds spent in a running focus/sitting phase */
  focusSec: number;
  breaksTaken: number;
  breaksSnoozed: number;
  breaksSkipped: number;
  /** breaks detected automatically because you were away from the computer */
  autoBreaks: number;
  workouts: WorkoutLog[];
}

export interface StatsStore {
  v: 1;
  days: Record<string, DayStats>;
}

export type Counter = 'breaksTaken' | 'breaksSnoozed' | 'breaksSkipped' | 'autoBreaks';

export const emptyStats = (): StatsStore => ({ v: 1, days: {} });

const KEEP_DAYS = 120;

export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function blank(date: string): DayStats {
  return { date, focusSec: 0, breaksTaken: 0, breaksSnoozed: 0, breaksSkipped: 0, autoBreaks: 0, workouts: [] };
}

function withDay(store: StatsStore, ts: number, fn: (d: DayStats) => DayStats): StatsStore {
  const key = dayKey(ts);
  const days = { ...store.days, [key]: fn({ ...blank(key), ...store.days[key] }) };
  const keys = Object.keys(days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete days[k];
  return { v: 1, days };
}

export function getDay(store: StatsStore, ts: number): DayStats {
  const key = dayKey(ts);
  return { ...blank(key), ...store.days[key] };
}

export function addFocus(store: StatsStore, ts: number, sec: number): StatsStore {
  if (sec <= 0) return store;
  return withDay(store, ts, (d) => ({ ...d, focusSec: d.focusSec + sec }));
}

export function bump(store: StatsStore, ts: number, field: Counter, by = 1): StatsStore {
  return withDay(store, ts, (d) => ({ ...d, [field]: d[field] + by }));
}

export function logWorkout(store: StatsStore, w: WorkoutLog): StatsStore {
  return withDay(store, w.at, (d) => ({ ...d, workouts: [...d.workouts, w].slice(-50) }));
}

/** The last `n` days, oldest first, including empty days. */
export function lastDays(store: StatsStore, n: number, today: number): DayStats[] {
  const out: DayStats[] = [];
  const base = new Date(today);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i, 12);
    out.push(getDay(store, d.getTime()));
  }
  return out;
}

/**
 * Days in a row that hit the daily break goal. Today only counts once it's
 * reached, so an unfinished today never breaks the streak.
 */
export function streak(store: StatsStore, today: number, goal: number): number {
  const base = new Date(today);
  let count = 0;
  for (let i = 0; i < KEEP_DAYS; i++) {
    const d = getDay(store, new Date(base.getFullYear(), base.getMonth(), base.getDate() - i, 12).getTime());
    if (d.breaksTaken >= goal) count++;
    else if (i > 0) break;
  }
  return count;
}

export function recentWorkouts(store: StatsStore, limit = 10): WorkoutLog[] {
  return Object.values(store.days)
    .flatMap((d) => d.workouts)
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);
}

export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** One line for a daily report, e.g. "Focus 5h 20m · 6 stretch breaks (2 auto) · 1 snoozed". */
export function summaryLine(d: DayStats): string {
  const parts = [`Focus ${fmtDuration(d.focusSec)}`, `${d.breaksTaken} stretch break${d.breaksTaken === 1 ? '' : 's'}${d.autoBreaks ? ` (${d.autoBreaks} auto)` : ''}`];
  if (d.breaksSnoozed) parts.push(`${d.breaksSnoozed} snoozed`);
  if (d.breaksSkipped) parts.push(`${d.breaksSkipped} skipped`);
  if (d.workouts.length) parts.push(`${d.workouts.length} workout${d.workouts.length === 1 ? '' : 's'}`);
  return parts.join(' · ');
}
