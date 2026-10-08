// Live head-to-head matches: the shared question set ("script"), scoring, and the match state
// machine everyone runs over a channel `match:<id>` (see live.ts).
//
// The challenger's browser is the host: it builds the script and paces the match (start →
// question → reveal → … → end). Every player grades their own answer and publishes the points;
// everyone tallies the same messages, so all scoreboards agree. Presence on the channel is how
// we know who joined and who left.
import { api } from './api';
import type { Live, LiveChannel, Member } from './live';
import { makeRound } from './capitals';
import { matchQuestions, type TriviaQ } from './trivia';
import { shuffledQuestions } from './top5';
import { QUIZ_POOL, CLUE_POOL, clueFor } from './quiz';
import { findMapillarySpot } from './mapillary';
import { findLocation } from './streetview';
import { DEFAULT_MAPILLARY_TOKEN } from '../config';
import type { Spot } from '../components/StreetGame';

export type GameId = 'quiz' | 'capitals' | 'trivia' | 'top5' | 'street';
export type QuizMode = 'find' | 'flag' | 'clue';
export interface MatchOpts { mode?: QuizMode; level?: 'easy' | 'all' }

export const GAMES: Record<GameId, { label: string; blurb: string; n: number; ms: number; revealMs: number }> = {
  quiz: { label: 'Map quiz', blurb: '10 countries · click them on the globe', n: 10, ms: 20_000, revealMs: 2600 },
  capitals: { label: 'Capitals', blurb: '10 questions · 4 choices', n: 10, ms: 12_000, revealMs: 2200 },
  trivia: { label: 'Geo Trivia', blurb: '10 questions · Easy → Impossible', n: 10, ms: 15_000, revealMs: 2600 },
  top5: { label: 'Name the Top 5', blurb: '3 lists · type what you know', n: 3, ms: 45_000, revealMs: 5000 },
  street: { label: 'Street View', blurb: '5 places · pin them on the map', n: 5, ms: 75_000, revealMs: 7000 },
};
export const QUIZ_MODES: { id: QuizMode; label: string }[] = [
  { id: 'find', label: 'Find it' }, { id: 'flag', label: 'Flags' }, { id: 'clue', label: 'Clues' },
];

export type Script =
  | { game: 'capitals'; qs: { c: string; kind: 'capital' | 'country'; o: string[] }[] }
  | { game: 'trivia'; qs: TriviaQ[] }
  | { game: 'quiz'; mode: QuizMode; qs: { t: string; clue?: string }[] }
  | { game: 'top5'; qs: string[] }
  | { game: 'street'; qs: Spot[] };

export async function buildScript(game: GameId, opts: MatchOpts): Promise<Script> {
  const n = GAMES[game].n;
  switch (game) {
    case 'capitals':
      return { game, qs: makeRound(opts.level ?? 'easy', n).map((q) => ({ c: q.country.cca3, kind: q.kind, o: q.options.map((o) => o.cca3) })) };
    case 'trivia':
      return { game, qs: matchQuestions() };
    case 'quiz': {
      const mode = opts.mode ?? 'find';
      const pool = [...(mode === 'clue' ? CLUE_POOL : QUIZ_POOL)].sort(() => Math.random() - 0.5).slice(0, n);
      return { game, mode, qs: pool.map((t) => ({ t, clue: mode === 'clue' ? clueFor(t) : undefined })) };
    }
    case 'top5':
      return { game, qs: shuffledQuestions().slice(0, n).map((q) => q.id) };
    case 'street': {
      // Everyone opens the same images, so use the built-in Mapillary token (anyone can view).
      const one = (): Promise<Spot> => findMapillarySpot(DEFAULT_MAPILLARY_TOKEN)
        .catch(() => findLocation().then((it) => ({ ...it, provider: 'panoramax' as const })));
      const spots = await Promise.all(Array.from({ length: n }, one));
      return { game, qs: spots };
    }
  }
}

/** Points for a right answer: 500, plus up to 500 more for speed. */
export const speedPoints = (fracLeft: number) => Math.round(500 + 500 * Math.max(0, Math.min(1, fracLeft)));

// ── Invitations ──
export interface Invite {
  id: string; from: string; game: GameId; opts: MatchOpts; players: string[]; at: number; ticket?: string;
  /** Open lobby from a shared link: whoever opens the link joins (up to 6) */
  open?: boolean;
  /** The shareable link (host only) */
  link?: string;
}
export const INVITE_MS = 30_000;
/** How long an open lobby waits for people to arrive via the link */
export const OPEN_MS = 15 * 60_000;
const MAX_PLAYERS = 6;

const b64 = (o: object) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
const joinLink = (token: string) => `${location.origin}/?join=${encodeURIComponent(token)}`;

/** Create a lobby anyone can join with the link (hosted: the server signs the link). */
export async function createOpenInvite(live: Live, game: GameId, opts: MatchOpts): Promise<Invite> {
  if (live.mode === 'ably') {
    const r = await api('/api/invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game, opts }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? 'Couldn’t create the invite link.');
    return { id: d.id, from: live.me, game, opts, players: [live.me], at: Date.now(), ticket: d.ticket, open: true, link: joinLink(d.token) };
  }
  const id = Math.random().toString(36).slice(2, 12);
  return { id, from: live.me, game, opts, players: [live.me], at: Date.now(), open: true, link: joinLink(b64({ m: id, host: live.me, game, opts, exp: Date.now() + 30 * 60_000 })) };
}

/** Join a lobby from a shared link. */
export async function joinOpenInvite(live: Live, token: string): Promise<Invite> {
  if (live.mode === 'ably') {
    const r = await api('/api/invites/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? 'Couldn’t join that match.');
    return { id: d.id, from: d.host, game: d.game, opts: d.opts ?? {}, players: [d.host, live.me], at: Date.now(), ticket: d.ticket, open: true };
  }
  const t = unb64(token) as { m: string; host: string; game: GameId; opts: MatchOpts; exp: number };
  if (!t?.m || t.exp < Date.now()) throw new Error('This invite link has expired — ask for a new one.');
  if (t.host === live.me) throw new Error('That’s your own invite link — send it to a friend.');
  return { id: t.m, from: t.host, game: t.game, opts: t.opts ?? {}, players: [t.host, live.me], at: Date.now(), open: true };
}

/** Challenge friends: hosted, the server delivers the invites; locally, we post to their tab. */
export async function sendChallenge(live: Live, to: string[], game: GameId, opts: MatchOpts): Promise<Invite> {
  if (live.mode === 'ably') {
    const r = await api('/api/challenges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to, game, opts }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? 'Couldn’t send the challenge.');
    return { id: d.id, from: live.me, game, opts, players: d.players, at: Date.now(), ticket: d.ticket };
  }
  const inv: Invite = { id: Math.random().toString(36).slice(2, 12), from: live.me, game, opts, players: [live.me, ...to], at: Date.now() };
  await Promise.all(to.map((name) => { const ch = live.channel(`inbox:${name}`); return ch.publish('invite', inv); }));
  return inv;
}

/** Say no (or "busy") to an invite without joining the match. */
export async function declineInvite(live: Live, inv: Invite, busy = false) {
  try {
    if (inv.ticket) await live.addTicket(inv.ticket);
    const ch = live.channel(`match:${inv.id}`);
    await ch.publish('decline', { busy });
    window.setTimeout(() => ch.release(), 1500);
  } catch { /* the host will time the invite out anyway */ }
}

// ── The match ──
export type Phase = 'lobby' | 'preparing' | 'countdown' | 'question' | 'reveal' | 'done' | 'aborted';
export type PStatus = 'invited' | 'joined' | 'declined' | 'busy' | 'missed' | 'left';
export interface Player { name: string; status: PStatus; score: number }
export interface Answer { pts: number; ok: boolean; d?: unknown }

export interface Snapshot {
  id: string;
  game: GameId;
  opts: MatchOpts;
  host: string;
  me: string;
  isHost: boolean;
  phase: Phase;
  players: Player[];
  script: Script | null;
  qi: number;
  /** Date.now() deadlines, on this device's clock */
  inviteEndsAt: number;
  countdownEndsAt: number;
  qStartedAt: number;
  qEndsAt: number;
  revealEndsAt: number;
  answers: Record<number, Record<string, Answer>>;
  reason?: string;
  error?: string;
  /** Open lobby (joined by link) and, for its host, the link to share */
  open: boolean;
  link?: string;
}

const COUNTDOWN = 3200;
const GRACE = 1500; // after the clock runs out, wait this long for late answers

export class MatchSession {
  private s: Snapshot;
  private subs = new Set<() => void>();
  private ch: LiveChannel | null = null;
  private offs: (() => void)[] = [];
  private timers = new Set<number>();
  private revealed = new Set<number>();
  private seen = new Set<string>(); // players we've seen present at least once
  private saved = false;

  private live: Live;

  constructor(live: Live, inv: Invite) {
    this.live = live;
    const isHost = inv.from === live.me;
    this.s = {
      id: inv.id, game: inv.game, opts: inv.opts ?? {}, host: inv.from, me: live.me, isHost,
      phase: 'lobby',
      players: inv.players.map((name) => ({ name, status: name === inv.from ? 'joined' : 'invited', score: 0 })),
      script: null, qi: 0,
      inviteEndsAt: inv.at + (inv.open ? OPEN_MS : INVITE_MS), countdownEndsAt: 0, qStartedAt: 0, qEndsAt: 0, revealEndsAt: 0,
      answers: {},
      open: !!inv.open, link: inv.link,
    };
    this.ticket = inv.ticket;
  }
  private ticket?: string;

  get = () => this.s;
  subscribe = (cb: () => void) => { this.subs.add(cb); return () => { this.subs.delete(cb); }; };
  private set(patch: Partial<Snapshot>) {
    this.s = { ...this.s, ...patch };
    for (const cb of this.subs) cb();
  }
  private after(ms: number, fn: () => void) {
    const t = window.setTimeout(() => { this.timers.delete(t); fn(); }, ms);
    this.timers.add(t);
  }
  private setStatus(name: string, status: PStatus) {
    if (this.s.players.find((p) => p.name === name)?.status === status) return;
    this.set({ players: this.s.players.map((p) => (p.name === name ? { ...p, status } : p)) });
  }
  /** Players still in the game. */
  active = () => this.s.players.filter((p) => p.status === 'joined');

  async open() {
    if (this.ticket) await this.live.addTicket(this.ticket);
    const ch = this.live.channel(`match:${this.s.id}`);
    this.ch = ch;
    this.offs.push(ch.subscribe((name, data, from) => this.onMessage(name, data as Record<string, unknown>, from)));
    await ch.enter({});
    this.offs.push(ch.members((m) => this.onMembers(m)));
    if (this.s.isHost) {
      this.after(Math.max(0, this.s.inviteEndsAt - Date.now()), () => {
        for (const p of this.s.players) if (p.status === 'invited') this.setStatus(p.name, 'missed');
        if (this.s.open && this.s.phase === 'lobby' && this.active().length < 2) void this.ch?.publish('abort', { reason: 'Nobody joined from the link' });
        else this.maybeStart();
      });
    } else if (this.s.open) {
      // Joined by link: if the host's lobby isn't there, say so instead of waiting forever.
      this.after(9000, () => { if (!this.seen.has(this.s.host) && this.s.phase === 'lobby') this.set({ phase: 'aborted', reason: 'That match isn’t open any more — ask for a new link' }); });
    }
  }

  private onMembers(ms: Member[]) {
    const here = new Set(ms.map((m) => m.name));
    // Open lobby: whoever arrives through the link joins (until it starts or fills up).
    if (this.s.open) {
      const known = new Set(this.s.players.map((p) => p.name));
      const fresh = [...here].filter((n) => !known.has(n));
      if (fresh.length) {
        if (this.s.phase === 'lobby') {
          const room = Math.max(0, MAX_PLAYERS - this.s.players.length);
          this.set({ players: [...this.s.players, ...fresh.slice(0, room).map((name) => ({ name, status: 'joined' as PStatus, score: 0 }))] });
          if (this.s.isHost) for (const n of fresh.slice(room)) void this.ch?.publish('closed', { to: n, reason: 'That match is full' });
        } else if (this.s.isHost && this.s.phase !== 'done' && this.s.phase !== 'aborted') {
          for (const n of fresh) void this.ch?.publish('closed', { to: n, reason: 'That match has already started' });
        }
      }
    }
    for (const p of this.s.players) {
      if (here.has(p.name)) {
        this.seen.add(p.name);
        if (p.status === 'invited' && this.s.phase === 'lobby') this.setStatus(p.name, 'joined');
      } else if (this.seen.has(p.name) && p.status === 'joined' && p.name !== this.s.me && this.s.phase !== 'done' && this.s.phase !== 'aborted') {
        this.setStatus(p.name, 'left');
        if (p.name === this.s.host && !this.s.isHost) this.set({ phase: 'aborted', reason: `${this.s.host} left the match` });
      }
    }
    if (this.s.isHost) {
      if (this.s.phase === 'lobby') this.maybeStart();
      else if (this.s.phase === 'question') this.checkAllAnswered();
      // Everyone else left mid-game → wrap up with the scores so far.
      if (['countdown', 'question', 'reveal'].includes(this.s.phase) && this.active().length < 2) void this.ch?.publish('end', { early: true });
    }
  }

  private onMessage(name: string, d: Record<string, unknown>, from: string) {
    const s = this.s;
    switch (name) {
      case 'decline':
        if (s.phase === 'lobby') { this.setStatus(from, d?.busy ? 'busy' : 'declined'); if (s.isHost) this.maybeStart(); }
        break;
      case 'closed':
        if (from === s.host && d?.to === s.me) this.set({ phase: 'aborted', reason: String(d.reason ?? 'That match isn’t open') });
        break;
      case 'prep':
        if (from === s.host && s.phase === 'lobby') this.set({ phase: 'preparing' });
        break;
      case 'start': {
        if (from !== s.host) return;
        // Shape check: a malformed script from another player must not break this game.
        const sc = d?.script as Script | undefined;
        if (!sc || sc.game !== s.game || !Array.isArray(sc.qs) || !sc.qs.length || sc.qs.length > 20 || !Array.isArray(d.players)) return;
        const inGame = new Set(d.players as string[]);
        this.set({
          script: d.script as Script, phase: 'countdown', countdownEndsAt: Date.now() + COUNTDOWN, qi: 0, answers: {},
          players: s.players.map((p) => (inGame.has(p.name) ? { ...p, status: 'joined', score: 0 } : p.status === 'invited' || p.status === 'joined' ? { ...p, status: 'missed' } : p)),
        });
        if (s.isHost) this.after(COUNTDOWN, () => void this.ch?.publish('q', { i: 0 }));
        break;
      }
      case 'q': {
        if (from !== s.host) return;
        const i = Number(d.i);
        if (!Number.isInteger(i) || i < 0 || i >= (s.script?.qs.length ?? 0)) return;
        const now = Date.now();
        this.set({ phase: 'question', qi: i, qStartedAt: now, qEndsAt: now + GAMES[s.game].ms });
        if (s.isHost) this.after(GAMES[s.game].ms + GRACE, () => this.reveal(i));
        break;
      }
      case 'ans': {
        const i = Number(d.i);
        if (!Number.isInteger(i) || i < 0 || i >= 20) return;
        if (!s.players.some((p) => p.name === from)) return;
        if (s.answers[i]?.[from]) return; // first answer counts
        const ans: Answer = { pts: Math.max(0, Math.min(6000, Math.round(Number(d.pts) || 0))), ok: !!d.ok, d: d.d };
        const answers = { ...s.answers, [i]: { ...(s.answers[i] ?? {}), [from]: ans } };
        this.set({ answers, players: s.players.map((p) => ({ ...p, score: total(answers, p.name) })) });
        if (s.isHost) this.checkAllAnswered();
        break;
      }
      case 'rev': {
        if (from !== s.host) return;
        this.set({ phase: 'reveal', qi: Number(d.i), revealEndsAt: Date.now() + GAMES[s.game].revealMs });
        if (s.isHost) {
          const i = Number(d.i);
          this.after(GAMES[s.game].revealMs, () => {
            if (this.s.phase !== 'reveal') return;
            if (i + 1 < (this.s.script?.qs.length ?? 0)) void this.ch?.publish('q', { i: i + 1 });
            else void this.ch?.publish('end', {});
          });
        }
        break;
      }
      case 'end':
        if (from !== s.host) return;
        this.set({ phase: 'done', reason: d?.early ? 'Everyone else left — final scores so far' : undefined });
        if (s.isHost) void this.save();
        break;
      case 'abort':
        if (from !== s.host) return;
        this.set({ phase: 'aborted', reason: String(d?.reason ?? 'The match was cancelled') });
        break;
    }
  }

  // ── Host ──
  private maybeStart() {
    const s = this.s;
    if (!s.isHost || s.phase !== 'lobby' || s.open) return; // open lobbies start when the host says so
    const guests = s.players.filter((p) => p.name !== s.host);
    if (guests.some((p) => p.status === 'invited')) return; // still waiting on someone
    if (!guests.some((p) => p.status === 'joined')) { void this.ch?.publish('abort', { reason: 'Nobody accepted the challenge' }); return; }
    this.after(900, () => void this.startNow());
  }

  /** Host: start with whoever has joined. */
  async startNow() {
    if (!this.s.isHost || this.s.phase !== 'lobby') return;
    for (const p of this.s.players) if (p.status === 'invited') this.setStatus(p.name, 'missed');
    if (this.active().length < 2) return;
    this.set({ phase: 'preparing' });
    void this.ch?.publish('prep', {});
    try {
      const script = await buildScript(this.s.game, this.s.opts);
      if ((this.s.phase as Phase) !== 'preparing') return; // cancelled meanwhile
      await this.ch?.publish('start', { script, players: this.active().map((p) => p.name) });
    } catch (err) {
      await this.ch?.publish('abort', { reason: `Couldn’t set up the game: ${(err as Error).message}` });
    }
  }

  private checkAllAnswered() {
    const s = this.s;
    if (s.phase !== 'question') return;
    const got = s.answers[s.qi] ?? {};
    if (this.active().every((p) => got[p.name])) { const i = s.qi; this.after(700, () => this.reveal(i)); }
  }

  private reveal(i: number) {
    if (this.revealed.has(i) || this.s.phase !== 'question' || this.s.qi !== i) return;
    this.revealed.add(i);
    void this.ch?.publish('rev', { i });
  }

  private async save() {
    if (this.saved) return;
    this.saved = true;
    const players = this.s.players.filter((p) => p.status === 'joined' || p.status === 'left').map((p) => ({ name: p.name, score: p.score }));
    await api(`/api/matches/${this.s.id}/result`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GQ-As': this.s.me },
      body: JSON.stringify({ ticket: this.ticket, game: this.s.game, mode: this.s.opts.mode ?? this.s.opts.level, players }),
    }).catch(() => null);
  }

  // ── Everyone ──
  /** Submit my answer for the current question (once). */
  answer(pts: number, ok: boolean, d?: unknown) {
    const s = this.s;
    if (s.phase !== 'question' || s.answers[s.qi]?.[s.me]) return;
    void this.ch?.publish('ans', { i: s.qi, pts, ok, d });
  }

  /** Leave (the host leaving ends it for everyone). */
  close() {
    if (this.s.isHost && !['done', 'aborted'].includes(this.s.phase)) void this.ch?.publish('abort', { reason: `${this.s.host} ended the match` });
    for (const t of this.timers) window.clearTimeout(t);
    this.timers.clear();
    for (const off of this.offs) off();
    const ch = this.ch;
    this.ch = null;
    if (ch) void ch.leave().finally(() => ch.release());
    this.subs.clear();
  }
}

const total = (answers: Snapshot['answers'], name: string) => Object.values(answers).reduce((s, a) => s + (a[name]?.pts ?? 0), 0);

// ── History ──
export interface MatchRecord { id: string; game: GameId; mode?: string; host: string; at: number; players: { name: string; score: number }[] }
export async function loadHistory(me: string): Promise<MatchRecord[]> {
  try {
    const d = await api('/api/matches', { headers: { 'X-GQ-As': me } }).then((r) => r.json());
    return d.matches ?? [];
  } catch { return []; }
}
