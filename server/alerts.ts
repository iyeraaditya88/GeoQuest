// Notifications for the owner, on their phone (Web Push — the devices where they turned on the
// morning reminder): new feedback, a new player joining, a guest exploring. Each kind can be
// switched off; they never hold up or fail the request that set them off.
import { readFile } from 'node:fs/promises';
import * as accounts from './users.js';
import * as push from './push.js';
import type { SessionDoc } from './analytics.js';
import { blobEnabled, readBlobQuick, writeBlob, writeLocalFile } from './storage.js';

export interface AlertSettings { signups: boolean; guests: boolean }
const DEFAULTS: AlertSettings = { signups: true, guests: true };
const PATH = 'alerts/settings.json';
const localFile = () => process.env.GQ_ALERTS_FILE ?? '.alerts.local.json';

let cache: { at: number; value: AlertSettings } | null = null;
export async function getSettings(): Promise<AlertSettings> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  let raw: string | null = null;
  try { raw = blobEnabled() ? await readBlobQuick(PATH) : await readFile(localFile(), 'utf8'); } catch { /* not set yet */ }
  let value = DEFAULTS;
  try { if (raw) value = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AlertSettings>) }; } catch { /* damaged: defaults */ }
  cache = { at: Date.now(), value };
  return value;
}
export async function setSettings(next: Partial<AlertSettings>) {
  const value: AlertSettings = { ...(await getSettings()), ...next };
  const text = JSON.stringify({ signups: !!value.signups, guests: !!value.guests });
  if (blobEnabled()) await writeBlob(PATH, text); else await writeLocalFile(localFile(), text);
  cache = { at: Date.now(), value };
  return value;
}

/** The owner's devices (null if notifications aren't on anywhere). */
async function ownerDevices() {
  const owner = (await accounts.listUsers()).find((u) => u.role === 'owner');
  const prefs = owner ? await push.getPrefs(owner.name) : null;
  return prefs?.subs.length ? prefs : null;
}
/** How many devices the owner gets these on. */
export const ownerDeviceCount = async () => (await ownerDevices())?.subs.length ?? 0;

/** Send one notification to the owner. Never throws. */
export async function notifyOwner(note: push.Note) {
  try {
    const prefs = await ownerDevices();
    if (prefs) await push.sendTo(prefs, note);
  } catch (err) { console.warn('[alerts] notify failed', (err as Error).message); }
}

const placeText = (p?: SessionDoc['place']) => (p ? [p.city, p.country].filter(Boolean).join(', ') : '');

/** Someone new made an account. `via`: how they joined. */
export async function newPlayer(name: string, via: string, place?: SessionDoc['place']) {
  if (!(await getSettings()).signups) return;
  const where = placeText(place);
  await notifyOwner({ title: `🎉 New player: ${name}`, body: `Joined ${via}${where ? ` · ${where}` : ''}`, url: '/?activity=1', tag: `signup-${name}` });
}

/** A guest's visit was first reported (they stayed a little while). Replaces the previous one on the phone. */
export async function guestVisit(s: SessionDoc) {
  if (!(await getSettings()).guests) return;
  const where = placeText(s.place);
  const how = [s.device, s.os].filter(Boolean).join(' · ');
  await notifyOwner({ title: '👀 A guest is exploring', body: [where || 'Somewhere on Earth', how, s.pwa ? 'installed app' : ''].filter(Boolean).join(' · '), url: '/?activity=1', tag: 'guest-visit' });
}
