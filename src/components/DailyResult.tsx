import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarDays, Check, Copy, Flame, Share2, Star, Trophy, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { BY_CCA3, flagUrl } from '../lib/data';
import { DAILY_N, MAX_POINTS, THEME_LABEL, dailyNumber, shareLine, themeOf, total } from '../lib/daily';
import { useFavorites } from '../lib/favorites';
import { Reminders } from './Reminders';

export interface DailyBoardRow { name: string; points: number[]; total: number }
interface Props {
  date: string;
  targets: string[];
  points: number[];
  streak: { count: number; best: number } | null;
  board: DailyBoardRow[] | null;
  me: string | null;
  /** Just finished (celebrate) vs. looking back at today's result */
  fresh: boolean;
  onClose: () => void;
  onReminder?: (on: boolean) => void;
  /** Without an account: no board or streak — an invitation to sign up instead */
  guest?: boolean;
}

const MAX = DAILY_N * MAX_POINTS;
const sq = (p: number) => (p === 3 ? 'g' : p === 2 ? 'y' : p === 1 ? 'o' : 'x');

/** Today's Daily: score, streak, the five countries, share, today's board and the morning reminder. */
export function DailyResult({ date, targets, points, streak, board, me, fresh, onClose, onReminder, guest = false }: Props) {
  const score = total(points);
  const [copied, setCopied] = useState(false);
  const { favs } = useFavorites(me ?? 'you');
  useEffect(() => {
    if (fresh && score >= MAX - 3) confetti({ particleCount: 140, spread: 85, origin: { y: 0.3 }, colors: ['#fde68a', '#fbbf24', '#34d399', '#7dd3fc'], disableForReducedMotion: true });
  }, [fresh, score]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const text = shareLine(date, points);
  const share = async () => {
    const url = location.origin;
    if (typeof navigator.share === 'function') { await navigator.share({ text: `${text}\n${url}` }).catch(() => null); return; }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); } catch { /* blocked */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  const rows = [...(board ?? [])].sort((a, b) => b.total - a.total || Number(favs.includes(b.name)) - Number(favs.includes(a.name)) || a.name.localeCompare(b.name));
  const verdict = score === MAX ? 'Perfect!' : score >= 12 ? 'Brilliant' : score >= 9 ? 'Nicely done' : score >= 5 ? 'Good effort' : 'Tomorrow’s another day';

  return (
    <motion.div className="people-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section className="people daily" role="dialog" aria-label="Daily challenge result" onClick={(e) => e.stopPropagation()}
        initial={{ y: 18, scale: 0.97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 10, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }}>
        <header className="gc-head">
          <span className="gc-badge"><CalendarDays size={16} /></span>
          <div className="gc-title"><b>Daily #{dailyNumber(date)}</b><span>{THEME_LABEL[themeOf(date)]} · {new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</span></div>
          <span className="gc-spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </header>

        <div className="dy-hero">
          <div className="dy-score"><b>{score}</b><span>/ {MAX}</span></div>
          <div className="dy-verdict">{verdict}</div>
          <div className="dy-squares" aria-label={`${score} of ${MAX}`}>{points.map((p, i) => <i key={i} className={sq(p)} />)}</div>
          {streak && (
            <div className="dy-streak">
              <span><Flame size={15} /> <b>{streak.count}</b> day streak</span>
              <span className="muted">best {streak.best}</span>
            </div>
          )}
        </div>

        <ul className="dy-list">
          {targets.map((t, i) => {
            const c = BY_CCA3.get(t);
            return (
              <li key={t}>
                {c && <img src={flagUrl(c.cca2, 80)} alt="" />}
                <span>{c?.name ?? t}</span>
                <em className={sq(points[i] ?? 0)}>{points[i] === 3 ? 'First try' : points[i] === 2 ? '2nd try' : points[i] === 1 ? '3rd try' : 'Revealed'}</em>
              </li>
            );
          })}
        </ul>

        <button className="primary dy-share" onClick={() => void share()}>{copied ? <><Check size={15} /> Copied</> : typeof navigator.share === 'function' ? <><Share2 size={15} /> Share result</> : <><Copy size={15} /> Copy result</>}</button>

        {!guest && <div className="fr-label"><Trophy size={12} /> Today’s board</div>}
        {guest ? null : rows.length ? (
          <ol className="dy-board">
            {rows.slice(0, 15).map((r, i) => (
              <li key={r.name} className={r.name === me ? 'me' : ''}>
                <span className="dy-rank">{i + 1}</span>
                <b>{r.name === me ? 'You' : r.name}{favs.includes(r.name) && <Star size={11} className="dy-fav" />}</b>
                <span className="dy-sq">{r.points.map((p, k) => <i key={k} className={sq(p)} />)}</span>
                <span className="dy-total">{r.total}</span>
              </li>
            ))}
          </ol>
        ) : <p className="ac-note">You’re the first today — your friends’ scores show up here as they play.</p>}

        <Reminders compact onChange={onReminder} />
      </motion.section>
    </motion.div>
  );
}
