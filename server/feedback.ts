// Feedback from players (guests too): an idea, a bug, a feature request or anything else, with a
// little context (where in the app, the device). One small document each, so sending feedback is a
// single storage write. Only the owner reads them, in the Feedback inbox.
//
// Stored at feedback/<id>.json in the private Blob store (a local JSON file on your own machine).
// The id starts with the time, so a listing comes back oldest → newest.
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { blobEnabled, listBlobPaths, readBlobQuick, writeBlob } from './storage.js';
import type { SessionDoc } from './analytics.js';

export const KINDS = ['idea', 'bug', 'feature', 'other'] as const;
export type Kind = (typeof KINDS)[number];
export interface Feedback {
  id: string;
  at: number;
  kind: Kind;
  text: string;
  /** How to reach them, if they left it (an email or a name) */
  contact?: string;
  /** Signed-in name, or "guest" */
  user: string;
  /** Where in the app they were, and on what */
  where: string;
  device: string;
  os: string;
  browser: string;
  pwa: boolean;
  place?: SessionDoc['place'];
  status: 'new' | 'done';
}

const MAX_TEXT = 2000;
const localFile = () => process.env.GQ_FEEDBACK_FILE ?? '.feedback.local.json';
const line = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const word = (v: unknown, n = 16) => String(v ?? '').replace(/[^\w .:/+-]/g, '').slice(0, n);

/** Check and tidy what the browser sent; a string is the reason it was refused. */
export function cleanFeedback(user: string, body: unknown, now = Date.now()): Feedback | string {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.website) return 'Thanks!'; // a bot filled the hidden field: pretend all's well, keep nothing
  const kind = KINDS.includes(b.kind as Kind) ? (b.kind as Kind) : 'other';
  // Keep line breaks in the message itself, but nothing else odd.
  const text = String(b.text ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT);
  if (text.length < 4) return 'Tell us a little more — a few words is plenty.';
  const contact = line(b.contact, 120);
  return {
    id: `${now.toString(36)}-${randomBytes(4).toString('hex')}`,
    at: now, kind, text,
    ...(contact ? { contact } : {}),
    user,
    where: line(b.where, 60) || 'Globe',
    device: word(b.device, 12), os: word(b.os, 12), browser: word(b.browser, 12), pwa: b.pwa === true,
    status: 'new',
  };
}

const pathOf = (id: string) => `feedback/${id}.json`;
async function readLocal(): Promise<Record<string, Feedback>> {
  try { return JSON.parse(await readFile(localFile(), 'utf8')); } catch { return {}; }
}

export async function saveFeedback(f: Feedback) {
  if (blobEnabled()) { await writeBlob(pathOf(f.id), JSON.stringify(f)); return; }
  const all = await readLocal();
  all[f.id] = f;
  await writeFile(localFile(), JSON.stringify(all), { mode: 0o600 });
}

/** The latest feedback, newest first. */
export async function listFeedback(limit = 150): Promise<Feedback[]> {
  if (!blobEnabled()) return Object.values(await readLocal()).sort((a, b) => b.at - a.at).slice(0, limit);
  const paths = (await listBlobPaths('feedback/')).sort().slice(-limit);
  const out: Feedback[] = [];
  for (let i = 0; i < paths.length; i += 16) {
    const docs = await Promise.all(paths.slice(i, i + 16).map((p) => readBlobQuick(p).catch(() => null)));
    for (const d of docs) if (d) { try { out.push(JSON.parse(d) as Feedback); } catch { /* skip a damaged one */ } }
  }
  return out.sort((a, b) => b.at - a.at);
}

/** Mark one as dealt with (or new again). */
export async function setStatus(id: string, status: Feedback['status']) {
  if (!/^[a-z0-9]{6,12}-[0-9a-f]{8}$/.test(id)) return false;
  if (!blobEnabled()) {
    const all = await readLocal();
    if (!all[id]) return false;
    all[id].status = status;
    await writeFile(localFile(), JSON.stringify(all), { mode: 0o600 });
    return true;
  }
  const text = await readBlobQuick(pathOf(id));
  if (!text) return false;
  await writeBlob(pathOf(id), JSON.stringify({ ...(JSON.parse(text) as Feedback), status }));
  return true;
}
