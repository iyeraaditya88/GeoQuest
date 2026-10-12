import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Bug, Check, Lightbulb, Loader2, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { api } from '../lib/api';
import { device, track } from '../lib/analytics';
import { markFeedbackAsked, type FeedbackKind } from '../lib/feedback';

const KINDS: { id: FeedbackKind; label: string; icon: typeof Bug; hint: string }[] = [
  { id: 'idea', label: 'Improvement', icon: Lightbulb, hint: 'What could be better? Anything that felt confusing or clunky…' },
  { id: 'bug', label: 'Bug', icon: Bug, hint: 'What went wrong, and what were you doing just before?' },
  { id: 'feature', label: 'Feature request', icon: Sparkles, hint: 'What would you love GeoQuest to do?' },
  { id: 'other', label: 'General', icon: MessageCircle, hint: 'Anything at all — we read every message.' },
];

interface Props {
  kind?: FeedbackKind;
  /** Where in the app they are (sent along, so a bug report has context) */
  where: string;
  /** Signed in as… (guests can leave a way to reach them) */
  user: string | null;
  onClose: () => void;
}

/** Send feedback: pick what kind, write a few words, optionally how to reach you. */
export function FeedbackSheet({ kind: start, where, user, onClose }: Props) {
  const [kind, setKind] = useState<FeedbackKind>(start ?? 'idea');
  const [text, setText] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const honey = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    if (window.matchMedia('(hover: hover)').matches) field.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = async () => {
    if (text.trim().length < 4) { setError('Tell us a little more — a few words is plenty.'); field.current?.focus(); return; }
    setBusy(true); setError(null);
    try {
      const r = await api('/api/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, text, contact, where, website: honey.current?.value ?? '', ...device() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? 'Couldn’t send that — try again in a moment.'); return; }
      track('feedback', { k: kind });
      markFeedbackAsked();
      setSent(true);
    } catch { setError('Couldn’t reach GeoQuest — check your connection.'); }
    finally { setBusy(false); }
  };

  const k = KINDS.find((x) => x.id === kind)!;
  return (
    <motion.div className="people-backdrop si-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section className="si-sheet fb-sheet" role="dialog" aria-modal="true" aria-labelledby="fb-title" onClick={(e) => e.stopPropagation()}
        initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
        <button className="icon-btn si-close" onClick={onClose} aria-label="Close"><X size={17} /></button>
        {sent ? (
          <div className="fb-done">
            <span className="fb-tick"><Check size={26} /></span>
            <h2 id="fb-title">Thank you!</h2>
            <p className="si-sub">{contact.trim() ? 'We read every message — and we’ll get back to you if we need to.' : 'We read every message. It really helps make GeoQuest better.'}</p>
            <button className="primary si-go" onClick={onClose}>Back to the globe</button>
          </div>
        ) : (
          <>
            <h2 id="fb-title">Send feedback</h2>
            <p className="si-sub">Ideas, bugs, wishes — tell us anything.</p>
            <div className="fb-kinds" role="radiogroup" aria-label="What kind of feedback">
              {KINDS.map(({ id, label, icon: Icon }) => (
                <button key={id} role="radio" aria-checked={kind === id} className={kind === id ? 'on' : ''} onClick={() => setKind(id)}><Icon size={15} /> {label}</button>
              ))}
            </div>
            <textarea ref={field} className="fb-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={k.hint} rows={5} maxLength={2000} aria-label="Your feedback" />
            {!user && (
              <input className="fb-contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Email, if you’d like a reply (optional)" type="email" autoComplete="email" maxLength={120} aria-label="Your email (optional)" />
            )}
            {/* Bots fill this in; people never see it. */}
            <input ref={honey} className="fb-honey" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            {error && <p className="fb-error">{error}</p>}
            <div className="si-actions">
              <button className="primary si-go" onClick={() => void send()} disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : <Send size={16} />} Send</button>
            </div>
            <p className="fb-note">{user ? `Sent as ${user}` : 'No account needed'} · we include where you were in the app and your device type, to help fix bugs.</p>
          </>
        )}
      </motion.section>
    </motion.div>
  );
}
