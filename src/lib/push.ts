// Morning reminders on this device (Web Push). iPhones only allow them in the installed app
// (Add to Home Screen, iOS 16.4+); Android and computers allow them in the browser too.
import { api } from './api';

export type PushSupport = 'ok' | 'ios-install' | 'denied' | 'unsupported';

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const installed = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  if (isIOS() && !installed()) return 'ios-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

/** The service worker, once it's running (only in the built app, not `npm run dev`). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? navigator.serviceWorker.ready : null;
}

const b64ToBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export interface ReminderState { on: boolean; hour: number }

/** Is this device signed up, and for what time? */
export async function reminderState(): Promise<ReminderState> {
  const d = await api('/api/push').then((r) => r.json()).catch(() => null) as { hour?: number; endpoints?: string[] } | null;
  const sub = await (await registration())?.pushManager.getSubscription().catch(() => null);
  return { on: !!sub && !!d?.endpoints?.includes(sub.endpoint), hour: d?.hour ?? 8 };
}

/** Turn reminders on for this device at `hour` (asks for permission — call from a tap). */
export async function enableReminder(hour: number): Promise<void> {
  if (pushSupport() !== 'ok') throw new Error('Notifications aren’t available here.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked for GeoQuest — allow them in your browser or phone settings.' : 'No problem — you can turn them on any time.');
  const reg = await registration();
  if (!reg) throw new Error('Reminders work in the installed app or the live site — not in this preview.');
  const { key } = await api('/api/push').then((r) => r.json()) as { key: string };
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
  const r = await api('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), hour, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Couldn’t turn reminders on.');
}

/** Turn them off for this device. */
export async function disableReminder(): Promise<void> {
  const sub = await (await registration())?.pushManager.getSubscription().catch(() => null);
  if (!sub) return;
  await api('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => null);
  await sub.unsubscribe().catch(() => null);
}

export async function sendTestReminder(): Promise<void> {
  const r = await api('/api/push/test', { method: 'POST' });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Couldn’t send a test.');
}

/** "8 AM" */
export const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' });
