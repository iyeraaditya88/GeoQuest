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
