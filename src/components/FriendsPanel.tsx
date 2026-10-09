import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Binoculars, Brain, Check, Gamepad2, Landmark, Link2, ListOrdered, Loader2, Star, Swords, Trophy, X } from 'lucide-react';
import { api } from '../lib/api';
import { useFavorites } from '../lib/favorites';
import { GAMES, QUIZ_MODES, loadHistory, type GameId, type MatchOpts, type MatchRecord } from '../lib/match';

const ICONS: Record<GameId, typeof Swords> = { quiz: Gamepad2, capitals: Landmark, trivia: Brain, top5: ListOrdered, street: Binoculars };
const ORDER: GameId[] = ['capitals', 'trivia', 'quiz', 'top5', 'street'];
const MAX = 5;

const ago = (t: number | null | undefined) => {
  if (!t) return 'offline';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 60 ? `seen ${Math.max(1, m)} min ago` : m < 1440 ? `seen ${Math.round(m / 60)} h ago` : `seen ${Math.round(m / 1440)} d ago`;
};

// ── Game picker (shared by Challenge and Invite) ──
/** The last game you picked, remembered per browser. */
function useGameChoice() {
  const [game, setGameState] = useState<GameId>(() => { try { return (localStorage.getItem('gq-live-game') as GameId) || 'capitals'; } catch { return 'capitals'; } });
  const [opts, setOpts] = useState<MatchOpts>({ mode: 'find', level: 'easy' });
  const setGame = (g: GameId) => { setGameState(g); try { localStorage.setItem('gq-live-game', g); } catch { /* ignore */ } };
  const chosenOpts = (): MatchOpts => (game === 'quiz' ? { mode: opts.mode } : game === 'capitals' ? { level: opts.level } : {});
  return { game, setGame, opts, setOpts, chosenOpts };
}

function GamePicker({ c }: { c: ReturnType<typeof useGameChoice> }) {
  return (
    <>
      <div className="fr-games" role="radiogroup" aria-label="Game">
        {ORDER.map((g) => {
          const Icon = ICONS[g];
          return (
            <button key={g} role="radio" aria-checked={c.game === g} className={`fr-game ${c.game === g ? 'on' : ''}`} onClick={() => c.setGame(g)}>
              <Icon size={17} />
              <b>{GAMES[g].label}</b>
              <span>{GAMES[g].blurb}</span>
            </button>
          );
        })}
      </div>
      {c.game === 'quiz' && (
        <div className="gc-level fr-opts" role="radiogroup" aria-label="Quiz mode">
          {QUIZ_MODES.map((m) => <button key={m.id} role="radio" aria-checked={c.opts.mode === m.id} className={c.opts.mode === m.id ? 'on' : ''} onClick={() => c.setOpts((o) => ({ ...o, mode: m.id }))}>{m.label}</button>)}
        </div>
      )}
      {c.game === 'capitals' && (
        <div className="gc-level fr-opts" role="radiogroup" aria-label="Countries">
          {(['easy', 'all'] as const).map((l) => <button key={l} role="radio" aria-checked={c.opts.level === l} className={c.opts.level === l ? 'on' : ''} onClick={() => c.setOpts((o) => ({ ...o, level: l }))}>{l === 'easy' ? 'Big countries' : 'All countries'}</button>)}
        </div>
      )}
    </>
  );
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}

const Shell = ({ label, onClose, children, wide }: { label: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) => (
  <motion.div className="people-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
    <motion.section className={`people friends ${wide ? '' : 'narrow'}`} role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()}
      initial={{ y: 24, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 340, damping: 30 }}>
      {children}
    </motion.section>
  </motion.div>
);

interface Props {
  open: boolean;
  onClose: () => void;
  me: string;
  mode: 'ably' | 'local';
  connected: boolean;
  online: Map<string, { s?: string }>;
  onChallenge: (to: string[], game: GameId, opts: MatchOpts) => Promise<void>;
  /** Open with these friends already picked */
  preselect?: string[];
}

/** Challenge friends who are online. Favourites sit on top with a one-tap Duel. Plus recent matches. */
export function FriendsPanel({ open, onClose, me, mode, connected, online, onChallenge, preselect }: Props) {
  const [players, setPlayers] = useState<{ name: string; lastLogin: number | null }[]>([]);
  const [picked, setPicked] = useState<string[]>(() => preselect ?? []);
  const choice = useGameChoice();
  const [busy, setBusy] = useState<string | false>(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<MatchRecord[] | null>(null);
  const { favs, toggle: toggleFav } = useFavorites(me);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === 'ably') void api('/api/players').then((r) => r.json()).then((d) => setPlayers(d.players ?? [])).catch(() => null);
    void loadHistory(me).then(setHistory);
  }, [open, mode, me]);
  useEscape(open, onClose);

  // Everyone: known players plus anyone online (locally, presence is all we have).
  const rows = useMemo(() => {
    const names = new Map(players.map((p) => [p.name, p.lastLogin]));
    for (const n of online.keys()) if (!names.has(n)) names.set(n, null);
    for (const n of favs) if (!names.has(n) && mode === 'local') names.set(n, null);
    return [...names.entries()].map(([name, lastLogin]) => ({ name, lastLogin, here: online.has(name), playing: online.get(name)?.s === 'playing', fav: favs.includes(name) }))
      .sort((a, b) => Number(b.here) - Number(a.here) || Number(a.playing) - Number(b.playing) || a.name.localeCompare(b.name));
  }, [players, online, favs, mode]);
  const favRows = rows.filter((r) => r.fav);
  const otherRows = rows.filter((r) => !r.fav);

  // Drop picks who went offline or into another game.
  useEffect(() => { setPicked((p) => p.filter((n) => online.has(n) && online.get(n)?.s !== 'playing')); }, [online]);

  // Head-to-head: wins–losses against each friend.
  const record = useMemo(() => {
    const r = new Map<string, { w: number; l: number }>();
    for (const m of history ?? []) {
      const mine = m.players.find((p) => p.name === me)?.score ?? 0;
      for (const p of m.players) {
        if (p.name === me) continue;
        const x = r.get(p.name) ?? { w: 0, l: 0 };
        if (mine > p.score) x.w++; else if (mine < p.score) x.l++;
        r.set(p.name, x);
      }
    }
    return r;
  }, [history, me]);

  const togglePick = (n: string) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.length < MAX ? [...p, n] : p));

  const send = async (to: string[], key: string) => {
    if (!to.length || busy) return;
    setBusy(key); setError(null);
    try { await onChallenge(to, choice.game, choice.chosenOpts()); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const row = (r: (typeof rows)[number]) => {
    const can = r.here && !r.playing;
    const on = picked.includes(r.name);
    const rec = record.get(r.name);
    return (
      <li key={r.name} className={`fr-row ${on ? 'on' : ''} ${can ? '' : 'off'}`} onClick={() => can && togglePick(r.name)} role="checkbox" aria-checked={on} aria-disabled={!can} tabIndex={can ? 0 : -1}
        onKeyDown={(e) => { if (can && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); togglePick(r.name); } }}>
        <span className="pp-avatar member">{r.name[0]?.toUpperCase()}<i className={`fr-dot ${r.here ? (r.playing ? 'busy' : '') : 'away'}`} /></span>
        <div className="pp-who">
          <b>{r.name}</b>
          <span>{r.playing ? 'In a game' : r.here ? 'Online' : ago(r.lastLogin)}{rec && (rec.w || rec.l) ? ` · you ${rec.w}–${rec.l}` : ''}</span>
        </div>
        <button className={`fr-star ${r.fav ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFav(r.name); }} aria-label={r.fav ? `Remove ${r.name} from favourites` : `Add ${r.name} to favourites`} title={r.fav ? 'Favourite' : 'Add to favourites'}>
          <Star size={15} fill={r.fav ? 'currentColor' : 'none'} />
        </button>
        {r.fav && can ? (
          <button className="fr-duel" onClick={(e) => { e.stopPropagation(); void send([r.name], `duel:${r.name}`); }} disabled={!!busy}>
            {busy === `duel:${r.name}` ? <Loader2 size={13} className="spin" /> : <Swords size={13} />} Duel
          </button>
        ) : can ? (
          <span className={`fr-check ${on ? 'on' : ''}`}>{on && <Check size={13} strokeWidth={3} />}</span>
        ) : null}
      </li>
    );
  };

  const onlineCount = rows.filter((r) => r.here).length;
  return (
    <Shell label="Challenge friends" onClose={onClose} wide>
      <header className="gc-head">
        <span className="gc-badge"><Swords size={15} /></span>
        <div className="gc-title"><b>Challenge friends</b><span>{connected ? `${onlineCount} online now · live, head-to-head` : 'Connecting…'}</span></div>
        <span className="gc-spacer" />
        <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={17} /></button>
      </header>

      {favRows.length > 0 && (
        <>
          <div className="fr-label"><Star size={11} fill="currentColor" /> Favourites</div>
          <ul className="pp-list fr-list">{favRows.map(row)}</ul>
        </>
      )}

      <div className="fr-label">{favRows.length ? 'Everyone' : 'Who'}</div>
      <ul className="pp-list fr-list">
        {!connected && <li className="pp-empty"><Loader2 size={14} className="spin" /> Connecting…</li>}
        {connected && rows.length === 0 && (
          <li className="pp-empty">
            {mode === 'local'
              ? <>Nobody else is here yet. To try it on this computer, open another window at <code>?as=maya</code>.</>
              : 'No other players yet — the owner can invite people from People.'}
          </li>
        )}
        {connected && rows.length > 0 && otherRows.length === 0 && <li className="pp-empty">Everyone’s in your favourites.</li>}
        {otherRows.map(row)}
      </ul>
      {connected && rows.length > 0 && favRows.length === 0 && <p className="fr-tip"><Star size={11} /> Star friends to keep them on top with a one-tap Duel.</p>}

      <div className="fr-label">Game</div>
      <GamePicker c={choice} />

      {error && <p className="pp-error">{error}</p>}
      <button className="primary fr-send" disabled={!picked.length || !!busy || !connected} onClick={() => void send(picked, 'pick')}>
        {busy === 'pick' ? <Loader2 size={15} className="spin" /> : <Swords size={15} />}
        {picked.length ? `Challenge ${picked.length === 1 ? picked[0] : `${picked.length} friends`}` : 'Pick someone who’s online'}
      </button>

      {history && history.length > 0 && (
        <>
          <div className="fr-label"><Trophy size={12} /> Recent matches</div>
          <ul className="fr-history">
            {history.slice(0, 5).map((m) => {
              const sorted = [...m.players].sort((a, b) => b.score - a.score);
              const won = sorted[0]?.name === me && (sorted[1]?.score ?? -1) < sorted[0].score;
              return (
                <li key={m.id}>
                  <span className={`fr-res ${won ? 'w' : 'l'}`}>{won ? 'Won' : sorted[0]?.score === sorted[1]?.score ? 'Draw' : 'Lost'}</span>
                  <span className="fr-h-game">{GAMES[m.game]?.label ?? m.game}</span>
                  <span className="fr-h-who">{sorted.map((p) => `${p.name === me ? 'you' : p.name} ${p.score.toLocaleString('en-US')}`).join(' · ')}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Shell>
  );
}

/** Pick a game, get a link; anyone signed in who opens it joins your lobby. */
export function InvitePanel({ open, onClose, connected, owner, onCreate }: { open: boolean; onClose: () => void; connected: boolean; owner: boolean; onCreate: (game: GameId, opts: MatchOpts) => Promise<void> }) {
  const choice = useGameChoice();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscape(open, onClose);
  const create = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await onCreate(choice.game, choice.chosenOpts()); } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <Shell label="Invite with a link" onClose={onClose}>
      <header className="gc-head">
        <span className="gc-badge"><Link2 size={15} /></span>
        <div className="gc-title"><b>Invite with a link</b><span>Pick a game — anyone you send the link to can join</span></div>
        <span className="gc-spacer" />
        <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={17} /></button>
      </header>
      <div className="fr-label">Game</div>
      <GamePicker c={choice} />
      {error && <p className="pp-error">{error}</p>}
      <button className="primary fr-send" disabled={busy || !connected} onClick={() => void create()}>
        {busy ? <Loader2 size={15} className="spin" /> : <Link2 size={15} />} {connected ? 'Create invite link' : 'Connecting…'}
      </button>
      <p className="fr-tip">You’ll wait in a lobby while friends join (up to 6 players). Start whenever you’re ready. {owner ? 'Friends without an account can create one right from the link.' : 'They need a GeoQuest account.'}</p>
    </Shell>
  );
}
