// Feedback from players (guests too): an idea, a bug, a feature request or anything else, with a
// little context (where in the app, the device). One small document each, so sending feedback is a
// single storage write. Only the owner reads them, in the Feedback inbox.
//
// Stored at feedback/<id>.json in the private Blob store (a local JSON file on your own machine).
// The id starts with the time, so a listing comes back oldest → newest.
//
// The owner's replies are kept twice: on the feedback itself (for the inbox), and in the player's
// own small mailbox at replies/<box>.json — so opening the app is one read, not a scan of all
// feedback. Only the owner writes a mailbox. The box is u/<name> for an account, g/<hash> for a guest
// (a random key kept in their browser; we only ever store its hash).
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { blobEnabled, listBlobPaths, readBlobDoc, readBlobQuick, writeBlob, writeLocalFile } from './storage.js';
import type { SessionDoc } from './analytics.js';

export const KINDS = ['idea', 'bug', 'feature', 'other'] as const;
export type Kind = (typeof KINDS)[number];
export interface Reply { text: string; at: number; via: 'app' | 'email' }
/** One reply, as the player sees it: what they wrote, and what came back. */
export interface Mail { id: string; message: string; reply: string; at: number }
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
  /** The owner's answers, oldest first */
  replies?: Reply[];
  /** A guest's mailbox: the hash of the key in their browser */
  box?: string;
}

const MAX_TEXT = 2000;
const MAX_MAIL = 30;
const localFile = () => process.env.GQ_FEEDBACK_FILE ?? '.feedback.local.json';
const mailFile = () => process.env.GQ_REPLIES_FILE ?? '.replies.local.json';
const line = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const word = (v: unknown, n = 16) => String(v ?? '').replace(/[^\w .:/+-]/g, '').slice(0, n);

// Keep line breaks in a message, but nothing else odd.
const tidy = (v: unknown) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT);
export const cleanReply = tidy;
/** A guest's mailbox from the key in their browser (null if it isn't one of ours). */
export const guestBox = (key: unknown) => (typeof key === 'string' && /^[0-9a-f]{32}$/.test(key) ? createHash('sha256').update(key).digest('hex') : null);

/** Check and tidy what the browser sent; a string is the reason it was refused. */
export function cleanFeedback(user: string, body: unknown, now = Date.now()): Feedback | string {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.website) return 'Thanks!'; // a bot filled the hidden field: pretend all's well, keep nothing
  const kind = KINDS.includes(b.kind as Kind) ? (b.kind as Kind) : 'other';
  const text = tidy(b.text);
  if (text.length < 4) return 'Tell us a little more — a few words is plenty.';
  const contact = line(b.contact, 120);
  const box = user === 'guest' ? guestBox(b.replyKey) : null;
  return {
    id: `${now.toString(36)}-${randomBytes(4).toString('hex')}`,
    at: now, kind, text,
    ...(contact ? { contact } : {}),
    user,
    where: line(b.where, 60) || 'Globe',
    device: word(b.device, 12), os: word(b.os, 12), browser: word(b.browser, 12), pwa: b.pwa === true,
    status: 'new',
    ...(box ? { box } : {}),
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
  await writeLocalFile(localFile(), JSON.stringify(all));
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
    await writeLocalFile(localFile(), JSON.stringify(all));
    return true;
  }
  const doc = await readBlobDoc(pathOf(id)); // the up-to-date copy: a stale one could lose a reply
  if (!doc) return false;
  await writeBlob(pathOf(id), JSON.stringify({ ...(JSON.parse(doc.text) as Feedback), status }));
  return true;
}

export async function getFeedback(id: string): Promise<Feedback | null> {
  if (!/^[a-z0-9]{6,12}-[0-9a-f]{8}$/.test(id)) return null;
  if (!blobEnabled()) return (await readLocal())[id] ?? null;
  const doc = await readBlobDoc(pathOf(id));
  return doc ? (JSON.parse(doc.text) as Feedback) : null;
}

/** Where a reply can reach this player inside the app (null: an older guest message, no way back). */
export const boxFor = (f: Feedback) => (f.user !== 'guest' ? `u/${f.user}` : f.box ? `g/${f.box}` : null);

async function readLocalMail(): Promise<Record<string, Mail[]>> {
  try { return JSON.parse(await readFile(mailFile(), 'utf8')); } catch { return {}; }
}
/** A player's replies, oldest first. */
export async function readMail(box: string): Promise<Mail[]> {
  if (!blobEnabled()) return (await readLocalMail())[box] ?? [];
  const text = await readBlobQuick(`replies/${box}.json`);
  return text ? (JSON.parse(text) as { items: Mail[] }).items : [];
}
async function addMail(box: string, mail: Mail) {
  const add = (items: Mail[]) => {
    const last = items[items.length - 1];
    return last?.id === mail.id && last.reply === mail.reply ? items : [...items, mail].slice(-MAX_MAIL); // (a retry after a failed save)
  };
  if (!blobEnabled()) {
    const all = await readLocalMail();
    all[box] = add(all[box] ?? []);
    await writeLocalFile(mailFile(), JSON.stringify(all));
    return;
  }
  const doc = await readBlobDoc(`replies/${box}.json`); // throws if unreadable, so a failed read never wipes it
  await writeBlob(`replies/${box}.json`, JSON.stringify({ items: add(doc ? (JSON.parse(doc.text) as { items: Mail[] }).items : []) }));
}

/** Answer a message: into the player's mailbox (unless it went by email), and onto the feedback, now dealt with. */
export async function addReply(f: Feedback, text: string, via: Reply['via'], now = Date.now()) {
  const reply: Reply = { text, at: now, via };
  const box = via === 'app' ? boxFor(f) : null;
  if (box) await addMail(box, { id: f.id, message: f.text, reply: text, at: now });
  await saveFeedback({ ...f, status: 'done', replies: [...(f.replies ?? []), reply] });
  return reply;
}
