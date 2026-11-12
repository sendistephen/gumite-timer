import * as S from '../core/stats';

interface Props {
  stats: S.StatsStore;
  goal: number;
  streak: number;
  statsPath: string | null;
  onGoal: (n: number) => void;
  onCopy: () => void;
  onDone: () => void;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="glass-card flex flex-col rounded-xl px-3 py-2">
      <span className="text-[10px] tracking-[0.14em] text-faint uppercase">{label}</span>
      <span className="text-xl font-semibold text-ink tabular-nums">{value}</span>
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </div>
  );
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function StatsPanel({ stats, goal, streak, statsPath, onGoal, onCopy, onDone }: Props) {
  const now = Date.now();
  const today = S.getDay(stats, now);
  const week = S.lastDays(stats, 7, now);
  const max = Math.max(goal, ...week.map((d) => d.breaksTaken), 1);
  const workouts = S.recentWorkouts(stats, 4);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Sitting" value={S.fmtDuration(today.focusSec)} />
        <Tile label="Breaks" value={`${today.breaksTaken}/${goal}`} hint={today.autoBreaks ? `${today.autoBreaks} auto` : undefined} />
        <Tile label="Streak" value={`${streak}d`} hint={streak ? 'goal days in a row' : 'hit your goal today'} />
      </div>
      <div className="flex gap-2 text-[12px] text-muted">
        <span>Snoozed {today.breaksSnoozed}</span>
        <span>·</span>
        <span>Skipped {today.breaksSkipped}</span>
      </div>

      <figure className="m-0 flex flex-col gap-1.5" aria-label="Stretch breaks, last 7 days">
        <figcaption className="text-[11px] tracking-[0.14em] text-muted uppercase">Last 7 days</figcaption>
        <div className="relative flex h-24 items-end gap-2">
          <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-glass-line" style={{ bottom: `${(goal / max) * 100}%` }} />
          {week.map((d) => {
            const hit = d.breaksTaken >= goal;
            return (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date}: ${d.breaksTaken} breaks, ${S.fmtDuration(d.focusSec)} sitting`}>
                <div className="flex h-[76px] w-full items-end">
                  <div
                    className={`w-full rounded-md ${hit ? 'bg-accent' : 'bg-glass-hover'}`}
                    style={{ height: `${Math.max(4, (d.breaksTaken / max) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-faint">{WEEKDAY[new Date(d.date + 'T12:00').getDay()]}</span>
              </div>
            );
          })}
        </div>
      </figure>

      <div className="flex items-center gap-2">
        <span className="flex-1 text-[11px] tracking-[0.14em] text-muted uppercase">Daily break goal</span>
        <button type="button" aria-label="Lower goal" onClick={() => onGoal(Math.max(1, goal - 1))} className="h-7 w-7 rounded-full border border-glass-line bg-glass hover:bg-glass-hover">
          −
        </button>
        <span className="w-6 text-center font-semibold tabular-nums">{goal}</span>
        <button type="button" aria-label="Raise goal" onClick={() => onGoal(Math.min(20, goal + 1))} className="h-7 w-7 rounded-full border border-glass-line bg-glass hover:bg-glass-hover">
          +
        </button>
      </div>

      {workouts.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] tracking-[0.14em] text-muted uppercase">Recent workouts</span>
          {workouts.map((w) => (
            <div key={w.at} className="flex justify-between text-[12px]">
              <span>{w.preset}</span>
              <span className="text-muted tabular-nums">
                {w.rounds} rounds · {S.fmtDuration(w.durationSec)} · {new Date(w.at).toLocaleDateString([], { day: 'numeric', month: 'short' })}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onCopy} className="h-10 flex-1 rounded-full border border-glass-line bg-glass text-sm hover:bg-glass-hover">
          Copy today's summary
        </button>
        <button type="button" onClick={onDone} className="h-10 flex-1 rounded-full bg-accent text-sm font-semibold text-on-accent hover:brightness-110">
          Done
        </button>
      </div>
      {statsPath && (
        <p className="m-0 truncate text-[10px] text-faint" title={statsPath}>
          Saved to {statsPath}
        </p>
      )}
    </div>
  );
}
