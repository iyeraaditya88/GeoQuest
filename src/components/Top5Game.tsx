import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Flag, Heart, Lightbulb, ListOrdered, Loader2, Sparkles, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { BY_CCA3, flagUrl } from '../lib/data';
import { matchAnswer, norm, shuffledQuestions, type Top5Question } from '../lib/top5';

const STRIKES = 3;

interface Props {
  ai: boolean | null;
  onHighlight: (cca3s: string[]) => void;
  onExit: () => void;
}

type Feedback = { kind: 'good' | 'bad' | 'dup' | 'info'; text: string } | null;

export function Top5Game({ ai, onHighlight, onExit }: Props) {
  const deck = useMemo(() => shuffledQuestions(), []);
  const [qi, setQi] = useState(0);
  const [found, setFound] = useState<Set<number>>(new Set());
  const [misses, setMisses] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [input, setInput] = useState('');
  const [checking, setChecking] = useState<string | false>(false); // the guess being checked
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [total, setTotal] = useState({ got: 0, of: 0 });
  const field = useRef<HTMLInputElement>(null);
  const q: Top5Question = deck[qi % deck.length];
  const done = revealed || found.size === 5 || misses.length >= STRIKES;

  useEffect(() => { setTimeout(() => field.current?.focus(), 120); }, [qi]);

  // Light up found countries on the globe.
  useEffect(() => {
    const ids = q.answers.filter((a, i) => a.cca3 && (found.has(i) || revealed)).map((a) => a.cca3!);
    onHighlight(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, revealed, qi]);

  useEffect(() => {
    if (found.size === 5) {
      confetti({ particleCount: 110, spread: 80, origin: { y: 0.25 }, colors: ['#fde68a', '#34d399', '#7dd3fc', '#f9a8d4'], disableForReducedMotion: true });
      setFeedback({ kind: 'good', text: 'Perfect — all five!' });
    }
  }, [found.size]);

  const flash = (f: Feedback) => setFeedback(f);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const guess = input.trim();
    if (!guess || done || checking) return;
    setInput('');

    let idx = matchAnswer(guess, q.answers);
    // Semantically right but spelled differently? Let Claude decide (when connected).
    if (idx < 0 && ai) {
      setChecking(guess);
      try {
        const r = await fetch('/api/match', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guess, question: q.title, options: q.answers.map((a) => a.name) }),
        }).then((x) => x.json());
        if (r.match) idx = q.answers.findIndex((a) => a.name === r.match);
      } catch { /* offline: treat as a miss */ }
      setChecking(false);
    }

    if (idx >= 0) {
      if (found.has(idx)) { flash({ kind: 'dup', text: `${q.answers[idx].name} is already on the board` }); return; }
      const next = new Set(found).add(idx);
      setFound(next);
      flash({ kind: 'good', text: `${q.answers[idx].name} — #${idx + 1}${q.answers[idx].detail ? ` · ${q.answers[idx].detail}` : ''}` });
      return;
    }
    if (misses.some((m) => norm(m) === norm(guess))) { flash({ kind: 'dup', text: 'You already tried that one' }); return; }
    const m = [...misses, guess];
    setMisses(m);
    flash({ kind: 'bad', text: m.length >= STRIKES ? 'Out of strikes — here are the answers' : `Not in the top 5 · ${STRIKES - m.length} strike${STRIKES - m.length === 1 ? '' : 's'} left` });
  }

  function next() {
    setTotal((t) => ({ got: t.got + found.size, of: t.of + 5 }));
    setQi((i) => i + 1);
    setFound(new Set());
    setMisses([]);
    setRevealed(false);
    setFeedback(null);
    setInput('');
  }

  return (
    <motion.div
      className="game-card top5"
      initial={{ y: -30, opacity: 0, scale: 0.98 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: -20, opacity: 0, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
    >
      <header className="gc-head">
        <span className="gc-badge"><ListOrdered size={15} /></span>
        <div className="gc-title">
          <b>Name the Top 5</b>
          <span>{total.of ? `${total.got}/${total.of} so far` : 'Type answers in any order'}</span>
        </div>
        <div className="gc-strikes" aria-label={`${STRIKES - misses.length} strikes left`}>
          {Array.from({ length: STRIKES }, (_, i) => (
            <motion.span key={i} animate={{ scale: i < STRIKES - misses.length ? 1 : 0.7, opacity: i < STRIKES - misses.length ? 1 : 0.25 }}>
              <Heart size={14} fill="currentColor" />
            </motion.span>
          ))}
        </div>
        <button className="icon-btn" onClick={onExit} aria-label="Close game"><X size={17} /></button>
      </header>

      <AnimatePresence mode="wait">
        <motion.div key={q.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
          <div className="t5-q">
            <span className="chip ghost">{q.category}</span>
            <h3>{q.title}</h3>
            {q.hint && <p><Lightbulb size={13} /> {q.hint}</p>}
          </div>

          <ol className="t5-slots">
            {q.answers.map((a, i) => {
              const show = found.has(i) || done;
              const c = a.cca3 ? BY_CCA3.get(a.cca3) : undefined;
              return (
                <li key={i} className={`${found.has(i) ? 'got' : show ? 'missed' : ''}`}>
                  <span className="t5-rank">{i + 1}</span>
                  <AnimatePresence mode="wait">
                    {show ? (
                      <motion.span key="a" className="t5-answer" initial={{ opacity: 0, x: -10, filter: 'blur(4px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
                        {c && <img src={flagUrl(c.cca2, 80)} alt="" />}
                        <b>{a.name}</b>
                        {a.detail && <em>{a.detail}</em>}
                      </motion.span>
                    ) : (
                      <motion.span key="b" className="t5-blank" exit={{ opacity: 0 }} />
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ol>
        </motion.div>
      </AnimatePresence>

      {!done ? (
        <form className="t5-input" onSubmit={submit}>
          <input
            ref={field}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type an answer and press Enter…"
            spellCheck={false}
            autoComplete="off"
            onKeyDown={(e) => { if (e.key === 'Escape') onExit(); }}
          />
          <button type="submit" className="send" disabled={!input.trim() || !!checking} aria-label="Submit">
            {checking ? <Loader2 size={16} className="spin" /> : <ArrowRight size={17} />}
          </button>
        </form>
      ) : (
        <div className="t5-done">
          <span className="t5-score">{found.size}<small>/5</small></span>
          <span className="t5-verdict">{found.size === 5 ? 'Flawless.' : found.size >= 3 ? 'Solid geography.' : found.size >= 1 ? 'Getting there.' : 'Tough one!'}</span>
          <button className="primary sm" onClick={next} autoFocus>Next question <ArrowRight size={15} /></button>
        </div>
      )}

      <div className="gc-foot">
        <AnimatePresence mode="wait">
          {feedback && !checking && (
            <motion.span key={feedback.text} className={`gc-feedback ${feedback.kind}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {feedback.text}
            </motion.span>
          )}
        </AnimatePresence>
        {checking && <span className="gc-feedback info"><Sparkles size={12} /> Checking “{checking}” with the Atlas…</span>}
        <span className="gc-spacer" />
        {!done && <button className="skip" onClick={() => setRevealed(true)}><Flag size={13} /> Give up</button>}
        {!done && <button className="skip" onClick={next}>Skip</button>}
      </div>
      {misses.length > 0 && !done && <div className="t5-misses">Tried: {misses.join(' · ')}</div>}
    </motion.div>
  );
}
