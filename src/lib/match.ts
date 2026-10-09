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
import { countryAt } from './data';
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
      const one = (avoid: string[] = []): Promise<Spot> => findMapillarySpot(DEFAULT_MAPILLARY_TOKEN, undefined, avoid)
        .catch(() => findLocation(undefined, avoid).then((it) => ({ ...it, provider: 'panoramax' as const })));
      // Found in parallel (fast); any that repeat a country are replaced with a new one.
      const spots = await Promise.all(Array.from({ length: n }, () => one()));
      const used: string[] = [];
      for (let i = 0; i < spots.length; i++) {
        let c = countryAt(spots[i].lat, spots[i].lng);
        if (c && used.includes(c)) { spots[i] = await one(used); c = countryAt(spots[i].lat, spots[i].lng); }
        if (c) used.push(c);
      }
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
  /** The owner's links: people without an account can sign up from them */
  signup?: boolean;
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
    return { id: d.id, from: live.me, game, opts, players: [live.me], at: Date.now(), ticket: d.ticket, open: true, signup: !!d.signup, link: joinLink(d.token) };
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
export interface ChatMsg { id: number; from: string; text: string; at: number }
export const CHAT_MAX = 200;

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
  signup?: boolean;
  /** Banter between the players (lobby, during the game, and after) */
  chat: ChatMsg[];
}

const COUNTDOWN = 3200;
const GRACE = 1500; // after the clock runs out, wait this long for late answers
const SYNC_MS = 2500; // the host's "here's where we are" beat while a match runs

/**
 * Where a match is, as one number that only ever moves forward: countdown 0, question i = 2i+1,
 * its reveal = 2i+2, over = a lot. A message that would move it backwards (a repeat, or one that
 * arrived late) is ignored.
 */
const stepOf = (phase: Phase, qi: number) =>
  phase === 'countdown' ? 0 : phase === 'question' ? 2 * qi + 1 : phase === 'reveal' ? 2 * qi + 2 : phase === 'done' || phase === 'aborted' ? 1e6 : -1;
/** Everyone's answers, from two views of the match (the first answer for each question counts). */
function mergeAnswers(a: Snapshot['answers'], b: unknown): Snapshot['answers'] {
  if (!b || typeof b !== 'object') return a;
  const out = { ...a };
  for (const [k, row] of Object.entries(b as Record<string, Record<string, Answer>>)) {
    const i = Number(k);
    if (!Number.isInteger(i) || i < 0 || i >= 20 || !row || typeof row !== 'object') continue;
    for (const [name, ans] of Object.entries(row)) {
      if (out[i]?.[name] || !ans || typeof ans !== 'object') continue;
      out[i] = { ...(out[i] ?? {}), [name]: { pts: Math.max(0, Math.min(6000, Math.round(Number(ans.pts) || 0))), ok: !!ans.ok, d: ans.d } };
    }
  }
  return out;
}

export class MatchSession {
  private s: Snapshot;
  private subs = new Set<() => void>();
  private ch: LiveChannel | null = null;
  private offs: (() => void)[] = [];
  private timers = new Set<number>();
  private revealed = new Set<number>();
  private seen = new Set<string>(); // players we've seen present at least once
  private saved = false;
  private roster = new Set<string>(); // who's playing, once it starts
  private beat = 0; // host: the sync interval
  private asked = 0; // guest: when we last asked the host for the questions
  private doneBeats = 0; // host: a few more beats after the end, for anyone who missed it

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
      open: !!inv.open, link: inv.link, signup: inv.signup, chat: [],
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
        if (this.s.open && this.s.phase === 'lobby' && this.active().length < 2) this.hostSend('abort', { reason: 'Nobody joined from the link' });
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
        // Back after a dropped connection: still in the game.
        if (p.status === 'left' && this.roster.has(p.name) && stepOf(this.s.phase, this.s.qi) >= 0 && stepOf(this.s.phase, this.s.qi) < 1e6) this.setStatus(p.name, 'joined');
      } else if (this.seen.has(p.name) && p.status === 'joined' && p.name !== this.s.me && this.s.phase !== 'done' && this.s.phase !== 'aborted') {
        this.setStatus(p.name, 'left');
        if (p.name === this.s.host && !this.s.isHost) this.set({ phase: 'aborted', reason: `${this.s.host} left the match` });
      }
    }
    if (this.s.isHost) {
      if (this.s.phase === 'lobby') this.maybeStart();
      else if (this.s.phase === 'question') this.checkAllAnswered();
      // Everyone else left mid-game → wrap up with the scores so far.
      if (['countdown', 'question', 'reveal'].includes(this.s.phase) && this.active().length < 2) this.hostSend('end', { early: true, answers: this.s.answers });
    }
  }

  private onMessage(name: string, d: Record<string, unknown>, from: string) {
    const s = this.s;
    switch (name) {
      case 'chat': {
        // Only players in this match; plain text, trimmed (rendered as text, never as HTML).
        const text = typeof d?.t === 'string' ? d.t.trim().slice(0, CHAT_MAX) : '';
        if (!text || !s.players.some((p) => p.name === from)) return;
        this.set({ chat: [...s.chat, { id: ++this.chatSeq, from, text, at: Date.now() }].slice(-100) });
        break;
      }
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
        if (from !== s.host || s.script) return; // already started (a repeat, or our own echo)
        // Shape check: a malformed script from another player must not break this game.
        const sc = d?.script as Script | undefined;
        if (!sc || sc.game !== s.game || !Array.isArray(sc.qs) || !sc.qs.length || sc.qs.length > 20 || !Array.isArray(d.players)) return;
        const inGame = new Set(d.players as string[]);
        this.roster = inGame;
        const left = Math.max(0, Math.min(COUNTDOWN, Number(d.left ?? COUNTDOWN)));
        this.set({
          script: d.script as Script, phase: 'countdown', countdownEndsAt: Date.now() + left, qi: 0, answers: {},
          players: s.players.map((p) => (inGame.has(p.name) ? { ...p, status: 'joined', score: 0 } : p.status === 'invited' || p.status === 'joined' ? { ...p, status: 'missed' } : p)),
        });
        if (s.isHost) {
          this.after(COUNTDOWN, () => this.hostSend('q', { i: 0, left: GAMES[s.game].ms }));
          this.beat = window.setInterval(() => this.sendSync(), SYNC_MS);
        }
        break;
      }
      case 'q': {
        if (from !== s.host) return;
        const i = Number(d.i);
        if (!Number.isInteger(i) || i < 0 || i >= (s.script?.qs.length ?? 0)) return;
        if (2 * i + 1 <= stepOf(s.phase, s.qi)) return; // a repeat, or already past it
        const ms = GAMES[s.game].ms;
        const left = Math.max(0, Math.min(ms, Number(d.left ?? ms)));
        const now = Date.now();
        this.set({ phase: 'question', qi: i, qStartedAt: now - (ms - left), qEndsAt: now + left });
        if (s.isHost) this.after(left + GRACE, () => this.reveal(i));
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
        const i = Number(d.i);
        if (!Number.isInteger(i) || i < 0 || i >= (s.script?.qs.length ?? 0)) return;
        if (2 * i + 2 <= stepOf(s.phase, s.qi)) return;
        // The host's answers are the record — fills in any we missed.
        const answers = mergeAnswers(s.answers, d.answers);
        const rms = GAMES[s.game].revealMs;
        const left = Math.max(0, Math.min(rms, Number(d.left ?? rms)));
        this.set({ phase: 'reveal', qi: i, revealEndsAt: Date.now() + left, answers, players: s.players.map((p) => ({ ...p, score: total(answers, p.name) })) });
        if (s.isHost) {
          this.after(left, () => {
            if (this.s.phase !== 'reveal' || this.s.qi !== i) return;
            if (i + 1 < (this.s.script?.qs.length ?? 0)) this.hostSend('q', { i: i + 1, left: GAMES[s.game].ms });
            else this.hostSend('end', { answers: this.s.answers });
          });
        }
        break;
      }
      case 'end': {
        if (from !== s.host || s.phase === 'done' || s.phase === 'aborted') return;
        const answers = mergeAnswers(s.answers, d?.answers);
        this.set({ phase: 'done', answers, players: s.players.map((p) => ({ ...p, score: total(answers, p.name) })), reason: d?.early ? 'Everyone else left — final scores so far' : undefined });
        if (s.isHost) void this.save();
        break;
      }
      case 'sync': {
        // The host's regular "here's where we are": catch up on anything we missed, and line our
        // clock up with the host's.
        if (from !== s.host || s.isHost) return;
        if (!s.script) {
          if (Date.now() - this.asked > SYNC_MS) { this.asked = Date.now(); void this.ch?.publish('need', {}); }
          return;
        }
        if (d.phase === 'done' || d.phase === 'aborted') {
          if (d.phase === 'done') this.onMessage('end', { answers: d.answers }, s.host);
          else if (s.phase !== 'aborted') this.set({ phase: 'aborted', reason: 'The match was cancelled' });
          return;
        }
        // The host never got my answer to this question (lost on a bad connection)? Send it again.
        const myAns = s.answers[s.qi]?.[s.me];
        const theirs = (d.answers as Snapshot['answers'] | undefined)?.[s.qi]?.[s.me];
        if (myAns && !theirs && s.phase === 'question' && Number(d.qi) === s.qi) void this.ch?.publish('ans', { i: s.qi, pts: myAns.pts, ok: myAns.ok, d: myAns.d });
        const answers = mergeAnswers(s.answers, d.answers);
        const patch: Partial<Snapshot> = {};
        if (answers !== s.answers) Object.assign(patch, { answers, players: s.players.map((p) => ({ ...p, score: total(answers, p.name) })) });
        const step = Number(d.step), qi = Number(d.qi), left = Math.max(0, Number(d.left) || 0), now = Date.now();
        const mine = stepOf(s.phase, s.qi);
        if (Number.isInteger(qi) && qi >= 0 && qi < s.script.qs.length && (step > mine || step === mine)) {
          if (d.phase === 'countdown') Object.assign(patch, { phase: 'countdown', countdownEndsAt: now + left });
          else if (d.phase === 'question') {
            const ms = GAMES[s.game].ms;
            // Behind → jump to this question; same question → only fix a clock that's well off.
            if (step > mine || Math.abs(s.qEndsAt - (now + left)) > 1200) Object.assign(patch, { phase: 'question', qi, qStartedAt: now - (ms - left), qEndsAt: now + left });
          } else if (d.phase === 'reveal' && step > mine) Object.assign(patch, { phase: 'reveal', qi, revealEndsAt: now + left });
        }
        if (Object.keys(patch).length) this.set(patch);
        break;
      }
      case 'need':
        // Someone missed the start (questions and all): send it again, just to catch them up.
        if (s.isHost && s.script && from !== s.me) void this.ch?.publish('start', { script: s.script, players: [...this.roster], left: 0 });
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
    if (!guests.some((p) => p.status === 'joined')) { this.hostSend('abort', { reason: 'Nobody accepted the challenge' }); return; }
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
      this.hostSend('start', { script, players: this.active().map((p) => p.name), left: COUNTDOWN });
    } catch (err) {
      this.hostSend('abort', { reason: `Couldn’t set up the game: ${(err as Error).message}` });
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
    this.hostSend('rev', { i, left: GAMES[this.s.game].revealMs, answers: this.s.answers });
  }

  /**
   * Host: move the match on. Applied here straight away (the host's own clock doesn't wait for its
   * message to come back), then sent to everyone; the copy that comes back is ignored.
   */
  private hostSend(name: string, d: Record<string, unknown>) {
    this.onMessage(name, d, this.s.me);
    void this.ch?.publish(name, d);
  }

  /** Host: where the match is right now, for anyone who missed a step. */
  private sendSync() {
    const s = this.s;
    const step = stepOf(s.phase, s.qi);
    if (step < 0 || (step >= 1e6 && ++this.doneBeats > 4)) { this.stopBeat(); return; }
    const end = s.phase === 'countdown' ? s.countdownEndsAt : s.phase === 'question' ? s.qEndsAt : s.phase === 'reveal' ? s.revealEndsAt : 0;
    void this.ch?.publish('sync', { step, phase: s.phase, qi: s.qi, left: Math.max(0, end - Date.now()), answers: s.answers });
  }
  private stopBeat() { window.clearInterval(this.beat); this.beat = 0; }

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
  private chatSeq = 0;
  private lastSaid = 0;
  /** Say something to the other players (a short pause between messages keeps it from flooding). */
  say(text: string) {
    const t = text.trim().slice(0, CHAT_MAX);
    if (!t || Date.now() - this.lastSaid < 400) return false;
    this.lastSaid = Date.now();
    void this.ch?.publish('chat', { t }); // comes back to us too, like everyone else's
    return true;
  }

  /** Submit my answer for the current question (once). */
  answer(pts: number, ok: boolean, d?: unknown) {
    const s = this.s;
    if (s.phase !== 'question' || s.answers[s.qi]?.[s.me]) return;
    const msg = { i: s.qi, pts, ok, d };
    this.onMessage('ans', msg, s.me); // counts here at once; the copy that comes back is ignored
    void this.ch?.publish('ans', msg);
  }

  /** Leave (the host leaving ends it for everyone). */
  close() {
    if (this.s.isHost && !['done', 'aborted'].includes(this.s.phase)) void this.ch?.publish('abort', { reason: `${this.s.host} ended the match` });
    for (const t of this.timers) window.clearTimeout(t);
    this.timers.clear();
    this.stopBeat();
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
