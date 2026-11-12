import { type CSSProperties, memo, useEffect, useRef, useState } from 'react';

interface Props {
  value: string;
  width: number;
  height: number;
  color: string;
}

/**
 * Split-flap digit on a glass card.
 * At rest it is just the digit on a transparent background (the card supplies
 * the glass). During a flip, two tinted flaps animate over it — the old top half
 * folds down, the new bottom half lands — then they are removed, so no
 * semi-transparent layers stack up and darken the card.
 */
function FlipDigitBase({ value, width, height, color }: Props) {
  const last = useRef(value);
  const [flip, setFlip] = useState({ prev: value, cur: value, n: 0, moving: false });

  useEffect(() => {
    if (value === last.current) return;
    setFlip((f) => ({ prev: last.current, cur: value, n: f.n + 1, moving: true }));
    last.current = value;
  }, [value]);

  const settle = (n: number) => setFlip((f) => (f.n === n ? { ...f, moving: false } : f));
  const style = { '--w': `${width}px`, '--h': `${height}px`, color } as CSSProperties;

  return (
    <div className="flip" style={style} aria-hidden="true">
      <div className="half top">
        <span>{flip.cur}</span>
      </div>
      <div className="half bottom">
        <span>{flip.moving ? flip.prev : flip.cur}</span>
      </div>
      {flip.moving && (
        <>
          <div key={`t${flip.n}`} className="half top flap flap-top">
            <span>{flip.prev}</span>
          </div>
          <div key={`b${flip.n}`} className="half bottom flap flap-bottom" onAnimationEnd={() => settle(flip.n)}>
            <span>{flip.cur}</span>
          </div>
        </>
      )}
    </div>
  );
}

export const FlipDigit = memo(FlipDigitBase);
