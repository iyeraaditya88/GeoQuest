import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Copy, Delete, Grid3x3, RotateCcw, Share2, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { BY_CCA3, flagUrl } from '../lib/data';
import { localDate } from '../lib/daily';
import { TRIES, bonusWordle, countriesOfLength, dailyWordle, invalidReason, keyStates, letters, score, wordleHint, wordleNumber, wordleShare, type Mark } from '../lib/wordle';
import { track } from '../lib/analytics';

interface Props {
  onReveal: (cca3: string) => void;
  onExit: () => void;
}
type Mode = 'daily' | 'bonus';
interface Row { guess: string; marks: Mark[] }

const KEYS = ['QWERTYUIOP', 'ASDFGHJKL', '+ZXCVBNM-'];
const saved = (date: string): string[] => { try { const v = JSON.parse(localStorage.getItem(`gq-wordle-${date}`) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const save = (date: string, guesses: string[]) => { try { localStorage.setItem(`gq-wordle-${date}`, JSON.stringify(guesses)); } catch { /* private mode */ } };

/** Geo Wordle: guess today's country in six tries — every guess a real country of the same length. */
export function GeoWordle({ onReveal, onExit }: Props) {
  const date = localDate();
  const [mode, setMode] = useState<Mode>('daily');
  const [answer, setAnswer] = useState(() => dailyWordle(date));
  const [guesses, setGuesses] = useState<string[]>(() => saved(date));
  const [typed, setTypedState] = useState('');
  // The letters typed so far, always current (Enter right after the last letter must see it).
  const typedRef = useRef('');
  const setTyped = (v: string | ((t: string) => string)) => {
    const next = typeof v === 'function' ? v(typedRef.current) : v;
    typedRef.current = next;
    setTypedState(next);
  };
  const [msg, setMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [copied, setCopied] = useState(false);

  const target = BY_CCA3.get(answer)!;
  const word = letters(target.name);
  const len = word.length;
  const rows: Row[] = useMemo(() => guesses.map((g) => ({ guess: letters(g), marks: score(g, word) })), [guesses, word]);
  const won = rows.some((r) => r.guess === word);
  const done = won || rows.length >= TRIES;
  const keys = useMemo(() => keyStates(rows), [rows]);

  // Reveal on the globe once it's over (also when reopening a finished Daily) — once per country.
  const revealed = useRef<string | null>(null);
  useEffect(() => {
    if (done && revealed.current !== answer) { revealed.current = answer; onReveal(answer); }
  }, [done, answer, onReveal]);

  const submit = useCallback(() => {
    if (done) return;
    const typed = typedRef.current;
    const bad = invalidReason(typed, word);
    if (bad) { setMsg(bad); setShake((n) => n + 1); return; }
    if (guesses.some((g) => letters(g) === letters(typed))) { setMsg('Already tried that one.'); setShake((n) => n + 1); return; }
    const next = [...guesses, typed];
    setGuesses(next); setTyped(''); setMsg(null);
    if (mode === 'daily') save(date, next);
    const right = letters(typed) === word;
    if (right || next.length >= TRIES) {
      track('score', { g: 'wordle', s: right ? next.length : 0, of: TRIES });
      if (right) confetti({ particleCount: 110, spread: 80, origin: { y: 0.25 }, colors: ['#34d399', '#facc15', '#fde68a'], disableForReducedMotion: true });
    }
  }, [done, word, guesses, mode, date]);

  const press = useCallback((k: string) => {
    if (done) return;
    setMsg(null);
    if (k === 'ENTER') submit();
    else if (k === 'BACK') setTyped((t) => t.slice(0, -1));
    else if (/^[A-Z]$/.test(k)) setTyped((t) => (t.length < len ? t + k : t));
  }, [done, submit, len]);

  // The real keyboard too (unless you're typing somewhere else).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
      if (e.key === 'Enter') { e.preventDefault(); press('ENTER'); }
      else if (e.key === 'Backspace') press('BACK');
      else if (/^[a-z]$/i.test(e.key)) press(e.key.toUpperCase());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  const bonus = () => {
    const a = bonusWordle(answer);
    track('game', { g: 'wordle', m: 'bonus' });
    setMode('bonus'); setAnswer(a); setGuesses([]); setTyped(''); setMsg(null);
  };
  const share = async () => {
    const text = `${wordleShare(wordleNumber(date), rows.map((r) => r.marks), won)}\n${location.origin}/?wordle=1&ref=share`;
    track('share', { g: 'wordle' });
    if (typeof navigator.share === 'function') { await navigator.share({ text }).catch(() => null); return; }
    try { await navigator.clipboard.writeText(text); } catch { /* blocked */ }
    setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  };

  const misses = rows.filter((r) => r.guess !== word).length;
  const lines = Array.from({ length: TRIES }, (_, i) => rows[i] ?? (i === rows.length && !done ? { guess: typed, marks: [] as Mark[] } : { guess: '', marks: [] as Mark[] }));

  return (
    <motion.div className="game-card wordle" style={{ ['--n' as string]: len }} initial={{ y: -30, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -20, opacity: 0, scale: 0.98 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
      <header className="gc-head">
        <span className="gc-badge gw-badge"><Grid3x3 size={15} /></span>
        <div className="gc-title">
          <b>Geo Wordle</b>
          <span>{mode === 'daily' ? `Daily #${wordleNumber(date)}` : 'Bonus round'} · {len} letters · {countriesOfLength(len)} countries this long</span>
        </div>
        <span className="gc-spacer" />
        <button className="icon-btn" onClick={onExit} aria-label="Close game"><X size={17} /></button>
      </header>

      <div className="gw-grid" role="grid" aria-label="Guesses">
        {lines.map((r, i) => (
          <motion.div key={`${mode}-${answer}-${i}`} className="gw-row" role="row" animate={i === rows.length && shake ? { x: [0, -8, 8, -5, 5, 0] } : {}} transition={{ duration: 0.35 }} data-shake={i === rows.length ? shake : 0}>
            {Array.from({ length: len }, (_, j) => {
              const ch = r.guess[j] ?? '';
              const m = r.marks[j];
              return (
                <motion.span key={j} role="gridcell" className={`gw-tile ${m ?? (ch ? 'typed' : '')}`}
                  initial={false} animate={m ? { rotateX: [90, 0] } : {}} transition={{ delay: j * 0.08, duration: 0.28 }}>{ch}</motion.span>
              );
            })}
          </motion.div>
        ))}
      </div>

      <p className={`gw-msg ${msg ? 'bad' : ''}`}>{msg ?? (done ? '' : misses >= 3 ? wordleHint(answer) : 'Type a country. Green = right spot, yellow = in it elsewhere.')}</p>

      {done ? (
        <div className={`gw-end ${won ? 'won' : ''}`}>
          <img src={flagUrl(target.cca2, 160)} alt="" />
          <div>
            <b>{won ? `✓ ${target.name}` : target.name}</b>
            <span>{won ? `In ${rows.length} ${rows.length === 1 ? 'try' : 'tries'}!` : 'Have a look on the globe'}{target.capital[0] ? ` · Capital: ${target.capital[0]}` : ''}</span>
          </div>
          <div className="gw-end-actions">
            {mode === 'daily' && <button className="primary sm" onClick={() => void share()}>{copied ? <><Check size={14} /> Copied</> : typeof navigator.share === 'function' ? <><Share2 size={14} /> Share</> : <><Copy size={14} /> Copy</>}</button>}
            <button className="ghost-cta" onClick={bonus}><RotateCcw size={14} /> {mode === 'daily' ? 'Bonus round' : 'Another'}</button>
          </div>
        </div>
      ) : (
        <div className="gw-keys" aria-label="Keyboard">
          {KEYS.map((row) => (
            <div key={row} className="gw-krow">
              {[...row].map((k) => k === '+'
                ? <button key="enter" className="gw-key wide" onClick={() => press('ENTER')}>Enter</button>
                : k === '-'
                  ? <button key="back" className="gw-key wide" onClick={() => press('BACK')} aria-label="Delete"><Delete size={18} /></button>
                  : <button key={k} className={`gw-key ${keys[k] ?? ''}`} onClick={() => press(k)}>{k}</button>)}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
