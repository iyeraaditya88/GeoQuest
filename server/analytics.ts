// Usage analytics for the owner: one small document per visit (session) — who, when, how long
// they were actually active, on what device, and a short list of what they did (countries
// opened, games played, crashes). The browser sends a summary now and then (not every click),
// which keeps storage writes to a handful per visit.
//
// Stored at analytics/<day>/<user>/<session>.json in the private Blob store; a local JSON file
// on your own machine. Kept for RETAIN_DAYS, then deleted.
import { readFile } from 'node:fs/promises';
import { blobEnabled, deleteBlobs, listBlobPaths, readBlobQuick, writeBlob, writeLocalFile } from './storage.js';

export type Event = [at: number, name: string, data?: Record<string, string | number>];
export interface SessionDoc {
  sid: string;
  user: string;
  start: number;
  last: number;
  /** seconds the app was on screen and in use */
  active: number;
  device: string;
  os: string;
  browser: string;
  pwa: boolean;
  /** How they arrived: the link's ?ref= tag, and the site that linked here */
  src?: string;
  from?: string;
  /** Roughly where they were (from the connection, on the hosted site): city, region code, country code */
  place?: { city?: string; region?: string; country?: string };
  events: Event[];
}

/**
 * Roughly where a visit came from, from the location Vercel adds to each request (worked out from the
 * internet address — city-level, sometimes the mobile operator's hub city). The address itself is
 * never stored.
 */
export function placeFrom(headers: Record<string, string | string[] | undefined>): SessionDoc['place'] {
  const one = (k: string) => { const v = headers[k]; const s = Array.isArray(v) ? v[0] : v; try { return s ? decodeURIComponent(s) : ''; } catch { return ''; } };
  const city = one('x-vercel-ip-city').replace(/[^\p{L}\p{N} .'-]/gu, '').slice(0, 40);
  const region = one('x-vercel-ip-country-region').replace(/[^A-Z0-9]/gi, '').slice(0, 4);
  const country = one('x-vercel-ip-country').replace(/[^A-Z]/gi, '').slice(0, 2).toUpperCase();
  if (!city && !country) return undefined;
  return { ...(city ? { city } : {}), ...(region ? { region } : {}), ...(country.length === 2 ? { country } : {}) };
}

const RETAIN_DAYS = 90;
const MAX_EVENTS = 400;
const localFile = () => process.env.GQ_ANALYTICS_FILE ?? '.analytics.local.json';
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const short = (v: unknown, n = 24) => String(v ?? '').replace(/[^\w .:/+-]/g, '').slice(0, n);

/** Check and tidy what the browser sent; null if it isn't a plausible session. */
export function cleanSession(user: string, body: unknown, now = Date.now()): SessionDoc | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const sid = typeof b.sid === 'string' && /^[a-z0-9]{8,24}$/.test(b.sid) ? b.sid : null;
  const start = Number(b.start);
  if (!sid || !Number.isFinite(start) || start > now + 60_000 || start < now - 36 * 3600_000) return null;
  const events: Event[] = [];
  for (const raw of Array.isArray(b.events) ? b.events.slice(0, MAX_EVENTS) : []) {
    if (!Array.isArray(raw)) continue;
    const [at, name, data] = raw as unknown[];
    if (typeof name !== 'string' || !/^[a-z_]{2,24}$/.test(name)) continue;
    const ev: Event = [Math.max(0, Math.round(Number(at) || 0)), name];
    if (data && typeof data === 'object') {
      const d: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(data).slice(0, 6)) {
        if (!/^[a-z]{1,8}$/.test(k)) continue;
        d[k] = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : short(v, 48);
      }
      ev.push(d);
    }
    events.push(ev);
  }
  return {
    sid, user, start, last: now,
    active: Math.max(0, Math.min(Math.round(Number(b.active) || 0), Math.round((now - start) / 1000) + 60)),
    device: short(b.device, 12), os: short(b.os, 12), browser: short(b.browser, 12), pwa: b.pwa === true,
    ...(typeof b.src === 'string' && /^[a-z0-9_-]{1,24}$/.test(b.src) ? { src: b.src } : {}),
    ...(typeof b.from === 'string' && /^[a-z0-9.-]{1,60}$/i.test(b.from) ? { from: b.from.toLowerCase() } : {}),
    events,
  };
}

const pathOf = (s: SessionDoc) => `analytics/${day(s.start)}/${s.user}/${s.sid}.json`;

async function readLocal(): Promise<Record<string, SessionDoc>> {
  try { return JSON.parse(await readFile(localFile(), 'utf8')); } catch { return {}; }
}

export async function saveSession(s: SessionDoc) {
  if (blobEnabled()) { await writeBlob(pathOf(s), JSON.stringify(s)); return; }
  const all = await readLocal();
  all[s.sid] = s;
  await writeLocalFile(localFile(), JSON.stringify(all));
}

/** Sessions that started in the last `days` days, newest first. Also clears out old ones. */
export async function recentSessions(days: number): Promise<SessionDoc[]> {
  const since = Date.now() - days * 86400_000;
  if (!blobEnabled()) return Object.values(await readLocal()).filter((s) => s.start >= since).sort((a, b) => b.start - a.start);

  const paths = await listBlobPaths('analytics/');
  const dayOf = (p: string) => p.split('/')[1] ?? '';
  const expired = paths.filter((p) => dayOf(p) < day(Date.now() - RETAIN_DAYS * 86400_000));
  if (expired.length) void deleteBlobs(expired).catch(() => null);
  const wanted = paths.filter((p) => dayOf(p) >= day(since));

  const out: SessionDoc[] = [];
  for (let i = 0; i < wanted.length; i += 16) {
    // A quick read (one storage operation each): a visit that's a moment behind doesn't matter here.
    const docs = await Promise.all(wanted.slice(i, i + 16).map((p) => readBlobQuick(p).catch(() => null)));
    for (const d of docs) if (d) { try { out.push(JSON.parse(d) as SessionDoc); } catch { /* skip a damaged one */ } }
  }
  return out.filter((s) => s.start >= since).sort((a, b) => b.start - a.start);
}
