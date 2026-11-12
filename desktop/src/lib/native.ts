/**
 * Thin bridge to the Tauri side. Every call is a no-op in a plain browser
 * (`npm run dev` without Tauri), so the UI can be developed in Chrome too.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { disable as disableAutostart, enable as enableAutostart, isEnabled as autostartEnabled } from '@tauri-apps/plugin-autostart';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);

export type TrayAction = 'toggle-timer' | 'reset' | 'snooze' | 'next' | 'settings' | 'stats' | 'quiet-30' | 'quiet-60' | 'quiet-off';
export type Anchor = 'br' | 'bl' | 'tr' | 'tl' | 'center';

/** Resize the widget and pin it to the bottom-right of the work area (above taskbar / Dock). */
export async function dock(width: number, height: number, show = true, anchor: Anchor = 'br'): Promise<void> {
  if (!inTauri) return;
  try {
    await invoke('dock', { width, height, show, anchor });
  } catch (e) {
    console.warn('dock failed', e);
  }
}

export type GlassMode = 'vibrancy' | 'acrylic' | 'none';

/** Which native blur the window got, so the CSS can tint it correctly. */
export async function getGlassMode(): Promise<GlassMode> {
  if (!inTauri) return 'none';
  try {
    return await invoke<GlassMode>('glass_mode');
  } catch {
    return 'none';
  }
}

/** Re-apply native blur for a new shape (macOS corner radius) or a light/dark theme. */
export async function setGlass(radius: number, light: boolean): Promise<void> {
  if (!inTauri) return;
  try {
    await invoke('set_glass', { radius, light });
  } catch {}
}

/** Seconds since the last keyboard/mouse input anywhere on the computer (0 in a browser). */
export async function idleSeconds(): Promise<number> {
  if (!inTauri) return 0;
  try {
    return await invoke<number>('idle_seconds');
  } catch {
    return 0;
  }
}

/** Writes stats.json into the app's data folder; returns its path. */
export async function saveStats(json: string): Promise<string | null> {
  if (!inTauri) return null;
  try {
    return await invoke<string>('save_stats', { json });
  } catch {
    return null;
  }
}

export async function getAutostart(): Promise<boolean> {
  if (!inTauri) return false;
  try {
    return await autostartEnabled();
  } catch {
    return false;
  }
}

export async function setAutostart(on: boolean): Promise<void> {
  if (!inTauri) return;
  try {
    if (on) await enableAutostart();
    else await disableAutostart();
  } catch (e) {
    console.warn('autostart', e);
  }
}

/** Spoken cues for workouts ("3, 2, 1", "Round 4. Go!"). */
export function speak(text: string): void {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.volume = 0.9;
    synth.speak(u);
  } catch {}
}

/** Menu-bar text on macOS, tooltip on Windows. */
export async function setTray(title: string, tooltip: string): Promise<void> {
  if (!inTauri) return;
  try {
    await invoke('set_tray', { title, tooltip });
  } catch {}
}

export async function onTrayAction(cb: (a: TrayAction) => void): Promise<UnlistenFn> {
  if (!inTauri) return () => {};
  return listen<TrayAction>('tray-action', (e) => cb(e.payload));
}

export async function onShown(cb: () => void): Promise<UnlistenFn> {
  if (!inTauri) return () => {};
  return listen('widget-shown', () => cb());
}

let permission: Promise<boolean> | null = null;
function ensurePermission(): Promise<boolean> {
  if (!permission) {
    permission = (async () => {
      if (!inTauri) return false;
      try {
        if (await isPermissionGranted()) return true;
        return (await requestPermission()) === 'granted';
      } catch {
        return false;
      }
    })();
  }
  return permission;
}

export async function notify(title: string, body: string): Promise<void> {
  if (await ensurePermission()) sendNotification({ title, body });
}

export { ensurePermission as prepareNotifications };
