import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Platform, Vibration } from 'react-native';
import { ALARM_SOUNDS, type AlarmSoundId, type UpcomingAlarm } from '../core/timer';

export type AlertMode = 'beep' | 'vibrate' | 'both';

const VIBRATION = [0, 300, 150, 300, 150, 300];
const STATUS_CHANNEL = 'flip-status';
const STATUS_ID = 'flip-status';

/** Bundled with the notification config plugin (see app.json). */
const soundFile = (id: AlarmSoundId) => `alarm-${id}.wav`;
/** Android fixes a channel's sound at creation, so each alarm sound gets its own channel. */
const channelFor = (id: AlarmSoundId, mode: AlertMode) => (mode === 'vibrate' ? 'flip-alarm-silent' : `flip-alarm-${id}`);

// While the app is open we play the alarm ourselves, so keep the OS banner quiet.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let ready: Promise<boolean> | null = null;

/** Creates the Android channels and asks for permission once. */
export function setupNotifications(): Promise<boolean> {
  if (!ready) {
    ready = (async () => {
      try {
        if (Platform.OS === 'android') {
          for (const s of ALARM_SOUNDS) {
            await Notifications.setNotificationChannelAsync(channelFor(s.id, 'both'), {
              name: `Timer alarm — ${s.name}`,
              importance: Notifications.AndroidImportance.HIGH,
              sound: soundFile(s.id),
              vibrationPattern: VIBRATION,
              enableVibrate: true,
            });
          }
          await Notifications.setNotificationChannelAsync(STATUS_CHANNEL, {
            name: 'Timer running',
            importance: Notifications.AndroidImportance.LOW,
            sound: null,
            enableVibrate: false,
            showBadge: false,
          });
          await Notifications.setNotificationChannelAsync('flip-alarm-silent', {
            name: 'Timer alarm — vibrate only',
            importance: Notifications.AndroidImportance.HIGH,
            sound: null,
            vibrationPattern: VIBRATION,
            enableVibrate: true,
          });
        }
        const current = await Notifications.getPermissionsAsync();
        if (current.granted) return true;
        const asked = await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowSound: true, allowBadge: false },
        });
        return asked.granted;
      } catch {
        return false;
      }
    })();
  }
  return ready;
}

/** Replace every scheduled alarm with the given list (fires even if the app is closed). */
export async function scheduleAlarms(alarms: UpcomingAlarm[], mode: AlertMode, sound: AlarmSoundId): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!(await setupNotifications())) return;
    const soon = Date.now() + 500;
    for (const a of alarms) {
      if (a.at <= soon) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: a.title,
          body: a.body,
          sound: mode === 'vibrate' ? false : soundFile(sound),
          vibrate: mode === 'beep' ? undefined : VIBRATION,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: a.at,
          channelId: channelFor(sound, mode),
          delivery: 'alarmClock',
        },
      });
    }
  } catch {
    // Notifications are a safety net; the in-app alarm still works without them.
  }
}

/**
 * Android: an ongoing (non-swipeable) notification saying when the timer ends,
 * so you can glance at it from the lock screen. iOS has no equivalent without a
 * native Live Activity, so it's skipped there.
 */
export async function showStatus(title: string, body: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    if (!(await setupNotifications())) return;
    await Notifications.scheduleNotificationAsync({
      identifier: STATUS_ID,
      content: { title, body, sticky: true, autoDismiss: false, sound: false },
      trigger: { channelId: STATUS_CHANNEL },
    });
  } catch {}
}

export async function clearStatus(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.dismissNotificationAsync(STATUS_ID);
  } catch {}
}

export async function cancelAlarms(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}
}

/** Physical feedback when the timer hits its target while the app is open. */
export function buzz(mode: AlertMode, strong: boolean): void {
  if (mode === 'beep') return;
  Haptics.notificationAsync(
    strong ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success,
  ).catch(() => {});
  if (Platform.OS === 'android') Vibration.vibrate(strong ? VIBRATION : [0, 250]);
}
