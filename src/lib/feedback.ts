import { api } from './api';

// Open the feedback form from anywhere (the menu, an error card, a ?feedback=1 link).
export type FeedbackKind = 'idea' | 'bug' | 'feature' | 'other';

export function openFeedback(kind?: FeedbackKind, where?: string) {
  window.dispatchEvent(new CustomEvent('gq:feedback', { detail: { kind, where } }));
}

// The one-time "Enjoying GeoQuest?" ask: for returning players, and never again once they've sent
// feedback or said no thanks.
const DONE = 'gq-fb-done';
const VISITS = 'gq-visits';
export const feedbackAsked = () => { try { return localStorage.getItem(DONE) === '1'; } catch { return true; } };
export const markFeedbackAsked = () => { try { localStorage.setItem(DONE, '1'); } catch { /* private mode */ } };
/** Count this visit (a return after 30+ minutes away); how many visits so far. */
export function countVisit(now = Date.now()) {
  try {
    const v = JSON.parse(localStorage.getItem(VISITS) ?? '{"n":0,"last":0}') as { n: number; last: number };
    if (now - v.last > 30 * 60_000) v.n++;
    v.last = now;
    localStorage.setItem(VISITS, JSON.stringify(v));
    return v.n;
  } catch { return 0; }
}

// Replies from GeoQuest. A guest has no account for them to go to, so the first message they send
// makes a random key, kept in this browser; only the key's holder can read what comes back. What's
// been read is remembered here too, so reading never costs a write.
export interface FeedbackReply { id: string; message: string; reply: string; at: number }
const REPLY_KEY = 'gq-fb-key';
const REPLIES_SEEN = 'gq-fb-seen';
export function replyKey(create = false) {
  try {
    let k = localStorage.getItem(REPLY_KEY);
    if (!k && create) {
      k = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(REPLY_KEY, k);
    }
    return k ?? '';
  } catch { return ''; }
}
export async function fetchReplies(): Promise<FeedbackReply[]> {
  const key = replyKey();
  const r = await api('/api/feedback/replies', key ? { headers: { 'X-GQ-Reply-Key': key } } : undefined);
  if (!r.ok) throw new Error('replies');
  return ((await r.json()) as { replies: FeedbackReply[] }).replies;
}
export const repliesSeen = () => { try { return Number(localStorage.getItem(REPLIES_SEEN)) || 0; } catch { return 0; } };
export const markRepliesSeen = (at: number) => { try { localStorage.setItem(REPLIES_SEEN, String(at)); } catch { /* private mode */ } };
