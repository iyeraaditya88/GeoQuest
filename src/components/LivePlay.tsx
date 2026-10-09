// Live head-to-head: the connection, who's online, incoming challenges and the match in progress.
// Always mounted (it's light); the panels and the match UI load on demand.
import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore, type MutableRefObject } from 'react';
import { AnimatePresence } from 'motion/react';
import { connectLive, type Live } from '../lib/live';
import type { GameId, Invite, MatchOpts, MatchSession, Snapshot } from '../lib/match';
import type { Feedback } from './GlobeView';
import { fresh } from '../lib/chunks';
import { FriendsOnline } from './FriendsOnline';

const FriendsPanel = lazy(() => fresh(import('./FriendsPanel')).then((m) => ({ default: m.FriendsPanel })));
const InvitePanel = lazy(() => fresh(import('./FriendsPanel')).then((m) => ({ default: m.InvitePanel })));
const ChallengeToasts = lazy(() => fresh(import('./ChallengeToasts')).then((m) => ({ default: m.ChallengeToasts })));
const MatchOverlay = lazy(() => fresh(import('./MatchOverlay')).then((m) => ({ default: m.MatchOverlay })));

const loadMatch = () => fresh(import('../lib/match'));

/** What a match needs from the globe. */
export interface MatchGlobe {
  flyTo: (cca3: string) => void;
  feedback: (f: Feedback) => void;
  highlight: (cca3s: string[]) => void;
  revealPlace: (answer: string) => void;
}
export interface LiveState { active: boolean; quiz: boolean; immersive: boolean; online: number; ready: boolean }

interface Props {
  mode: 'ably' | 'local' | null;
  me: string | null;
  ai: boolean | null;
  friendsReq: number;
  /** Bumped to open the "invite with a link" panel */
  inviteReq: number;
  globe: MatchGlobe;
  /** Set while a Map-quiz question wants globe clicks */
  clickRef: MutableRefObject<((cca3: string | null) => void) | null>;
  onState: (s: LiveState) => void;
  /** The owner's invite links also let newcomers sign up */
  owner?: boolean;
  /** Show the favourites-online button (top right, beside the music) */
  fab?: boolean;
}

const noop = () => () => {};

export function LivePlay({ mode, me, ai, friendsReq, inviteReq, globe, clickRef, onState, owner = false, fab = false }: Props) {
  const [live, setLive] = useState<Live | null>(null);
  const [online, setOnline] = useState<Map<string, { s?: string }>>(new Map());
  const [invites, setInvites] = useState<Invite[]>([]);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [friendsPick, setFriendsPick] = useState<string[] | undefined>();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [session, setSession] = useState<MatchSession | null>(null);
  const [immersive, setImmersive] = useState(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const snap = useSyncExternalStore(session?.subscribe ?? noop, () => session?.get() ?? null);
  const inMatch = !!snap && snap.phase !== 'done' && snap.phase !== 'aborted';

  // Connect, join the lobby, listen to my inbox.
  useEffect(() => {
    if (!mode || !me) return;
    let dead = false;
    let conn: Live | null = null;
    const offs: (() => void)[] = [];
    let retry = 0, attempt = 0;
    const start = () => connectLive(mode, me).then((l) => {
      if (dead) { l.close(); return; }
      conn = l;
      setLive(l);
      const lobby = l.channel('lobby');
      void lobby.enter({ s: 'idle' }).catch(() => null);
      offs.push(lobby.members((ms) => setOnline(new Map(ms.filter((m) => m.name !== me).map((m) => [m.name, (m.data ?? {}) as { s?: string }])))));
      offs.push(l.channel(`inbox:${me}`).subscribe((name, data) => {
        if (name !== 'invite') return;
        const inv = data as Invite;
        if (sessionRef.current && !['done', 'aborted'].includes(sessionRef.current.get().phase)) {
          void loadMatch().then((m) => m.declineInvite(l, inv, true)); // busy in another match
          return;
        }
        setInvites((v) => [...v.filter((i) => i.id !== inv.id), inv]);
      }));
    }).catch((err) => {
      // Couldn't even start (offline, or the code didn't load): keep trying, backing off.
      console.warn('[live] could not connect', err);
      if (!dead) retry = window.setTimeout(() => void start(), Math.min(30_000, 2000 * 2 ** attempt++));
    });
    void start();
    return () => { dead = true; window.clearTimeout(retry); for (const off of offs) off(); conn?.close(); setLive(null); setOnline(new Map()); };
  }, [mode, me]);

  // Connection health, shown during a match ("Reconnecting…").
  const [conn, setConn] = useState('connected');
  useEffect(() => live?.onState(setConn), [live]);

  // Tell friends whether I'm free.
  useEffect(() => { void live?.channel('lobby').update({ s: inMatch ? 'playing' : 'idle' }).catch(() => null); }, [live, inMatch]);

  useEffect(() => { if (friendsReq) { setFriendsPick(undefined); setFriendsOpen(true); } }, [friendsReq]);
  useEffect(() => { if (inviteReq) setInviteOpen(true); }, [inviteReq]);
  useEffect(() => { if (!notice) return; const t = window.setTimeout(() => setNotice(null), 6000); return () => window.clearTimeout(t); }, [notice]);

  useEffect(() => {
    onState({ active: inMatch, quiz: inMatch && snap?.game === 'quiz', immersive: inMatch && immersive, online: online.size, ready: !!live });
  }, [inMatch, snap?.game, immersive, online.size, live, onState]);

  const begin = useCallback(async (inv: Invite) => {
    if (!live) return;
    const { MatchSession } = await loadMatch();
    sessionRef.current?.close();
    const s = new MatchSession(live, inv);
    setSession(s);
    setFriendsOpen(false);
    setInviteOpen(false);
    setInvites((v) => v.filter((i) => i.id !== inv.id));
    try { await s.open(); } catch (err) { console.warn('[live] could not join the match', err); }
  }, [live]);

  const challenge = useCallback(async (to: string[], game: GameId, opts: MatchOpts) => {
    if (!live) throw new Error('Not connected yet — try again in a moment.');
    const { sendChallenge } = await loadMatch();
    const inv = await sendChallenge(live, to, game, opts);
    await begin(inv);
  }, [live, begin]);

  const createLink = useCallback(async (game: GameId, opts: MatchOpts) => {
    if (!live) throw new Error('Not connected yet — try again in a moment.');
    const inv = await (await loadMatch()).createOpenInvite(live, game, opts);
    await begin(inv);
  }, [live, begin]);

  // Opened an invite link (?join=…): join that lobby once connected, then tidy the address bar.
  const joined = useRef(false);
  useEffect(() => {
    if (!live || joined.current) return;
    const token = new URLSearchParams(location.search).get('join');
    if (!token) return;
    joined.current = true;
    const url = new URL(location.href);
    url.searchParams.delete('join');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    void loadMatch().then((m) => m.joinOpenInvite(live, token)).then(begin).catch((err: Error) => setNotice(err.message));
  }, [live, begin]);

  const dropInvite = useCallback((inv: Invite) => setInvites((v) => v.filter((x) => x.id !== inv.id)), []);
  const decline = useCallback(async (inv: Invite) => {
    setInvites((v) => v.filter((i) => i.id !== inv.id));
    if (live) await (await loadMatch()).declineInvite(live, inv);
  }, [live]);

  const leave = useCallback(() => {
    sessionRef.current?.close();
    setSession(null);
    setImmersive(false);
    clickRef.current = null;
    globe.feedback(null);
    globe.highlight([]);
  }, [clickRef, globe]);

  const rematch = useCallback((s: Snapshot, game: GameId = s.game) => {
    // Everyone who played — including anyone who dropped out for a moment (a locked phone); if
    // they're really gone, the challenge just times out.
    const others = s.players.filter((p) => p.name !== s.me && (p.status === 'joined' || p.status === 'left')).map((p) => p.name);
    leave();
    if (others.length) void challenge(others, game, game === s.game ? s.opts : {}).catch(() => setFriendsOpen(true));
    else setFriendsOpen(true);
  }, [leave, challenge]);
  // A rematch challenge from someone in the match I've just finished shows on the results, not as a pop-up.
  const ended = !!snap && (snap.phase === 'done' || snap.phase === 'aborted');
  const rematchInvite = ended ? invites.find((i) => snap.players.some((p) => p.name === i.from)) : undefined;

  // Leaving the page mid-match tells the others.
  useEffect(() => () => sessionRef.current?.close(), []);

  if (!mode || !me) return null;
  return (
    <>
      <Suspense fallback={null}>
        {friendsOpen && (
          <FriendsPanel
            key={friendsPick?.join() ?? ''}
            preselect={friendsPick}
            open={friendsOpen}
            onClose={() => setFriendsOpen(false)}
            me={me}
            mode={mode}
            connected={!!live}
            online={online}
            onChallenge={challenge}
          />
        )}
      </Suspense>
      <Suspense fallback={null}>
        {inviteOpen && <InvitePanel open={inviteOpen} onClose={() => setInviteOpen(false)} connected={!!live} owner={owner} onCreate={createLink} />}
      </Suspense>
      {fab && !inMatch && (
        <FriendsOnline className="fo-fab" me={me} online={online}
          onDuel={(name) => { setFriendsPick([name]); setFriendsOpen(true); }}
          onManage={() => { setFriendsPick(undefined); setFriendsOpen(true); }} />
      )}
      {notice && <div className="live-notice" role="status" onClick={() => setNotice(null)}>{notice}</div>}
      <Suspense fallback={null}>
        {invites.some((i) => i !== rematchInvite) && <ChallengeToasts invites={invites.filter((i) => i !== rematchInvite)} onAccept={(i) => void begin(i)} onDecline={(i) => void decline(i)} onExpire={(i) => setInvites((v) => v.filter((x) => x.id !== i.id))} />}
      </Suspense>
      <AnimatePresence>
        {session && snap && (
          <Suspense key="match" fallback={null}>
            <MatchOverlay
              session={session}
              snap={snap}
              ai={ai}
              globe={globe}
              clickRef={clickRef}
              onImmersive={setImmersive}
              connected={conn === 'connected'}
              onLeave={leave}
              onRematch={(g) => rematch(snap, g)}
              rematch={rematchInvite}
              onAcceptRematch={(i) => void begin(i)}
              onDeclineRematch={(i) => void decline(i)}
              onExpireRematch={dropInvite}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </>
  );
}
