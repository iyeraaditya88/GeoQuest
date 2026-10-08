// The live match on screen: lobby → 3-2-1 → questions with a live scoreboard → podium.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Copy, Share2, Volume2, VolumeX, Binoculars, Brain, Check, Crown, Flag, Gamepad2, Heart, Landmark, Lightbulb, ListOrdered, Loader2, LogOut, RotateCcw, Sparkles, Swords, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { BY_CCA3, flagUrl } from '../lib/data';
import { GAMES, QUIZ_MODES, speedPoints, type GameId, type MatchSession, type Player, type Script, type Snapshot } from '../lib/match';
import { LEVELS } from '../lib/trivia';
import { TOP5, matchAnswer, norm } from '../lib/top5';
import { haversineKm, scoreFor } from '../lib/streetview';
import { countryAt } from '../lib/data';
import { DEFAULT_MAPILLARY_TOKEN } from '../config';
import { api } from '../lib/api';
import type { GeoGame } from './StreetGame';
import type { MatchGlobe } from './LivePlay';
import { Click, buzz } from '../lib/touch';
import { music, musicMuted } from '../lib/music';

const StreetGame = lazy(() => import('./StreetGame').then((m) => ({ default: m.StreetGame })));
const ICONS: Record<GameId, typeof Swords> = { quiz: Gamepad2, capitals: Landmark, trivia: Brain, top5: ListOrdered, street: Binoculars };

interface Props {
  session: MatchSession;
  snap: Snapshot;
  ai: boolean | null;
  globe: MatchGlobe;
  clickRef: MutableRefObject<((cca3: string | null) => void) | null>;
  onImmersive: (on: boolean) => void;
  onLeave: () => void;
  onRematch: () => void;
}

/** A clock that ticks while something is counting down. */
function useNow(on: boolean, ms = 100) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [on, ms]);
  return now;
}

/** Fraction of the question's time left (1 → 0). */
const fracLeft = (s: Snapshot) => Math.max(0, Math.min(1, (s.qEndsAt - Date.now()) / GAMES[s.game].ms));

/** Call `fn` once when the question's time is up and I haven't answered. */
function useTimeUp(s: Snapshot, fn: () => void) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const answered = !!s.answers[s.qi]?.[s.me];
  useEffect(() => {
    if (s.phase !== 'question' || answered) return;
    const t = window.setTimeout(() => fnRef.current(), Math.max(0, s.qEndsAt - Date.now()));
    return () => window.clearTimeout(t);
  }, [s.phase, s.qi, s.qEndsAt, answered]);
}

export function MatchOverlay({ session, snap, ai, globe, clickRef, onImmersive, onLeave, onRematch }: Props) {
  const s = snap;
  const playing = s.phase === 'countdown' || s.phase === 'question' || s.phase === 'reveal';
  const [confirmLeave, setConfirmLeave] = useState(false);
  useEffect(() => { if (!confirmLeave) return; const t = window.setTimeout(() => setConfirmLeave(false), 3000); return () => window.clearTimeout(t); }, [confirmLeave]);
  const leave = () => { if (playing && !confirmLeave) { setConfirmLeave(true); return; } onLeave(); };

  // Background music: calm in countdowns/reveals, upbeat while answering, a push in the last 5 s.
  useEffect(() => {
    if (s.phase === 'countdown' || s.phase === 'question' || s.phase === 'reveal') music.start();
    else if (s.phase === 'done' || s.phase === 'aborted') music.stop();
    if (s.phase !== 'question') { music.intensity(0); return; }
    music.intensity(1);
    const t = window.setTimeout(() => music.intensity(2), Math.max(0, s.qEndsAt - Date.now() - 5000));
    return () => window.clearTimeout(t);
  }, [s.phase, s.qi, s.qEndsAt]);
  useEffect(() => () => music.stop(), []);
  // A little chime (and a buzz on phones) for my own answer.
  const mine = s.answers[s.qi]?.[s.me];
  useEffect(() => {
    if (!mine) return;
    const good = mine.ok || mine.pts > 0;
    music.sfx(good ? 'good' : 'bad');
    buzz(good ? 'good' : 'bad');
  }, [mine]);

  // Esc leaves (twice while playing — no accidental exits).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest?.('input')) leave(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <>
      <AnimatePresence>
        {(s.phase === 'lobby' || s.phase === 'preparing') && <Lobby key="lobby" s={s} session={session} onLeave={onLeave} />}
      </AnimatePresence>
      {s.script && playing && (
        <Stage s={s} script={s.script} session={session} ai={ai} globe={globe} clickRef={clickRef} onImmersive={onImmersive} onLeave={leave} />
      )}
      <AnimatePresence>{s.phase === 'countdown' && <Countdown key="cd" s={s} />}</AnimatePresence>
      {playing && <Hud s={s} confirmLeave={confirmLeave} onLeave={leave} />}
      <AnimatePresence>{(s.phase === 'done' || s.phase === 'aborted') && <Results key="res" s={s} onLeave={onLeave} onRematch={onRematch} />}</AnimatePresence>
    </>
  );
}

// ── Lobby ──
const STATUS: Record<Player['status'], string> = { invited: 'Invited…', joined: 'Ready', declined: 'Declined', busy: 'Busy in another game', missed: 'Didn’t answer', left: 'Left' };

function Lobby({ s, session, onLeave }: { s: Snapshot; session: MatchSession; onLeave: () => void }) {
  const now = useNow(true, 250);
  const left = Math.max(0, Math.ceil((s.inviteEndsAt - now) / 1000));
  const Icon = ICONS[s.game];
  const joined = s.players.filter((p) => p.status === 'joined').length;
  const mode = s.game === 'quiz' ? QUIZ_MODES.find((m) => m.id === s.opts.mode)?.label : s.game === 'capitals' ? (s.opts.level === 'all' ? 'All countries' : 'Big countries') : null;
  return (
    <motion.div className="game-card mt-lobby" initial={{ y: -30, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -20, opacity: 0, scale: 0.98 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
      <header className="gc-head">
        <span className="gc-badge"><Icon size={15} /></span>
        <div className="gc-title">
          <b>{GAMES[s.game].label}{mode ? ` · ${mode}` : ''}</b>
          <span>{s.phase === 'preparing' ? 'Setting up the questions…' : s.isHost ? (s.open ? `Open lobby · ${joined - 1} joined` : `Waiting for players · ${left}s`) : `${s.host}’s match · waiting to start`}</span>
        </div>
        <button className="icon-btn" onClick={onLeave} aria-label={s.isHost ? 'Cancel match' : 'Leave'}><X size={17} /></button>
      </header>
      {s.isHost && s.open && s.link && s.phase === 'lobby' && <ShareLink link={s.link} game={GAMES[s.game].label} />}
      <ul className="mt-players">
        {s.players.map((p) => (
          <motion.li key={p.name} layout className={`st-${p.status}`}>
            <span className="pp-avatar member">{p.name[0]?.toUpperCase()}</span>
            <b>{p.name === s.me ? `${p.name} (you)` : p.name}{p.name === s.host && <Crown size={12} className="mt-crown" />}</b>
            <span className="mt-st">{p.status === 'invited' ? <><Loader2 size={12} className="spin" /> Invited…</> : p.status === 'joined' ? <><Check size={12} /> Ready</> : STATUS[p.status]}</span>
          </motion.li>
        ))}
      </ul>
      {s.isHost ? (
        <button className="primary mt-start" disabled={joined < 2 || s.phase === 'preparing'} onClick={() => void session.startNow()}>
          {s.phase === 'preparing' ? <><Loader2 size={15} className="spin" /> Getting ready…</> : joined < 2 ? (s.open ? 'Waiting for friends to join…' : 'Waiting for someone to accept…') : <>Start {s.open ? `with ${joined} players` : 'now'} <ArrowRight size={15} /></>}
        </button>
      ) : (
        <p className="mt-wait">{s.phase === 'preparing' ? 'Getting the questions ready…' : s.open ? `You’re in! ${s.host} starts the match when everyone’s here.` : `${s.host} starts the match — it begins automatically once everyone’s in.`}</p>
      )}
    </motion.div>
  );
}

/** The invite link, with copy and (on phones) the share sheet. */
function ShareLink({ link, game }: { link: string; game: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); } catch { /* the field is selectable */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  const canShare = typeof navigator.share === 'function';
  return (
    <div className="mt-share">
      <p>Send this link to friends — anyone signed in to GeoQuest who opens it joins this lobby.</p>
      <div className="pp-copy">
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
        <button className="ap-btn gold" onClick={() => void copy()}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}</button>
        {canShare && <button className="ap-btn" onClick={() => void navigator.share({ title: 'GeoQuest', text: `Play ${game} with me on GeoQuest!`, url: link }).catch(() => null)} aria-label="Share"><Share2 size={14} /></button>}
      </div>
    </div>
  );
}

// ── 3 · 2 · 1 ──
function Countdown({ s }: { s: Snapshot }) {
  const now = useNow(true, 50);
  const n = Math.ceil((s.countdownEndsAt - now) / 1000);
  return (
    <motion.div className="mt-countdown" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
      <div className="mt-cd-game">{GAMES[s.game].label}</div>
      <AnimatePresence mode="popLayout">
        <motion.b key={n} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 24 }}>
          {n > 0 ? n : 'Go!'}
        </motion.b>
      </AnimatePresence>
      <div className="mt-cd-vs">{s.players.filter((p) => p.status === 'joined').map((p) => p.name).join('  vs  ')}</div>
    </motion.div>
  );
}

// ── Scoreboard ──
function Hud({ s, confirmLeave, onLeave }: { s: Snapshot; confirmLeave: boolean; onLeave: () => void }) {
  const now = useNow(s.phase === 'question', 200);
  const total = s.script?.qs.length ?? GAMES[s.game].n;
  const ms = GAMES[s.game].ms;
  const left = s.phase === 'question' ? Math.max(0, s.qEndsAt - now) : 0;
  const R = 15, C = 2 * Math.PI * R;
  const got = s.answers[s.qi] ?? {};
  // While a question is open, scores stand as of the last reveal (a jump would give answers away).
  const shown = (p: Player) => p.score - (s.phase === 'question' ? got[p.name]?.pts ?? 0 : 0);
  const ranked = [...s.players].filter((p) => p.status === 'joined' || p.status === 'left').sort((a, b) => shown(b) - shown(a));
  return (
    <motion.div className={`mt-hud ${s.game === 'street' ? 'top' : ''}`} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
      <div className={`mt-clock ${left < 5000 && s.phase === 'question' ? 'hurry' : ''}`} title="Time left">
        <svg viewBox="0 0 36 36" aria-hidden><circle cx="18" cy="18" r={R} className="bg" /><circle cx="18" cy="18" r={R} className="fg" strokeDasharray={C} strokeDashoffset={C * (1 - left / ms)} /></svg>
        <span>{s.phase === 'question' ? Math.ceil(left / 1000) : s.phase === 'reveal' ? '✓' : '·'}</span>
      </div>
      <div className="mt-q">Q<b>{Math.min(s.qi + 1, total)}</b>/{total}</div>
      <ul className="mt-board">
        {ranked.map((p, i) => {
          const a = got[p.name];
          return (
            <motion.li key={p.name} layout transition={{ type: 'spring', stiffness: 400, damping: 34 }} className={`${p.name === s.me ? 'me' : ''} ${p.status === 'left' ? 'gone' : ''}`}>
              <span className="pp-avatar member">{i === 0 && shown(p) > 0 ? <Crown size={12} /> : p.name[0]?.toUpperCase()}</span>
              <span className="mt-name">{p.name === s.me ? 'You' : p.name}</span>
              <b className="mt-score">{shown(p).toLocaleString('en-US')}</b>
              <span className={`mt-ans ${a ? (s.phase === 'reveal' ? (a.ok ? 'ok' : 'no') : 'in') : s.phase === 'question' && p.status === 'joined' ? 'wait' : ''}`}>
                {a ? (s.phase === 'reveal' ? (a.pts ? `+${a.pts}` : '0') : <Check size={11} strokeWidth={3} />) : null}
              </span>
            </motion.li>
          );
        })}
      </ul>
      <MuteToggle />
      <button className={`mt-leave ${confirmLeave ? 'sure' : ''}`} onClick={onLeave} aria-label="Leave match">{confirmLeave ? 'Leave?' : <LogOut size={15} />}</button>
    </motion.div>
  );
}

function MuteToggle() {
  const [off, setOff] = useState(musicMuted);
  return (
    <button className={`mt-leave mt-mute ${off ? 'off' : ''}`} onClick={() => { music.setMuted(!off); setOff(!off); }} aria-label={off ? 'Turn music on' : 'Mute music'} title={off ? 'Music off' : 'Music on'}>
      {off ? <VolumeX size={15} /> : <Volume2 size={15} />}
    </button>
  );
}

// ── Results ──
function Results({ s, onLeave, onRematch }: { s: Snapshot; onLeave: () => void; onRematch: () => void }) {
  const ranked = [...s.players].filter((p) => p.status === 'joined' || p.status === 'left').sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const tie = ranked.length > 1 && ranked[1].score === top?.score;
  const iWon = !!top && top.name === s.me && !tie;
  const aborted = s.phase === 'aborted';
  const n = s.script?.qs.length ?? 0;
  useEffect(() => {
    if (iWon && !aborted) confetti({ particleCount: 160, spread: 90, origin: { y: 0.3 }, colors: ['#fde68a', '#fbbf24', '#34d399', '#7dd3fc', '#f9a8d4'], disableForReducedMotion: true });
  }, [iWon, aborted]);
  const canRematch = !!s.script && (!aborted || ranked.length > 1);
  return (
    <motion.div className="mt-results-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section className="mt-results" initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }}>
        <div className="mt-r-kicker">{GAMES[s.game].label}</div>
        <h2>{!s.script ? 'No match this time' : aborted ? 'Match ended' : s.reason ? 'Match ended early' : tie ? 'It’s a draw!' : iWon ? 'You win!' : `${top?.name ?? '—'} wins`}</h2>
        {(s.reason || (aborted && !ranked.length)) && <p className="mt-r-reason">{s.reason}</p>}
        {s.script && <ol className="mt-podium">
          {ranked.map((p, i) => (
            <motion.li key={p.name} className={`${i === 0 && !tie ? 'first' : ''} ${p.name === s.me ? 'me' : ''}`} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.08 }}>
              <span className="mt-rank">{i === 0 && !tie ? <Crown size={15} /> : i + 1}</span>
              <span className="pp-avatar member">{p.name[0]?.toUpperCase()}</span>
              <b>{p.name === s.me ? 'You' : p.name}{p.status === 'left' && <em> · left</em>}</b>
              {n > 0 && (
                <span className="mt-dots" aria-hidden>
                  {Array.from({ length: n }, (_, q) => { const a = s.answers[q]?.[p.name]; return <i key={q} className={a ? (a.ok ? 'ok' : a.pts ? 'part' : 'no') : ''} />; })}
                </span>
              )}
              <span className="mt-pts">{p.score.toLocaleString('en-US')}</span>
            </motion.li>
          ))}
        </ol>}
        <div className="mt-r-actions">
          {canRematch && <button className="primary" onClick={onRematch}><RotateCcw size={15} /> Rematch</button>}
          <button className="ghost-cta" onClick={onLeave}>Back to the globe</button>
        </div>
      </motion.section>
    </motion.div>
  );
}

// ── The question on screen, per game ──
interface StageProps { s: Snapshot; script: Script; session: MatchSession; ai: boolean | null; globe: MatchGlobe; clickRef: Props['clickRef']; onImmersive: (on: boolean) => void; onLeave: () => void }

function Stage(p: StageProps) {
  switch (p.script.game) {
    case 'capitals': case 'trivia': return <ChoiceStage {...p} />;
    case 'quiz': return <QuizStage {...p} />;
    case 'top5': return <Top5Stage {...p} />;
    case 'street': return <StreetStage {...p} />;
  }
}

const card = { initial: { y: -30, opacity: 0, scale: 0.98 }, animate: { y: 0, opacity: 1, scale: 1 }, exit: { y: -20, opacity: 0, scale: 0.98 }, transition: { type: 'spring' as const, stiffness: 320, damping: 30 } };
const TRIVIA_MULT = [1, 1.2, 1.5, 2];

function ChoiceStage({ s, script, session, globe }: StageProps) {
  const trivia = script.game === 'trivia';
  const i = Math.min(s.qi, script.qs.length - 1);
  // Normalise both games to: prompt, options [value, label, flag?], the right value.
  const q = useMemo(() => {
    if (script.game === 'trivia') {
      const t = script.qs[i];
      return { key: `t${t.id}`, level: LEVELS.indexOf(t.difficulty), prompt: <h3>{t.question}</h3>, options: t.options.map((o) => ({ v: o, label: o, flag: '' })), right: t.answer, reveal: () => globe.revealPlace(t.answer) };
    }
    const c = script.game === 'capitals' ? script.qs[i] : null!;
    const country = BY_CCA3.get(c.c)!;
    const opts = c.o.map((x) => BY_CCA3.get(x)!).filter(Boolean);
    return {
      key: `c${c.c}`, level: 0,
      prompt: c.kind === 'capital'
        ? <><img className="cap-flag" src={flagUrl(country.cca2, 160)} alt="" /><h3>What is the capital of <b>{country.name}</b>?</h3></>
        : <><span className="cap-icon"><Landmark size={18} /></span><h3><b>{country.capital[0]}</b> is the capital of…</h3></>,
      options: opts.map((o) => ({ v: o.cca3, label: c.kind === 'capital' ? o.capital[0] : o.name, flag: c.kind === 'country' ? o.cca2 : '' })),
      right: c.c,
      reveal: () => { globe.highlight([c.c]); globe.flyTo(c.c); },
    };
  }, [script, i, globe]);

  const mine = s.answers[s.qi]?.[s.me];
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [s.qi]);
  const showRight = s.phase === 'reveal' || !!picked;

  const choose = useCallback((v: string) => {
    if (picked || mine || s.phase !== 'question') return;
    setPicked(v);
    const ok = v === q.right;
    const pts = ok ? Math.round(speedPoints(fracLeft(s)) * (trivia ? TRIVIA_MULT[q.level] ?? 1 : 1)) : 0;
    session.answer(pts, ok, v);
  }, [picked, mine, s, q, trivia, session]);
  useTimeUp(s, () => { if (!picked) session.answer(0, false); });

  useEffect(() => { if (s.phase === 'reveal') q.reveal(); }, [s.phase, q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= q.options.length) { e.preventDefault(); choose(q.options[n - 1].v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q, choose]);

  const othersRight = s.phase === 'reveal' ? s.players.filter((p) => p.name !== s.me && s.answers[s.qi]?.[p.name]?.ok).map((p) => p.name) : [];
  return (
    <motion.div className={`game-card ${trivia ? 'trivia' : 'capitals'} in-match`} {...card}>
      <div className="cap-progress"><motion.i animate={{ width: `${((s.qi + (s.phase === 'reveal' ? 1 : 0)) / script.qs.length) * 100}%` }} transition={{ duration: 0.4 }} /></div>
      <AnimatePresence mode="wait">
        <motion.div key={q.key} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
          {trivia ? (
            <div className="tv-q"><span className={`tv-diff l${q.level}`}>{LEVELS[q.level]} · ×{TRIVIA_MULT[q.level]}</span>{q.prompt}</div>
          ) : <div className="cap-q">{q.prompt}</div>}
          <div className="cap-options">
            {q.options.map((o, n) => {
              const state = !showRight ? '' : o.v === q.right ? 'right' : o.v === picked ? 'wrong' : 'dim';
              return (
                <motion.button key={o.v} className={`cap-opt ${state}`} onClick={() => choose(o.v)} disabled={!!picked || !!mine || s.phase !== 'question'} whileTap={!picked ? { scale: 0.98 } : undefined}
                  animate={state === 'wrong' ? { x: [0, -6, 6, -4, 4, 0] } : {}} transition={{ duration: 0.4 }}>
                  <kbd>{n + 1}</kbd>
                  {o.flag && <img src={flagUrl(o.flag, 80)} alt="" />}
                  <span>{o.label}</span>
                </motion.button>
              );
            })}
          </div>
          <div className="gc-foot">
            <span className={`gc-feedback ${mine ? (mine.ok ? 'good' : 'bad') : ''}`}>
              {mine ? (mine.ok ? `✓ +${mine.pts}` : picked ? '✗ Not quite' : '⏱ Time’s up') : s.phase === 'question' ? 'Faster answers score more' : ''}
              {s.phase === 'reveal' && othersRight.length > 0 && <em className="mt-also"> · {othersRight.join(', ')} got it</em>}
            </span>
            <span className="gc-spacer" />
            {mine && s.phase === 'question' && <span className="mt-waiting"><Loader2 size={12} className="spin" /> Waiting for the others</span>}
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

const MAX_MISSES = 3;
function QuizStage({ s, script, session, globe, clickRef }: StageProps) {
  if (script.game !== 'quiz') return null;
  return <QuizInner s={s} script={script} session={session} globe={globe} clickRef={clickRef} />;
}
function QuizInner({ s, script, session, globe, clickRef }: Pick<StageProps, 's' | 'session' | 'globe' | 'clickRef'> & { script: Extract<Script, { game: 'quiz' }> }) {
  const q = script.qs[Math.min(s.qi, script.qs.length - 1)];
  const target = BY_CCA3.get(q.t)!;
  const mine = s.answers[s.qi]?.[s.me];
  const [misses, setMisses] = useState(0);
  const [flash, setFlash] = useState<'good' | 'bad' | null>(null);
  useEffect(() => { setMisses(0); setFlash(null); globe.feedback(null); globe.highlight([]); }, [s.qi, globe]);

  const sRef = useRef(s);
  sRef.current = s;
  const missRef = useRef(misses);
  missRef.current = misses;
  // Globe clicks answer the question while it's open.
  useEffect(() => {
    if (s.phase !== 'question' || mine) { clickRef.current = null; return; }
    clickRef.current = (c) => {
      const cur = sRef.current;
      if (!c || cur.phase !== 'question' || cur.answers[cur.qi]?.[cur.me]) return;
      if (c === q.t) {
        const pts = Math.max(100, speedPoints(fracLeft(cur)) - 150 * missRef.current);
        session.answer(pts, true, missRef.current);
        globe.feedback({ cca3: c, kind: 'good' });
        setFlash('good');
      } else {
        const m = missRef.current + 1;
        setMisses(m);
        setFlash('bad');
        globe.feedback({ cca3: c, kind: 'bad' });
        window.setTimeout(() => setFlash(null), 450);
        if (m >= MAX_MISSES) session.answer(0, false, m);
      }
    };
    return () => { clickRef.current = null; };
  }, [s.phase, s.qi, mine, q.t, clickRef, session, globe]);
  useTimeUp(s, () => session.answer(0, false, missRef.current));
  useEffect(() => { if (s.phase === 'reveal') { globe.feedback({ cca3: q.t, kind: 'reveal' }); globe.flyTo(q.t); } }, [s.phase, q.t, globe]);

  const prompt = script.mode === 'flag'
    ? <><img className="mq-flag" src={flagUrl(target.cca2, 160)} alt="Flag to find" /><span>Find this flag on the globe</span></>
    : script.mode === 'clue'
      ? <span className="mq-clue"><Lightbulb size={14} /> {q.clue}</span>
      : <span>Find <b>{target.name}</b></span>;
  const done = !!mine;
  return (
    <motion.div className={`quiz mq res-${s.phase === 'reveal' ? 'reveal' : flash ?? (done ? (mine?.ok ? 'good' : 'bad') : 'idle')}`} {...card}>
      <div className="mq-prompt">{prompt}</div>
      <div className="mq-foot">
        <span className="gc-strikes" aria-label={`${MAX_MISSES - misses} tries left`}>
          {Array.from({ length: MAX_MISSES }, (_, k) => <motion.span key={k} animate={{ scale: k < MAX_MISSES - misses ? 1 : 0.7, opacity: k < MAX_MISSES - misses ? 1 : 0.25 }}><Heart size={13} fill="currentColor" /></motion.span>)}
        </span>
        <span className="mq-status">
          {s.phase === 'reveal' ? <>It’s <b>{target.name}</b></> : mine ? (mine.ok ? `✓ +${mine.pts} — waiting for the others` : 'Out of tries — waiting for the others') : `${Click} it on the globe`}
        </span>
      </div>
    </motion.div>
  );
}

const T5_STRIKES = 3;
function Top5Stage({ s, script, session, ai, globe }: StageProps) {
  const q = useMemo(() => (script.game === 'top5' ? TOP5.find((t) => t.id === script.qs[Math.min(s.qi, script.qs.length - 1)]) : undefined), [script, s.qi]);
  const [found, setFound] = useState<Set<number>>(new Set());
  const [misses, setMisses] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [checking, setChecking] = useState<string | false>(false);
  const [note, setNote] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const mine = s.answers[s.qi]?.[s.me];
  const reveal = s.phase === 'reveal';
  useEffect(() => { setFound(new Set()); setMisses([]); setInput(''); setNote(null); setTimeout(() => field.current?.focus(), 150); }, [s.qi]);

  const submitScore = useCallback((f: Set<number>) => {
    const all = f.size === 5;
    session.answer(f.size * 200 + (all ? 300 + Math.round(200 * fracLeft(s)) : 0), all, f.size);
  }, [session, s]);
  useTimeUp(s, () => submitScore(found));

  useEffect(() => {
    if (!q) return;
    const ids = q.answers.filter((a, i) => a.cca3 && (found.has(i) || reveal)).map((a) => a.cca3!);
    globe.highlight(ids);
  }, [found, reveal, q, globe]);

  if (!q) return null;
  const locked = !!mine || s.phase !== 'question';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const guess = input.trim();
    if (!guess || locked || checking || !q) return;
    setInput('');
    let idx = matchAnswer(guess, q.answers);
    if (idx < 0 && ai) {
      setChecking(guess);
      try {
        const r = await api('/api/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guess, question: q.title, options: q.answers.map((a) => a.name) }) }).then((x) => x.json());
        if (r.match) idx = q.answers.findIndex((a) => a.name === r.match);
      } catch { /* treat as a miss */ }
      setChecking(false);
    }
    if (idx >= 0) {
      if (found.has(idx)) { setNote(`${q.answers[idx].name} is already on the board`); return; }
      const next = new Set(found).add(idx);
      setFound(next);
      setNote(`${q.answers[idx].name} — #${idx + 1}`);
      if (next.size === 5) submitScore(next);
      return;
    }
    if (misses.some((m) => norm(m) === norm(guess))) { setNote('You already tried that one'); return; }
    const m = [...misses, guess];
    setMisses(m);
    setNote(m.length >= T5_STRIKES ? 'Out of strikes' : `Not in the top 5 · ${T5_STRIKES - m.length} left`);
    if (m.length >= T5_STRIKES) submitScore(found);
  }

  return (
    <motion.div className="game-card top5 in-match" {...card}>
      <AnimatePresence mode="wait">
        <motion.div key={q.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
          <div className="t5-q">
            <span className="chip ghost">{q.category}</span>
            <h3>{q.title}</h3>
            {q.hint && <p><Lightbulb size={13} /> {q.hint}</p>}
          </div>
          <ol className="t5-slots">
            {q.answers.map((a, i) => {
              const show = found.has(i) || reveal;
              const c = a.cca3 ? BY_CCA3.get(a.cca3) : undefined;
              return (
                <li key={i} className={`${found.has(i) ? 'got' : show ? 'missed' : ''}`}>
                  <span className="t5-rank">{i + 1}</span>
                  {show ? (
                    <motion.span className="t5-answer" initial={{ opacity: 0, x: -10, filter: 'blur(4px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}>
                      {c && <img src={flagUrl(c.cca2, 80)} alt="" />}<b>{a.name}</b>{a.detail && <em>{a.detail}</em>}
                    </motion.span>
                  ) : <span className="t5-blank" />}
                </li>
              );
            })}
          </ol>
        </motion.div>
      </AnimatePresence>
      {!locked ? (
        <form className="t5-input" onSubmit={submit}>
          <input ref={field} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type an answer and press Enter…" spellCheck={false} autoComplete="off" />
          <button type="submit" className="send" disabled={!input.trim() || !!checking} aria-label="Submit">{checking ? <Loader2 size={16} className="spin" /> : <ArrowRight size={17} />}</button>
        </form>
      ) : (
        <div className="mt-t5-done"><b>{found.size}</b>/5 · {mine ? `+${mine.pts}` : ''} {s.phase === 'question' && <span className="mt-waiting"><Loader2 size={12} className="spin" /> Waiting for the others</span>}</div>
      )}
      <div className="gc-foot">
        {checking ? <span className="gc-feedback info"><Sparkles size={12} /> Checking “{checking}”…</span> : note && <span className="gc-feedback">{note}</span>}
        <span className="gc-spacer" />
        <span className="gc-strikes">{Array.from({ length: T5_STRIKES }, (_, k) => <Heart key={k} size={13} fill="currentColor" opacity={k < T5_STRIKES - misses.length ? 1 : 0.25} />)}</span>
        {!locked && <button className="skip" onClick={() => submitScore(found)}><Flag size={13} /> Done</button>}
      </div>
    </motion.div>
  );
}

function StreetStage({ s, script, session, onImmersive, onLeave }: StageProps) {
  useEffect(() => { onImmersive(true); return () => onImmersive(false); }, [onImmersive]);
  const spots = script.game === 'street' ? script.qs : [];
  const [game, setGame] = useState<GeoGame>({ round: 1, totalRounds: spots.length, results: [], status: 'loading', item: null, guess: null });
  const gameRef = useRef(game);
  gameRef.current = game;

  // Each new question: the next place.
  useEffect(() => {
    if (s.phase !== 'question') return;
    setGame((g) => ({ ...g, round: s.qi + 1, status: 'play', item: spots[s.qi], guess: null, error: undefined }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, s.qi]);

  const submit = useCallback(() => {
    const g = gameRef.current;
    if (g.status !== 'play' || !g.item || !g.guess) return;
    const answer = { lat: g.item.lat, lng: g.item.lng };
    const km = haversineKm(g.guess, answer);
    const score = scoreFor(km);
    setGame({ ...g, status: 'result', results: [...g.results, { km, score, answer, guess: g.guess, country: countryAt(answer.lat, answer.lng), guessCountry: countryAt(g.guess.lat, g.guess.lng) }] });
    session.answer(score, km < 300, Math.round(km));
  }, [session]);
  useTimeUp(s, () => {
    if (gameRef.current.guess) submit(); // pinned but didn't press Guess — count the pin
    else { session.answer(0, false); setGame((g) => ({ ...g, status: 'error', item: null, error: '⏱ Time’s up — no guess this round' })); }
  });

  const answered = !!s.answers[s.qi]?.[s.me];
  const now = useNow(s.phase === 'reveal', 500);
  const note = s.phase === 'reveal'
    ? (s.qi + 1 < spots.length ? `Next place in ${Math.max(0, Math.ceil((s.revealEndsAt - now) / 1000))}s…` : 'Final scores coming up…')
    : answered ? 'Waiting for the others to guess…' : 'Pin your guess before the time runs out';

  return (
    <Suspense fallback={null}>
      <StreetGame
        game={game}
        mlyToken={DEFAULT_MAPILLARY_TOKEN}
        onPick={(lat, lng) => setGame((g) => (g.status === 'play' ? { ...g, guess: { lat, lng } } : g))}
        onGuess={submit}
        onNext={() => {}}
        onExit={onLeave}
        onRestart={() => {}}
        onSkip={() => { if (!answered) session.answer(0, false); setGame((g) => ({ ...g, status: 'error', item: null, error: 'This place wouldn’t load — sitting this round out' })); }}
        onMapillary={() => {}}
        onFallback={() => {}}
        match={{ note }}
      />
    </Suspense>
  );
}
