import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { BarChart3, Check, Copy, Delete, Globe2, Grid3x3, Lightbulb, RotateCcw, Share2, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { BY_CCA3, flagUrl } from '../lib/data';
import { addDays, localDate } from '../lib/daily';
import {
  TRIES, addResult, bonusWordle, canHint, countriesOfLength, dailyWordle, emptyStats, invalidReason, keyStates,
  letters, score, wordleHints, wordleNumber, wordleShare, type Mark, type WordleStats,
} from '../lib/wordle';
import { track } from '../lib/analytics';

interface Props {
  onReveal: (cca3: string) => void;
  onExit: () => void;
  /** Close the game and open this country on the globe. */
  onShowCountry: (cca3: string) => void;
}
type Mode = 'daily' | 'bonus';
interface Row { guess: string; marks: Mark[] }
interface Progress { g: string[]; h: number }

const KEYS = ['QWERTYUIOP', 'ASDFGHJKL', '+ZXCVBNM-'];
const VERDICT = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];
const DAILY_KEY = (date: string) => `gq-wordle-${date}`;
const STATS_KEY = 'gq-wordle-stats';
function loadProgress(date: string): Progress {
  try {
    const v = JSON.parse(localStorage.getItem(DAILY_KEY(date)) ?? 'null');
    if (Array.isArray(v)) return { g: v, h: 0 }; // (saved by the first version: just the guesses)
    if (v && Array.isArray(v.g)) return { g: v.g, h: Number(v.h) || 0 };
  } catch { /* none */ }
  return { g: [], h: 0 };
}
const saveProgress = (date: string, p: Progress) => { try { localStorage.setItem(DAILY_KEY(date), JSON.stringify(p)); } catch { /* private mode */ } };
/** Today's bonus round, if one was started (so reopening the game picks up the last game played). */
const BONUS_KEY = 'gq-wordle-bonus';
interface Bonus extends Progress { d: string; a: string }
function loadBonus(date: string): Bonus | null {
  try {
    const v = JSON.parse(localStorage.getItem(BONUS_KEY) ?? 'null');
    if (v && v.d === date && typeof v.a === 'string' && BY_CCA3.has(v.a) && Array.isArray(v.g)) return { d: v.d, a: v.a, g: v.g, h: Number(v.h) || 0 };
  } catch { /* none */ }
  return null;
}
const saveBonus = (b: Bonus) => { try { localStorage.setItem(BONUS_KEY, JSON.stringify(b)); } catch { /* private mode */ } };
const loadStats = (): WordleStats => { try { return { ...emptyStats(), ...JSON.parse(localStorage.getItem(STATS_KEY) ?? '{}') }; } catch { return emptyStats(); } };
const saveStats = (s: WordleStats) => { try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch { /* private mode */ } };

/** Geo Wordle: guess the country in six tries — every guess a real country of the same length. */
export function GeoWordle({ onReveal, onExit, onShowCountry }: Props) {
  const date = localDate();
  // Start where you left off: today's bonus round if you've begun one, else the Daily.
  const [start] = useState(() => { const b = loadBonus(date); return b ? { mode: 'bonus' as Mode, answer: b.a, ...b } : { mode: 'daily' as Mode, answer: dailyWordle(date), ...loadProgress(date) }; });
  const [mode, setMode] = useState<Mode>(start.mode);
  const [answer, setAnswer] = useState(start.answer);
  const [guesses, setGuesses] = useState<string[]>(start.g);
  const [hints, setHints] = useState(start.h);
  const [typed, setTypedState] = useState('');
  const typedRef = useRef(''); // always current (Enter right after the last letter must see it)
  const setTyped = (v: string | ((t: string) => string)) => { const n = typeof v === 'function' ? v(typedRef.current) : v; typedRef.current = n; setTypedState(n); };
  const [msg, setMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState(loadStats);
  const [resultOpen, setResultOpen] = useState(false);

  const target = BY_CCA3.get(answer)!;
  const word = letters(target.name);
  const len = word.length;
  const rows: Row[] = useMemo(() => guesses.map((g) => ({ guess: letters(g), marks: score(g, word) })), [guesses, word]);
  const won = rows.some((r) => r.guess === word);
  const triesLeft = TRIES - rows.length - hints;
  const done = won || triesLeft <= 0;
  const keys = useMemo(() => keyStates(rows), [rows]);
  const hintTexts = useMemo(() => wordleHints(answer), [answer]);

  // Over: reveal on the globe (once per country), then the result — after the last row has flipped,
  // or straight away when reopening a Daily that's already finished.
  const finishedAtOpen = useRef(done);
  const revealed = useRef<string | null>(null);
  useEffect(() => {
    if (!done || revealed.current === answer) return;
    revealed.current = answer;
    onReveal(answer);
  }, [done, answer, onReveal]);
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setResultOpen(true), finishedAtOpen.current ? 350 : len * 90 + 900);
    finishedAtOpen.current = false;
    return () => window.clearTimeout(t);
  }, [done, answer, len]);

  const record = (next: string[], h: number, right: boolean) => {
    persist(next, h);
    if (!right && TRIES - next.length - h > 0) return;
    track('score', { g: 'wordle', s: right ? next.length : 0, of: TRIES, h });
    if (right) window.setTimeout(() => confetti({ particleCount: 120, spread: 80, origin: { y: 0.3 }, colors: ['#34d399', '#facc15', '#fde68a'], disableForReducedMotion: true }), len * 90 + 300);
    if (mode === 'daily') { const st = addResult(loadStats(), date, right ? next.length : null, addDays(date, -1)); saveStats(st); setStats(st); }
  };

  const submit = useCallback(() => {
    if (done) return;
    const t = typedRef.current;
    const bad = invalidReason(t, word);
    if (bad) { setMsg(bad); setShake((n) => n + 1); return; }
    if (guesses.some((g) => letters(g) === letters(t))) { setMsg('Already tried that one.'); setShake((n) => n + 1); return; }
    const next = [...guesses, t];
    setGuesses(next); setTyped(''); setMsg(null);
    record(next, hints, letters(t) === word);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, word, guesses, hints, mode, date]);

  const press = useCallback((k: string) => {
    if (done) return;
    setMsg(null);
    if (k === 'ENTER') submit();
    else if (k === 'BACK') setTyped((t) => t.slice(0, -1));
    else if (/^[A-Z]$/.test(k)) setTyped((t) => (t.length < len ? t + k : t));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, submit, len]);

  // The real keyboard too (unless you're typing somewhere else, or the result is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (resultOpen || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
      if (e.key === 'Enter') { e.preventDefault(); press('ENTER'); }
      else if (e.key === 'Backspace') press('BACK');
      else if (/^[a-z]$/i.test(e.key)) press(e.key.toUpperCase());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, resultOpen]);

  const takeHint = () => {
    if (!canHint(rows.length, hints, won)) return;
    const h = hints + 1;
    setHints(h); setMsg(null);
    track('hint', { g: 'wordle', n: h });
    persist(guesses, h);
  };
  const persist = (g: string[], h: number, a = answer, m = mode) => (m === 'daily' ? saveProgress(date, { g, h }) : saveBonus({ d: date, a, g, h }));
  const bonus = () => {
    const a = bonusWordle(answer);
    track('game', { g: 'wordle', m: 'bonus' });
    setResultOpen(false); setMode('bonus'); setAnswer(a); setGuesses([]); setHints(0); setTyped(''); setMsg(null);
    persist([], 0, a, 'bonus');
  };
  const share = async () => {
    const text = `${wordleShare(wordleNumber(date), rows.map((r) => r.marks), won, hints)}\n${location.origin}/?wordle=1&ref=share`;
    track('share', { g: 'wordle' });
    if (typeof navigator.share === 'function') { await navigator.share({ text }).catch(() => null); return; }
    try { await navigator.clipboard.writeText(text); } catch { /* blocked */ }
    setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  };
  const closeResult = useCallback(() => setResultOpen(false), []);

  // The grid: guesses, the row being typed, empty rows — and the tries spent on hints, from the bottom.
  const lines = Array.from({ length: TRIES }, (_, i) => {
    if (i < rows.length) return { kind: 'guess' as const, ...rows[i] };
    if (i >= TRIES - hints) return { kind: 'hint' as const, guess: '', marks: [] as Mark[] };
    if (i === rows.length && !done) return { kind: 'typing' as const, guess: typed, marks: [] as Mark[] };
    return { kind: 'empty' as const, guess: '', marks: [] as Mark[] };
  });
  const hintable = !done && canHint(rows.length, hints, won);

  return (
    <motion.div className="game-card wordle" style={{ ['--n' as string]: len }} initial={{ y: -30, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -20, opacity: 0, scale: 0.98 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
      <header className="gc-head">
        <span className="gc-badge gw-badge"><Grid3x3 size={15} /></span>
        <div className="gc-title">
          <b>Geo Wordle</b>
          <span>{mode === 'daily' ? `Daily #${wordleNumber(date)}` : 'Bonus round'}</span>
        </div>
        <span className="gc-spacer" />
        {done && <button className="icon-btn" onClick={() => setResultOpen(true)} aria-label="Results"><BarChart3 size={16} /></button>}
        <button className="icon-btn" onClick={onExit} aria-label="Close game"><X size={17} /></button>
      </header>

      <div className="gw-info">
        <span><b>{len}</b> letters</span>
        <span><b>{countriesOfLength(len)}</b> countries this long</span>
        <span className={triesLeft <= 1 && !done ? 'warn' : ''}><b>{Math.max(0, triesLeft)}</b> {triesLeft === 1 ? 'try' : 'tries'} left</span>
      </div>

      <div className="gw-grid" role="grid" aria-label="Guesses">
        {lines.map((r, i) => r.kind === 'hint' ? (
          // A try spent on a hint shows the hint itself, in its place on the board.
          <motion.div key={`h${i}`} className="gw-row gw-hintrow" role="row" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
            <Lightbulb size={14} /><span><em>Hint {i - (TRIES - hints) + 1}</em> {hintTexts[i - (TRIES - hints)]}</span>
          </motion.div>
        ) : (
          <motion.div key={`${mode}-${answer}-${i}`} className="gw-row" role="row" animate={r.kind === 'typing' && shake ? { x: [0, -8, 8, -5, 5, 0] } : {}} transition={{ duration: 0.35 }} data-shake={r.kind === 'typing' ? shake : 0}>
            {Array.from({ length: len }, (_, j) => {
              const ch = r.guess[j] ?? '';
              const m = r.marks[j];
              return (
                <motion.span key={`${j}-${ch}-${m ?? ''}`} role="gridcell" className={`gw-tile ${m ?? (ch ? 'typed' : '')}`}
                  initial={m ? { rotateX: 90 } : ch && r.kind === 'typing' ? { scale: 1.14 } : false}
                  animate={m ? { rotateX: 0 } : { scale: 1 }}
                  transition={m ? { delay: j * 0.09, duration: 0.3 } : { duration: 0.12 }}>{ch}</motion.span>
              );
            })}
          </motion.div>
        ))}
      </div>

      <p className={`gw-msg ${msg ? 'bad' : ''}`} aria-live="polite">{msg ?? (done ? '' : rows.length === 0 ? 'Type any country’s letters (no spaces), then Enter.' : 'Green: right spot · Yellow: in the name, elsewhere')}</p>

      {hintable && (
        <motion.button className="gw-hint-btn" onClick={takeHint} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <Lightbulb size={15} /> <b>{hints ? 'Another hint' : 'Stuck? Get a hint'}</b> <em>costs 1 try</em>
        </motion.button>
      )}

      {done ? (
        <div className={`gw-end ${won ? 'won' : ''}`}>
          <img src={flagUrl(target.cca2, 160)} alt="" />
          <div><b>{target.name}</b><span>{won ? `Solved in ${rows.length}/${TRIES}` : 'Not this time'}{target.capital[0] ? ` · ${target.capital[0]}` : ''}</span></div>
          <button className="primary sm" onClick={() => setResultOpen(true)}><BarChart3 size={14} /> Results</button>
        </div>
      ) : (
        <div className="gw-keys" aria-label="Keyboard">
          {KEYS.map((row) => (
            <div key={row} className="gw-krow">
              {[...row].map((k) => k === '+'
                ? <button key="enter" className="gw-key wide enter" onClick={() => press('ENTER')}>Enter</button>
                : k === '-'
                  ? <button key="back" className="gw-key wide" onClick={() => press('BACK')} aria-label="Delete"><Delete size={18} /></button>
                  : <button key={k} className={`gw-key ${keys[k] ?? ''}`} onClick={() => press(k)}>{k}</button>)}
            </div>
          ))}
        </div>
      )}

      {createPortal(
        <AnimatePresence>
          {resultOpen && done && (
            <WordleResult key="result" mode={mode} no={wordleNumber(date)} won={won} tries={rows.length} hints={hints} rows={rows} target={target.cca3}
              stats={stats} copied={copied} onShare={() => void share()} onBonus={bonus} onClose={closeResult} onShow={() => onShowCountry(target.cca3)} />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </motion.div>
  );
}

/** The result: the answer, your rows, and (for the Daily) your stats and guess distribution. */
function WordleResult({ mode, no, won, tries, hints, rows, target, stats, copied, onShare, onBonus, onClose, onShow }: {
  mode: Mode; no: number; won: boolean; tries: number; hints: number; rows: Row[]; target: string; stats: WordleStats; copied: boolean;
  onShare: () => void; onBonus: () => void; onClose: () => void; onShow: () => void;
}) {
  const c = BY_CCA3.get(target)!;
  useEffect(() => {
    // Esc closes just this (caught first, so it doesn't also close the game).
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const most = Math.max(1, ...stats.dist);
  const winPct = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
  const where = [c.capital[0] && `Capital ${c.capital[0]}`, c.subregion || c.region].filter(Boolean).join(' · ');
  return (
    <motion.div className="people-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section className="people gw-result" role="dialog" aria-modal="true" aria-label="Geo Wordle result" onClick={(e) => e.stopPropagation()}
        initial={{ y: 18, scale: 0.97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 10, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }}>
        <header className="gc-head">
          <span className="gc-badge gw-badge"><Grid3x3 size={15} /></span>
          <div className="gc-title"><b>Geo Wordle</b><span>{mode === 'daily' ? `Daily #${no}` : 'Bonus round'}</span></div>
          <span className="gc-spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </header>

        <div className={`gwr-hero ${won ? 'won' : ''}`}>
          <motion.div className="gwr-verdict" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 16, delay: 0.1 }}>
            {won ? VERDICT[Math.min(tries + hints, TRIES) - 1] : 'So close!'}
          </motion.div>
          <div className="gwr-answer">
            <img src={flagUrl(c.cca2, 160)} alt="" />
            <div><b>{c.name}</b>{where && <span>{where}</span>}</div>
          </div>
          <button className="gwr-globe" onClick={onShow}><Globe2 size={15} /> Show {c.name} on the globe</button>
          <div className="gwr-mini" aria-label="Your guesses">
            {rows.map((r, i) => <div key={i}>{r.marks.map((m, j) => <i key={j} className={m} />)}</div>)}
          </div>
          <div className="gwr-sub">{won ? `Solved in ${tries}/${TRIES}` : `Not solved this time`}{hints ? ` · 💡 ${hints} hint${hints > 1 ? 's' : ''}` : ''}</div>
        </div>

        {mode === 'daily' && (
          <>
            <div className="gwr-stats">
              <div><b>{stats.played}</b><span>Played</span></div>
              <div><b>{winPct}</b><span>Win %</span></div>
              <div><b>{stats.streak}</b><span>Streak</span></div>
              <div><b>{stats.best}</b><span>Best</span></div>
            </div>
            <div className="fr-label">Guess distribution</div>
            <ol className="gwr-dist">
              {stats.dist.map((n, i) => (
                <li key={i} className={won && tries === i + 1 ? 'today' : ''}>
                  <span>{i + 1}</span>
                  <motion.i initial={{ width: '8%' }} animate={{ width: `${Math.max(8, (n / most) * 100)}%` }} transition={{ delay: 0.15 + i * 0.05, duration: 0.45 }}><b>{n}</b></motion.i>
                </li>
              ))}
            </ol>
          </>
        )}

        <div className="gwr-actions">
          {mode === 'daily' && (
            <button className="primary" onClick={onShare}>{copied ? <><Check size={15} /> Copied</> : typeof navigator.share === 'function' ? <><Share2 size={15} /> Share</> : <><Copy size={15} /> Copy result</>}</button>
          )}
          <button className={mode === 'daily' ? 'ghost-cta' : 'primary'} onClick={onBonus}><RotateCcw size={15} /> {mode === 'daily' ? 'Bonus round' : 'Another one'}</button>
        </div>
        {mode === 'daily' && <p className="gwr-next">A new country every day.</p>}
      </motion.section>
    </motion.div>
  );
}
