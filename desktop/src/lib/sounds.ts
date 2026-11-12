/**
 * Sound engine: decoded WebAudio buffers so the flip clack plays instantly,
 * every time, without the lag of <audio> elements.
 */
import type { AlarmSoundId, FlipSoundId } from '../core/timer';
import arcade from '../assets/sounds/alarm-arcade.wav';
import bowl from '../assets/sounds/alarm-bowl.wav';
import chime from '../assets/sounds/alarm-chime.wav';
import classic from '../assets/sounds/alarm-classic.wav';
import digital from '../assets/sounds/alarm-digital.wav';
import marimba from '../assets/sounds/alarm-marimba.wav';
import flipPaper from '../assets/sounds/flip-paper.wav';
import flipSoft from '../assets/sounds/flip-soft.wav';
import flipTick from '../assets/sounds/flip-tick.wav';

type SoundKey = AlarmSoundId | `flip-${FlipSoundId}`;
const URLS: Record<SoundKey, string> = {
  arcade,
  bowl,
  chime,
  classic,
  digital,
  marimba,
  'flip-soft': flipSoft,
  'flip-tick': flipTick,
  'flip-paper': flipPaper,
};

let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
let alarmSource: AudioBufferSourceNode | null = null;

/** Create/resume the audio context. Call from a click so the webview allows sound later. */
export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    // Warm the cache so the first flip isn't late.
    for (const k of Object.keys(URLS)) void load(k as SoundKey);
  } catch {}
}

function load(id: SoundKey): Promise<AudioBuffer | null> {
  let p = buffers.get(id);
  if (!p) {
    p = (async () => {
      try {
        if (!ctx) return null;
        const res = await fetch(URLS[id]);
        return await ctx.decodeAudioData(await res.arrayBuffer());
      } catch {
        return null;
      }
    })();
    buffers.set(id, p);
  }
  return p;
}

async function play(id: SoundKey, volume: number): Promise<AudioBufferSourceNode | null> {
  unlockAudio();
  const ac = ctx;
  const buf = await load(id);
  if (!ac || !buf) return null;
  const src = ac.createBufferSource();
  const gain = ac.createGain();
  gain.gain.value = volume;
  src.buffer = buf;
  src.connect(gain).connect(ac.destination);
  src.start();
  return src;
}

/** Flip sounds play quietly — they repeat all day and should stay in the background. */
export function playFlip(style: FlipSoundId): void {
  void play(`flip-${style}`, 0.35);
}

/** Plays the chosen alarm `times` times back to back (stops any alarm already ringing). */
export async function playAlarm(id: AlarmSoundId, times = 1): Promise<void> {
  stopAlarm();
  const buf = await load(id);
  for (let i = 0; i < times; i++) {
    const src = await play(id, 0.9);
    alarmSource = src;
    if (!src || !buf) return;
    await new Promise<void>((resolve) => {
      src.onended = () => resolve();
    });
    if (alarmSource !== src) return; // stopped or replaced
  }
}

export function stopAlarm(): void {
  try {
    alarmSource?.stop();
  } catch {}
  alarmSource = null;
}
