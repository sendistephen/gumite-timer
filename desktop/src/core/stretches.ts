/**
 * Guided desk stretches for breaks. Pure data + planning.
 * The same file lives in mobile/src/core/stretches.ts. Keep the two in sync.
 */

export interface Stretch {
  id: string;
  name: string;
  area: 'Neck' | 'Shoulders' | 'Chest' | 'Wrists' | 'Hands' | 'Back' | 'Hips' | 'Legs' | 'Eyes' | 'Move';
  how: string;
  sec: number;
  /** switch sides halfway through */
  sides?: boolean;
}

export const STRETCHES: Stretch[] = [
  { id: 'neck-tilt', name: 'Neck tilt', area: 'Neck', sec: 30, sides: true, how: 'Ear toward shoulder, shoulders relaxed and down. Breathe slowly.' },
  { id: 'wrist-flex', name: 'Wrist flexor stretch', area: 'Wrists', sec: 30, sides: true, how: 'Arm out, palm up. Gently ease the fingers back with your other hand.' },
  { id: 'overhead', name: 'Overhead reach', area: 'Back', sec: 30, how: 'Stand tall, interlace fingers, reach up. Lean gently left, then right.' },
  { id: 'eyes', name: '20-20-20 eye break', area: 'Eyes', sec: 20, how: 'Look at something about 6 m (20 ft) away. Blink slowly.' },
  { id: 'shoulder-rolls', name: 'Shoulder rolls', area: 'Shoulders', sec: 30, how: 'Roll your shoulders up, back and down — slow, big circles.' },
  { id: 'wrist-ext', name: 'Wrist extensor stretch', area: 'Wrists', sec: 30, sides: true, how: 'Arm out, palm down. Gently press the back of the hand toward you.' },
  { id: 'chest', name: 'Chest opener', area: 'Chest', sec: 30, how: 'Clasp hands behind your back, lift the chest, squeeze shoulder blades.' },
  { id: 'hip-flexor', name: 'Standing hip stretch', area: 'Hips', sec: 40, sides: true, how: 'Step one foot back, tuck your hips under. Feel the front of the hip.' },
  { id: 'chin-tuck', name: 'Chin tucks', area: 'Neck', sec: 30, how: 'Glide your chin straight back, hold 3 seconds, release. Repeat.' },
  { id: 'fingers', name: 'Finger spreads', area: 'Hands', sec: 20, how: 'Spread your fingers wide, then make a loose fist. Repeat slowly.' },
  { id: 'calf-raises', name: 'Calf raises', area: 'Legs', sec: 30, how: 'Rise onto your toes, lower slowly. Keep a steady rhythm.' },
  { id: 'back-bend', name: 'Standing back bend', area: 'Back', sec: 20, how: 'Hands on your lower back, gently lean back and look up a little.' },
  { id: 'hamstring', name: 'Hamstring reach', area: 'Legs', sec: 40, sides: true, how: 'Heel forward on the floor, hinge at the hips, reach toward your toes.' },
  { id: 'walk', name: 'Walk & breathe', area: 'Move', sec: 60, how: 'Walk around, grab some water, take a few deep breaths.' },
];

export interface StretchStep {
  stretch: Stretch;
  index: number;
  count: number;
  /** seconds left on this stretch */
  left: number;
  /** "Switch sides" moment for two-sided stretches */
  switchSides: boolean;
}

/**
 * Pick stretches to fill a break. `seed` rotates the starting point (e.g. the
 * number of breaks taken so far) so consecutive breaks feel different.
 */
export function planStretches(breakSec: number, seed: number): Stretch[] {
  const out: Stretch[] = [];
  let total = 0;
  const n = STRETCHES.length;
  for (let i = 0; i < n * 2 && total < breakSec; i++) {
    const s = STRETCHES[(seed + i) % n];
    if (total + s.sec > breakSec && out.length > 0) {
      const leftover = breakSec - total;
      if (leftover >= 15) out.push({ ...s, sec: leftover, sides: s.sides && leftover >= 20 });
      else out[out.length - 1] = { ...out[out.length - 1], sec: out[out.length - 1].sec + leftover };
      total = breakSec;
      break;
    }
    out.push(s);
    total += s.sec;
  }
  return out;
}

/** Which stretch is on now, `elapsed` seconds into the break. */
export function stretchAt(plan: Stretch[], elapsed: number): StretchStep | null {
  let t = 0;
  for (let i = 0; i < plan.length; i++) {
    const s = plan[i];
    if (elapsed < t + s.sec) {
      const into = elapsed - t;
      const left = s.sec - into;
      return { stretch: s, index: i, count: plan.length, left, switchSides: !!s.sides && Math.abs(into - s.sec / 2) < 2 };
    }
    t += s.sec;
  }
  return null;
}
