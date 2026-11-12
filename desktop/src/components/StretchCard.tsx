import type { Stretch, StretchStep } from '../core/stretches';

/** The stretch to do right now, shown during a desk break. */
export function StretchCard({ step, compact }: { step: StretchStep; compact?: boolean }) {
  const { stretch: s, index, count, left, switchSides } = step;
  const pct = Math.max(0, Math.min(100, ((s.sec - left) / s.sec) * 100));
  return (
    <section className="glass-card flex flex-col gap-1.5 rounded-2xl px-3.5 py-3" aria-live="polite">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-on-accent uppercase">{s.area}</span>
        <span className="flex-1 truncate text-[15px] font-semibold text-ink">{s.name}</span>
        <span className="text-[12px] text-muted tabular-nums">
          {index + 1}/{count}
        </span>
      </div>
      {!compact && <p className="m-0 text-[13px] leading-snug text-muted">{switchSides ? 'Switch sides now.' : s.how}</p>}
      <div className="flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-track">
          <div className="h-1 rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <span className="w-8 text-right text-[12px] text-muted tabular-nums">{Math.ceil(left)}s</span>
      </div>
    </section>
  );
}

/** Preview of the first stretch, shown while the alarm waits. */
export function StretchPreview({ stretch }: { stretch: Stretch }) {
  return (
    <p className="m-0 text-[13px] text-muted">
      First up: <span className="font-medium text-ink">{stretch.name}</span> · {stretch.how}
    </p>
  );
}
