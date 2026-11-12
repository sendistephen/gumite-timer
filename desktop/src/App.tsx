import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FlipDigit } from './components/FlipDigit';
import { SettingsPanel } from './components/SettingsPanel';
import { StatsPanel } from './components/StatsPanel';
import { StretchCard, StretchPreview } from './components/StretchCard';
import { ACCENTS, useFlipTimer } from './hooks/useFlipTimer';
import { type Anchor, dock, type GlassMode, getGlassMode, inTauri, onShown, onTrayAction, setGlass, setTray } from './lib/native';

const COLLAPSED = { w: 176, h: 52 } as const;
/** Space to leave above the widget so it never runs off the top of the screen. */
const SCREEN_GAP = 48;
const PANEL_RADIUS = 20; // matches GLASS_RADIUS in src-tauri/src/lib.rs

const Icon = {
  play: <path d="M8 5l11 7-11 7z" />,
  pause: (
    <>
      <path d="M8 5v14" />
      <path d="M16 5v14" />
    </>
  ),
  reset: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </>
  ),
  down: <path d="M6 9l6 6 6-6" />,
  up: <path d="M6 15l6-6 6 6" />,
  sliders: (
    <>
      <path d="M4 7h10" />
      <path d="M18 7h2" />
      <circle cx="16" cy="7" r="2" />
      <path d="M4 17h2" />
      <path d="M10 17h10" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
  chart: (
    <>
      <path d="M5 20V11" />
      <path d="M12 20V5" />
      <path d="M19 20v-6" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
};

function Svg({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function IconButton({ label, onClick, children, active }: { label: string; onClick: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] hover:bg-glass-hover hover:text-ink ${active ? 'bg-glass text-ink' : 'text-muted'}`}
    >
      {children}
    </button>
  );
}

type Panel = 'timer' | 'settings' | 'stats';

export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [panel, setPanel] = useState<Panel>('timer');
  const [shownKey, setShownKey] = useState(0);
  const [glass, setGlassMode] = useState<GlassMode>('none');

  const { settings, actions, view, stats, statsPath } = useFlipTimer((e) => {
    // Pop the widget open whenever it has something to say.
    if (e.type === 'done') {
      setCollapsed(false);
      setPanel('timer');
    }
  });

  const nudging = view.nudge === 2 && !collapsed;
  const compact = settings.compact && !nudging;
  const width = nudging ? 440 : compact ? 316 : 372;
  const card = compact ? { h: 88, dw: 50, dh: 74 } : nudging ? { h: 124, dw: 72, dh: 106 } : { h: 108, dw: 62, dh: 92 };

  // Theme, tint, accent → CSS variables on <html>.
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = settings.theme;
    el.dataset.tint = settings.tint;
    el.style.setProperty('--accent', ACCENTS.find((a) => a.id === settings.accent)?.hex ?? '#f5b83d');
  }, [settings.theme, settings.tint, settings.accent]);

  // Native blur: vibrancy (macOS) / acrylic (Windows) / none → CSS fallback.
  useEffect(() => {
    document.documentElement.dataset.glass = 'none';
    void getGlassMode().then((g) => {
      setGlassMode(g);
      document.documentElement.dataset.glass = g;
    });
  }, []);

  // The window is sized to whatever the panel actually needs (measured), so
  // nothing is ever cut off — fonts, OS scaling and future rows all just fit.
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentH, setContentH] = useState(274);
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const main = el.parentElement!;
    const measure = () => {
      const cs = getComputedStyle(main);
      const chrome = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
      const maxH = Math.max(200, window.screen.availHeight - SCREEN_GAP);
      setContentH(Math.min(maxH, Math.ceil(el.getBoundingClientRect().height + chrome)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapsed, shownKey]);

  const size = collapsed ? COLLAPSED : { w: width, h: contentH };
  const anchor: Anchor = nudging ? 'center' : settings.corner;

  useEffect(() => {
    void dock(size.w, size.h, true, anchor);
  }, [size.w, size.h, anchor]);

  // Windows 11 rounds the window itself (8px); macOS blur follows our shape.
  const radius = glass === 'acrylic' ? 8 : collapsed ? COLLAPSED.h / 2 : PANEL_RADIUS;
  useEffect(() => {
    void setGlass(radius, settings.theme === 'light');
  }, [radius, settings.theme]);

  // Menu-bar / tray readout.
  useEffect(() => {
    const title = view.away ? 'Away' : view.done ? "Time's up" : view.running || view.progress > 0 ? view.clock : '';
    void setTray(title, `Flip Timer — ${view.modeLabel} ${view.clock} / ${view.target}`);
  }, [view.clock, view.done, view.running, view.progress, view.modeLabel, view.target, view.away]);

  // Tray menu & global shortcuts → actions.
  useEffect(() => {
    const off = onTrayAction((a) => {
      if (a === 'toggle-timer') actions.toggle();
      if (a === 'reset') actions.reset();
      if (a === 'snooze') actions.snooze();
      if (a === 'next') actions.next();
      if (a === 'quiet-30') actions.quiet(30);
      if (a === 'quiet-60') actions.quiet(60);
      if (a === 'quiet-off') actions.quiet(null);
      if (a === 'settings' || a === 'stats') {
        setCollapsed(false);
        setPanel(a);
      }
    });
    const off2 = onShown(() => setShownKey((k) => k + 1));
    return () => {
      void off.then((f) => f());
      void off2.then((f) => f());
    };
  }, [actions]);

  // Ignored alarm → open up and show the timer.
  useEffect(() => {
    if (view.nudge > 0) {
      setCollapsed(false);
      setPanel('timer');
    }
  }, [view.nudge]);

  // In a plain browser, pin the widget to the corner of a page for development.
  const frame: CSSProperties = inTauri ? { width: '100%', height: '100%' } : { position: 'fixed', right: 16, bottom: 16, width: size.w };
  useEffect(() => {
    if (!inTauri) document.body.style.background = '#2b3442';
  }, []);

  const digitColor = view.done ? 'var(--color-accent)' : 'var(--color-digit)';
  const dotColor = view.away ? 'var(--color-faint)' : view.running || view.done ? 'var(--color-accent)' : 'var(--color-faint)';

  if (collapsed) {
    return (
      <div style={{ ...frame, height: inTauri ? '100%' : COLLAPSED.h }}>
        <button
          key={`c${shownKey}`}
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand timer widget"
          className="glass flex h-full w-full animate-slide-up items-center justify-center gap-2.5 font-sans text-ink"
          style={{ borderRadius: radius }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: dotColor }} />
          <span className="text-xl font-semibold tabular-nums" style={{ color: digitColor }}>
            {view.clock}
          </span>
          <Svg size={16}>{Icon.up}</Svg>
        </button>
      </div>
    );
  }

  const showTimer = panel === 'timer';

  return (
    <div style={frame}>
      <main
        key={`m${shownKey}`}
        className={`glass h-full w-full animate-slide-up overflow-y-auto px-4 pt-3.5 pb-4 font-sans text-ink ${view.done ? 'glass-ring' : ''}`}
        style={{ borderRadius: radius }}
      >
        <div ref={contentRef} className="flex flex-col gap-3">
          <header className="flex h-9 items-center gap-1.5">
            <span className={`ml-0.5 h-2 w-2 shrink-0 rounded-full ${view.done ? 'animate-pulse-dot' : ''}`} style={{ background: dotColor }} />
            <span className="truncate text-xs tracking-[0.14em] text-muted uppercase">
              {panel === 'settings' ? 'Settings' : panel === 'stats' ? 'Today' : view.modeLabel}
            </span>
            <span className="flex-1" />
            {showTimer && !compact && <span className="truncate text-[13px] text-muted">{view.statusText}</span>}
            {view.quietLabel && showTimer && (
              <IconButton label={`Quiet until ${view.quietLabel} — tap to resume alerts`} onClick={() => actions.quiet(null)} active>
                <Svg size={16}>{Icon.moon}</Svg>
              </IconButton>
            )}
            <IconButton label={panel === 'stats' ? 'Close stats' : 'Stats'} onClick={() => setPanel(panel === 'stats' ? 'timer' : 'stats')} active={panel === 'stats'}>
              <Svg>{Icon.chart}</Svg>
            </IconButton>
            <IconButton label={panel === 'settings' ? 'Close settings' : 'Settings'} onClick={() => setPanel(panel === 'settings' ? 'timer' : 'settings')} active={panel === 'settings'}>
              <Svg>{Icon.sliders}</Svg>
            </IconButton>
            <IconButton
              label="Collapse widget"
              onClick={() => {
                setPanel('timer');
                setCollapsed(true);
              }}
            >
              <Svg>{Icon.down}</Svg>
            </IconButton>
          </header>

          {panel === 'settings' && (
            <SettingsPanel
              settings={settings}
              quietLabel={view.quietLabel}
              onSelect={actions.selectPreset}
              onAdjust={actions.adjust}
              onSet={actions.set}
              onPickFlip={actions.pickFlip}
              onPickAlarm={actions.pickAlarm}
              onQuiet={actions.quiet}
              onDone={() => setPanel('timer')}
            />
          )}

          {panel === 'stats' && (
            <StatsPanel
              stats={stats}
              goal={settings.dailyGoal}
              streak={view.streak}
              statsPath={statsPath}
              onGoal={(n) => actions.set('dailyGoal', n)}
              onCopy={actions.copySummary}
              onDone={() => setPanel('timer')}
            />
          )}

          {showTimer && (
            <>
              {nudging && <p className="m-0 text-lg font-semibold text-ink">You've been sitting a while. Stand up and stretch for a few minutes.</p>}
              <button type="button" onClick={view.done ? undefined : actions.toggle} aria-label={view.running ? 'Pause' : 'Start'} className="flex gap-3">
                {[
                  { pair: view.face.left, caption: view.face.leftCaption, corner: null },
                  { pair: view.face.right, caption: view.face.rightCaption, corner: view.face.seconds },
                ].map((c, i) => (
                  <div key={i} className="glass-card relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl" style={{ height: card.h }}>
                    <FlipDigit value={c.pair[0]} width={card.dw} height={card.dh} color={digitColor} />
                    <FlipDigit value={c.pair[1]} width={card.dw} height={card.dh} color={digitColor} />
                    <div className="hinge absolute inset-x-0" style={{ top: card.h / 2 - 1 }} />
                    <span className="absolute top-1.5 left-2.5 text-[9px] tracking-[0.14em] text-faint">{c.caption}</span>
                    {c.corner && (
                      <span className="absolute right-2 bottom-1 text-[13px] font-semibold text-muted tabular-nums" aria-label={`${c.corner} seconds`}>
                        {c.corner}
                      </span>
                    )}
                  </div>
                ))}
              </button>

              <div className="flex items-center gap-2.5">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-track">
                  <div
                    className="h-1 rounded-full bg-accent shadow-[0_0_8px_color-mix(in_srgb,var(--color-accent)_60%,transparent)] transition-[width] duration-300"
                    style={{ width: `${view.progress * 100}%` }}
                  />
                </div>
                <span className="text-[13px] text-muted tabular-nums">
                  {Math.floor(view.progress * 100)}% of {view.target}
                </span>
              </div>

              {view.stretch && <StretchCard step={view.stretch} compact={compact} />}

              {view.notice && <p className="m-0 rounded-lg bg-glass px-3 py-2 text-[13px] text-ink">{view.notice}</p>}

              {view.done ? (
                <div className="flex flex-col gap-2.5">
                  <p className="m-0 text-base font-medium text-ink">{view.doneTitle}</p>
                  {view.firstStretch && !compact && <StretchPreview stretch={view.firstStretch} />}
                  <div className="flex gap-2">
                    <button type="button" onClick={actions.snooze} className="h-10 flex-1 rounded-full border border-glass-line bg-glass text-sm hover:bg-glass-hover">
                      Snooze 5
                    </button>
                    {view.breakWaiting && (
                      <button type="button" onClick={actions.skipBreak} className="h-10 flex-1 rounded-full border border-glass-line bg-glass text-sm hover:bg-glass-hover">
                        Skip
                      </button>
                    )}
                    <button type="button" onClick={actions.next} className="h-10 flex-[1.6] rounded-full bg-accent text-sm font-semibold text-on-accent hover:brightness-110">
                      {view.nextLabel}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={actions.toggle}
                    aria-label={view.running ? 'Pause' : 'Start'}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-solid text-on-solid shadow-[0_2px_10px_rgb(0_0_0/0.25)] hover:brightness-110"
                  >
                    <Svg>{view.running ? Icon.pause : Icon.play}</Svg>
                  </button>
                  <button type="button" onClick={actions.reset} aria-label="Reset" className="flex h-10 w-10 items-center justify-center rounded-full border border-glass-line bg-glass hover:bg-glass-hover">
                    <Svg>{Icon.reset}</Svg>
                  </button>
                  <span className="flex-1" />
                  <span className="truncate text-[13px] text-muted">
                    {view.today.breaksTaken}/{settings.dailyGoal} breaks{view.streak > 1 ? ` · ${view.streak}d streak` : ''}
                  </span>
                </div>
              )}
              {view.stretch && <p className="m-0 text-center text-[11px] text-faint">Move gently — stop if anything hurts.</p>}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
