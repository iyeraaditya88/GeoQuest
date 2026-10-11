import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Copy, Play, Share2, Swords, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { BY_CCA3, flagUrl } from '../lib/data';
import { DAILY_N, MAX_POINTS, total } from '../lib/daily';
import { challengeMessage, cleanName, encodeChallenge, outcome } from '../lib/challenge';
import { track } from '../lib/analytics';

const MAX = DAILY_N * MAX_POINTS;
const sq = (p: number) => (p === 3 ? 'g' : p === 2 ? 'y' : p === 1 ? 'o' : 'x');
const NAME_KEY = 'gq-name';
const savedName = () => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } };

interface Props {
  targets: string[];
  points: number[];
  /** Who sent the challenge, and their score */
  by?: string;
  them?: number[];
  /** Signed-in name (guests type one, remembered on this device) */
  me: string | null;
  fresh: boolean;
  onClose: () => void;
  onNew: () => void;
}

/** A 5-country challenge, finished: your score (vs whoever sent it), the five, and a link to dare anyone. */
export function ChallengeResult({ targets, points, by, them, me, fresh, onClose, onNew }: Props) {
  const score = total(points);
  const o = outcome(points, them);
  const [name, setName] = useState(() => me ?? savedName());
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (fresh && (o === 'win' || (!o && score >= MAX - 3))) confetti({ particleCount: 140, spread: 85, origin: { y: 0.3 }, colors: ['#fde68a', '#fbbf24', '#f472b6', '#a855f7'], disableForReducedMotion: true });
  }, [fresh, o, score]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const share = async () => {
    const who = cleanName(me ?? name);
    if (!me) { try { localStorage.setItem(NAME_KEY, who); } catch { /* private mode */ } }
    const url = `${location.origin}/?ch=${encodeChallenge({ targets, by: who || undefined, points })}`;
    const text = `${challengeMessage(points, by, them)}\n${url}`;
    track('share', { g: 'challenge', vs: by ? 1 : 0 });
    if (typeof navigator.share === 'function') { await navigator.share({ text }).catch(() => null); return; }
    try { await navigator.clipboard.writeText(text); } catch { /* blocked */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const verdict = o === 'win' ? `You beat ${by}!` : o === 'lose' ? `${by} wins this one` : o === 'tie' ? 'A tie!'
    : score === MAX ? 'Perfect!' : score >= 12 ? 'Brilliant' : score >= 9 ? 'Nicely done' : score >= 5 ? 'Good effort' : 'Tough five!';
  const canShare = typeof navigator.share === 'function';

  return (
    <motion.div className="people-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section className="people daily ch" role="dialog" aria-label="Challenge result" onClick={(e) => e.stopPropagation()}
        initial={{ y: 18, scale: 0.97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 10, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }}>
        <header className="gc-head">
          <span className="gc-badge ch"><Swords size={16} /></span>
          <div className="gc-title"><b>5-country challenge</b><span>{by ? `From ${by}` : 'Find it on the globe'}</span></div>
          <span className="gc-spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </header>

        <div className="dy-hero">
          {them ? (
            <div className={`ch-vs ${o}`}>
              <div><span>You</span><b>{score}</b><span className="dy-sq">{points.map((p, i) => <i key={i} className={sq(p)} />)}</span></div>
              <em>vs</em>
              <div><span>{by}</span><b>{total(them)}</b><span className="dy-sq">{them.map((p, i) => <i key={i} className={sq(p)} />)}</span></div>
            </div>
          ) : (
            <>
              <div className="dy-score"><b>{score}</b><span>/ {MAX}</span></div>
              <div className="dy-squares" aria-label={`${score} of ${MAX}`}>{points.map((p, i) => <i key={i} className={sq(p)} />)}</div>
            </>
          )}
          <div className="dy-verdict">{verdict}</div>
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

        <div className="ch-share">
          <p className="ch-lead">{by ? 'Pass it on — anyone with the link plays these same 5.' : 'Send it to anyone — they play these same 5 and see your score at the end.'}</p>
          {!me && (
            <input className="ch-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Your name (shown to them)" aria-label="Your name" autoComplete="nickname" />
          )}
          <button className="primary dy-share" onClick={() => void share()}>
            {copied ? <><Check size={15} /> Copied — paste it anywhere</> : canShare ? <><Share2 size={15} /> {by ? 'Share my result' : 'Challenge friends'}</> : <><Copy size={15} /> {by ? 'Copy my result' : 'Copy challenge link'}</>}
          </button>
          <button className="ghost-cta ch-new" onClick={onNew}><Play size={14} /> New challenge</button>
        </div>
      </motion.section>
    </motion.div>
  );
}

/** Opened a challenge link: who sent it, and a big Play button (their score stays hidden until you finish). */
export function ChallengeIntro({ by, played, onPlay, onClose }: { by?: string; played: boolean; onPlay: () => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <motion.div className="people-backdrop si-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section className="si-sheet ch-intro" role="dialog" aria-modal="true" aria-labelledby="ch-title" onClick={(e) => e.stopPropagation()}
        initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
        <button className="icon-btn si-close" onClick={onClose} aria-label="Not now"><X size={17} /></button>
        <div className="ch-badge" aria-hidden><Swords size={30} /></div>
        <h2 id="ch-title">{by ? `${by} challenged you` : 'You’ve been challenged'}</h2>
        <p className="si-sub">Find 5 countries on the globe — 3 tries each.{by ? ` ${by}’s score stays hidden until you finish.` : ''}</p>
        <ul className="ch-rules">
          <li><i className="g" /> First try <b>3</b></li>
          <li><i className="y" /> Second <b>2</b></li>
          <li><i className="o" /> Third <b>1</b></li>
        </ul>
        <div className="si-actions">
          <button className="primary si-go" onClick={onPlay} autoFocus>{played ? 'See the result' : 'Play'}</button>
        </div>
        <button className="si-later" onClick={onClose}>Not now</button>
      </motion.section>
    </motion.div>
  );
}
