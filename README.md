# Gumite Flip Timer

A flip-clock timer that **counts up to the time you set, then rings**. It's built to get you off the chair while coding (stretch breaks) and to run workout intervals.

```
mobile/    React Native (Expo SDK 58) phone app — portrait or landscape
desktop/   Tauri 2 widget for macOS + Windows — floats bottom-right, over every app
scripts/   install-mac.sh — build & install the widget on a Mac
branding/  Icon and the sound synthesizer (make_sounds.py)
```

Both apps share the same pure logic in `src/core/` (`timer.ts`, `stretches.ts`, `stats.ts` — one copy in each app, keep them in sync). Time comes from timestamps, so it stays right through sleep, lock screens and backgrounding.

## Install on your Mac

```bash
cd ~/Repository/Freelance/gumite-timer
./scripts/install-mac.sh
```

It checks for Xcode Command Line Tools, Node and Rust, builds the app, copies **Flip Timer.app** into `/Applications` and launches it. Run it again any time to update. The first build takes a few minutes.

## Presets

| Preset | Flips up to | Then |
|---|---|---|
| Coding · anti-sitting | 45:00 | Rings; tap **Start stretch** for a guided 5:00 break |
| Pomodoro | 25:00 | Break 5:00 |
| Workout interval | 00:40 work | 00:20 rest, 8 rounds, moves on by itself |
| Plank / hold | 01:30 | Rings and stops |
| Custom intervals | Warm-up 1:00 → 6 × (0:30 work / 0:15 rest) → cool-down 1:00 | All editable |

All times are editable (up to 5 hours) and saved. Long timers flip **hours : minutes** with seconds small in the corner; short ones flip **minutes : seconds**.

## Features

**Getting you moving**
- **Guided stretches:** during a desk break the widget walks you through desk stretches one at a time (neck, wrists, shoulders, back, hips, legs, 20-20-20 eye break), each with its own countdown and a "switch sides" cue. The set changes every break.
- **Time away counts as a break** (desktop): if you're away from the keyboard and mouse for 3+ minutes (2/3/5/10, your choice), the timer pauses at the moment you left. When you come back, the break is counted and a fresh sitting timer starts.
- **Reminders if you ignore it:** rings again after 2 minutes; after 5 minutes the desktop widget moves to the middle of the screen. On the phone, the reminders also arrive as notifications.
- **Stats and streaks:** sitting time, breaks taken/snoozed/skipped, automatic breaks, a 7-day chart, a daily goal and a streak. **Copy today's summary** (desktop) or **Share** (phone) gives you one line for your daily report. The desktop also writes everything to `stats.json` in the app's data folder (the path is shown on the stats screen), so another tool can read it.

**Workouts**
- **Custom interval builder:** warm-up, work, rest, rounds, cool-down.
- **Voice coach:** "3, 2, 1", "Round 4 of 6. Go!", "Rest", "Cool down".
- **Workout log** of finished sessions.
- **Android:** an ongoing notification shows when the current phase ends.

**Fitting into your day**
- **Quiet / meeting mode:** silences alerts for 30 or 60 minutes. Anything that came due while quiet rings once quiet ends.
- **Global shortcuts** (desktop): **⌃⌥T** / **Ctrl+Alt+T** start or pause from any app; **⌃⌥F** / **Ctrl+Alt+F** show or hide the widget.
- **Start at login** (desktop, in Settings → Habits).

**Sounds**
- Flip sound: Soft flap, Clock tick or Paper, or off.
- Alarm: Chime, Marimba, Classic beep, Digital watch, Arcade or Singing bowl. Tap any of them to preview.
- Sounds are synthesized by `branding/make_sounds.py`.

**Look (desktop)**
- Glass: macOS vibrancy or Windows Acrylic, with a frosted fallback.
- Dark or light glass, six accent colours, Clear/Frosted/Solid tint, compact size, and any of the four corners.
- Floats over every Space and full-screen app on macOS, and follows your mouse to whichever monitor you're using.

## Phone app (`mobile/`)

```bash
cd mobile
npm install
npx expo start          # scan the QR code with Expo Go
```

Every module used here is included in Expo Go. For a standalone app: `npx eas-cli@latest build -p android --profile preview` gives you an APK. On iOS, the custom alarm sounds in notifications only work in an installed build.

## Desktop widget (`desktop/`)

Prerequisites: [Rust](https://rustup.rs), Node 20+. macOS also needs `xcode-select --install`. Windows needs the Microsoft C++ Build Tools (WebView2 ships with Windows 11).

```bash
cd desktop
npm install
npm run tauri dev       # develop
npm run tauri build     # installer: .app/.dmg on macOS, .msi/.exe on Windows
```

- `npm run dev` on its own runs the UI in a normal browser. The native parts (blur, idle detection, tray) are switched off there.
- **Windows build from a Mac:** push to GitHub and run **Actions → Desktop widget build**.

## Not built yet (needs outside setup)

- **Pause during Outlook meetings automatically.** Needs a Microsoft 365 app registration (Graph API) and sign-in. Quiet mode covers it manually for now.
- **iOS lock-screen Live Activity and home-screen widgets.** Need native Swift extensions, so they won't work in Expo Go.
- **Phone ↔ desktop sync.** Needs a small backend (for example Supabase).
- **Automatic updates for installed copies.** Needs signed releases on GitHub; the CI workflow is the first half of that.
# gumite-timer
