import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MessageCircle, Send, X } from 'lucide-react';
import { CHAT_MAX, type ChatMsg, type MatchSession, type Snapshot } from '../lib/match';
import { TOUCH } from '../lib/touch';

const REACTIONS = ['😂', '🔥', '👏', '😱', '😤', 'GG'];
const BUBBLE_MS = 5000;
const wide = () => typeof window !== 'undefined' && window.innerWidth >= 1200; // room beside the lobby / results card

/**
 * Banter during a live match. Open in the lobby and on the results (on big screens); folded into
 * a button while a question is on, with new messages popping up beside it for a few seconds.
 */
export function MatchChat({ s, session }: { s: Snapshot; session: MatchSession }) {
  const playing = s.phase === 'countdown' || s.phase === 'question' || s.phase === 'reveal';
  const [open, setOpen] = useState(() => !playing && wide());
  const [text, setText] = useState('');
  const [seen, setSeen] = useState(s.chat.length ? s.chat[s.chat.length - 1].id : 0);
  const [bubbles, setBubbles] = useState<ChatMsg[]>([]);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Fold away when the game starts; unfold for the results (big screens).
  const stage = playing ? 'play' : s.phase === 'done' || s.phase === 'aborted' ? 'end' : 'lobby';
  useEffect(() => { setOpen(stage !== 'play' && wide()); }, [stage]);

  const last = s.chat[s.chat.length - 1];
  useEffect(() => {
    if (!last) return;
    if (open) { setSeen(last.id); return; }
    if (last.from === s.me) return;
    // Folded: show it beside the button for a moment.
    setBubbles((b) => [...b.filter((m) => m.id !== last.id), last].slice(-3));
    const t = window.setTimeout(() => setBubbles((b) => b.filter((m) => m.id !== last.id)), BUBBLE_MS);
    return () => window.clearTimeout(t);
  }, [last, open, s.me]);
  useEffect(() => {
    if (!open) return;
    setBubbles([]);
    if (last) setSeen(last.id);
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [open, last]);

  const unread = s.chat.filter((m) => m.id > seen && m.from !== s.me).length;
  const send = (t = text) => {
    if (session.say(t) && t === text) setText('');
    if (!TOUCH) input.current?.focus();
  };
  const toggle = () => { setOpen((o) => !o); if (!open && !TOUCH) setTimeout(() => input.current?.focus(), 60); };

  return (
    <div className={`mc ${s.game === 'street' && playing ? 'top' : ''} ${playing ? 'playing' : ''}`}>
      <AnimatePresence>
        {open && (
          <motion.section className="mc-panel" role="dialog" aria-label="Match chat"
            initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
            <header>
              <MessageCircle size={14} /> <b>Chat</b>
              <span>{s.players.filter((p) => p.status === 'joined').length} in the match</span>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close chat"><X size={15} /></button>
            </header>
            <div className="mc-list" ref={list} aria-live="polite">
              {s.chat.length ? s.chat.map((m, i) => {
                const mine = m.from === s.me;
                const cont = s.chat[i - 1]?.from === m.from;
                return (
                  <div key={m.id} className={`mc-msg ${mine ? 'me' : ''} ${cont ? 'cont' : ''} ${/^\p{Extended_Pictographic}{1,3}$/u.test(m.text) ? 'emoji' : ''}`}>
                    {!mine && !cont && <span className="mc-from">{m.from}</span>}
                    <p>{m.text}</p>
                  </div>
                );
              }) : <p className="mc-empty">Say hi — or talk a little trash 😄</p>}
            </div>
            <div className="mc-react">
              {REACTIONS.map((r) => <button key={r} onClick={() => send(r)} aria-label={`Send ${r}`}>{r}</button>)}
            </div>
            <form className="mc-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={CHAT_MAX} placeholder="Message…" aria-label="Message"
                enterKeyHint="send" autoComplete="off" onKeyDown={(e) => e.stopPropagation()} />
              <button type="submit" className="mc-send" disabled={!text.trim()} aria-label="Send"><Send size={15} /></button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      {!open && (
        <>
          <div className="mc-bubbles" aria-hidden>
            <AnimatePresence>
              {bubbles.map((m) => (
                <motion.div key={m.id} className="mc-bubble" layout initial={{ opacity: 0, x: 12, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                  <b>{m.from}</b> {m.text}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <motion.button className="mc-fab" onClick={toggle} aria-label={unread ? `Chat — ${unread} new` : 'Open chat'} whileTap={{ scale: 0.92 }}>
            <MessageCircle size={19} />
            {unread > 0 && <span className="mc-badge">{unread > 9 ? '9+' : unread}</span>}
          </motion.button>
        </>
      )}
    </div>
  );
}
