// Morning reminders over Web Push (the same notifications native apps send).
//
// Signing keys (VAPID): VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY if set; otherwise generated on first
// use and kept in the private store (like the session key) — nothing to configure, and the
// private key never leaves the server. Each player's devices and chosen time live in
// push/<user>.json.
import { readFile, writeFile } from 'node:fs/promises';
import webpush from 'web-push';
import { blobEnabled, listBlobPaths, readBlobDoc, readBlobTextLenient, writeBlob } from './storage.js';
import { THEME_LABEL, dailyNumber, localDate, themeOf } from '../src/lib/daily.js';

export interface Sub { endpoint: string; keys: { p256dh: string; auth: string }; at: number }
export interface PushPrefs { subs: Sub[]; hour: number; tz: string; lastSent?: string }
const MAX_DEVICES = 5;

// ── Keys ──
const KEY_PATH = 'auth/vapid.json';
const localKeyFile = () => process.env.GQ_VAPID_FILE ?? '.vapid.local.json';
type Keys = { publicKey: string; privateKey: string };
let keys: Keys | null = null;
async function loadKeys(): Promise<Keys> {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return (keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY });
  const parse = (t: string | null) => { try { const k = t ? (JSON.parse(t) as Keys) : null; return k?.publicKey && k.privateKey ? k : null; } catch { return null; } };
  if (!blobEnabled()) {
    const have = parse(await readFile(localKeyFile(), 'utf8').catch(() => null));
    if (have) return (keys = have);
    const fresh = webpush.generateVAPIDKeys();
    await writeFile(localKeyFile(), JSON.stringify(fresh), { mode: 0o600 });
    return (keys = fresh);
  }
  const have = parse(await readBlobTextLenient(KEY_PATH));
  if (have) return (keys = have);
  const fresh = webpush.generateVAPIDKeys();
  try { await writeBlob(KEY_PATH, JSON.stringify(fresh), { overwrite: false }); return (keys = fresh); } catch {
    const theirs = parse(await readBlobTextLenient(KEY_PATH)); // another instance made them first
    if (!theirs) throw new Error('Couldn’t set up notification keys.');
    return (keys = theirs);
  }
}
export const publicKey = async () => (await loadKeys()).publicKey;

// ── Prefs ──
const localFile = () => process.env.GQ_PUSH_FILE ?? '.push.local.json';
const prefPath = (user: string) => `push/${user}.json`;
async function readLocal(): Promise<Record<string, PushPrefs>> { try { return JSON.parse(await readFile(localFile(), 'utf8')); } catch { return {}; } }

export async function getPrefs(user: string): Promise<PushPrefs | null> {
  if (!blobEnabled()) return (await readLocal())[user] ?? null;
  const doc = await readBlobDoc(prefPath(user)).catch(() => null);
  return doc ? (JSON.parse(doc.text) as PushPrefs) : null;
}
export async function setPrefs(user: string, p: PushPrefs | null) {
  if (!blobEnabled()) {
    const all = await readLocal();
    if (p) all[user] = p; else delete all[user];
    await writeFile(localFile(), JSON.stringify(all), { mode: 0o600 });
    return;
  }
  await writeBlob(prefPath(user), JSON.stringify(p ?? { subs: [], hour: 8, tz: 'UTC' }));
}
async function allPrefs(): Promise<[string, PushPrefs][]> {
  if (!blobEnabled()) return Object.entries(await readLocal());
  const paths = await listBlobPaths('push/');
  const docs = await Promise.all(paths.map(async (p) => [p.slice(5, -5), await readBlobDoc(p).then((d) => (d ? (JSON.parse(d.text) as PushPrefs) : null)).catch(() => null)] as const));
  return docs.filter((d): d is [string, PushPrefs] => !!d[1] && d[1].subs.length > 0);
}

// ── Checking what the browser sent ──
export const validTz = (tz: unknown): tz is string => {
  if (typeof tz !== 'string' || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
};
export function cleanSub(s: unknown): Sub | null {
  const x = (s ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof x.endpoint !== 'string' || x.endpoint.length > 1000) return null;
  try { if (new URL(x.endpoint).protocol !== 'https:') return null; } catch { return null; }
  const { p256dh, auth } = x.keys ?? {};
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || p256dh.length > 200 || auth.length > 100) return null;
  return { endpoint: x.endpoint, keys: { p256dh, auth }, at: Date.now() };
}
/** Add (or refresh) this device; the oldest drops off past a handful. */
export const withSub = (p: PushPrefs | null, sub: Sub, hour: number, tz: string): PushPrefs =>
  ({ subs: [...(p?.subs ?? []).filter((s) => s.endpoint !== sub.endpoint), sub].slice(-MAX_DEVICES), hour, tz, lastSent: p?.lastSent });

// ── When ──
/** The player's local hour and date right now. */
export function localClock(tz: string, now = Date.now()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(now));
  return { hour, date: localDate(now, tz) };
}
/** Is it time to nudge this player (their hour, and not already today)? */
export function dueNow(p: PushPrefs, now = Date.now()) {
  if (!p.subs.length) return null;
  const { hour, date } = localClock(p.tz, now);
  return hour === p.hour && p.lastSent !== date ? date : null;
}

// ── Sending ──
export interface Note { title: string; body: string; url: string; tag: string }
export function morningNote(date: string, streak: number): Note {
  const theme = themeOf(date);
  const what = theme === 'flag' ? '5 mystery flags' : theme === 'clue' ? '5 GeoGuessr clues' : '5 mystery countries';
  return streak >= 2
    ? { title: `🔥 ${streak}-day streak on the line`, body: `Today’s Daily is ${what} — keep it going!`, url: '/?daily=1', tag: 'daily' }
    : { title: `🌍 Daily #${dailyNumber(date)}: ${THEME_LABEL[theme]}`, body: `${what[0].toUpperCase()}${what.slice(1)} are waiting. Can you get them all?`, url: '/?daily=1', tag: 'daily' };
}

/** Send to every device of a player; returns the devices that still work (dead ones dropped). */
export async function sendTo(p: PushPrefs, note: Note): Promise<{ alive: Sub[]; sent: number }> {
  const { publicKey: pub, privateKey } = await loadKeys();
  const subject = `https://${process.env.PUBLIC_HOST || 'geoquest-app.vercel.app'}`;
  const alive: Sub[] = [];
  let sent = 0;
  await Promise.all(p.subs.map(async (s) => {
    try {
      await webpush.sendNotification(s, JSON.stringify(note), { vapidDetails: { subject, publicKey: pub, privateKey }, TTL: 4 * 3600, urgency: 'normal', topic: note.tag });
      alive.push(s); sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) return; // that device unsubscribed — forget it
      alive.push(s); // a passing hiccup: keep it for next time
      console.warn('[push] send failed', code ?? (err as Error).message);
    }
  }));
  return { alive, sent };
}

/**
 * The hourly run: nudge everyone whose morning it is, unless they've already played today.
 * `played(user, date)` and `streakOf(user, date)` come from the daily results.
 */
export async function morningRun(played: (u: string, d: string) => Promise<boolean>, streakOf: (u: string, d: string) => Promise<number>, now = Date.now()) {
  let nudged = 0, skipped = 0;
  for (const [user, p] of await allPrefs()) {
    const date = dueNow(p, now);
    if (!date) continue;
    if (await played(user, date)) { skipped++; await setPrefs(user, { ...p, lastSent: date }); continue; }
    const { alive, sent } = await sendTo(p, morningNote(date, await streakOf(user, date)));
    await setPrefs(user, { ...p, subs: alive, lastSent: date });
    if (sent) nudged++;
  }
  return { nudged, skipped };
}
