// Open the feedback form from anywhere (the menu, an error card, a ?feedback=1 link).
export type FeedbackKind = 'idea' | 'bug' | 'feature' | 'other';

export function openFeedback(kind?: FeedbackKind, where?: string) {
  window.dispatchEvent(new CustomEvent('gq:feedback', { detail: { kind, where } }));
}
