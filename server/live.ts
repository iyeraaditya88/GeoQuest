// Live head-to-head matches on the hosted site, over Ably (https://ably.com).
//
// The owner puts ABLY_API_KEY in Vercel's environment; it never leaves the server. Browsers get
// short-lived tokens scoped to exactly what they may do:
//   lobby          presence (who's online) — everyone
//   inbox:<me>     subscribe only — challenges are published here by this server, never by players
//   match:<id>     publish/subscribe/presence — only with a signed ticket naming you as a player
import Ably from 'ably';
import { randomBytes } from 'node:crypto';
import { signData, verifyData } from './session.js';

const KEY = () => process.env.ABLY_API_KEY?.trim() || '';
export const liveConfigured = () => /^[^:\s]+\.[^:\s]+:[^\s]+$/.test(KEY());

let rest: Ably.Rest | null = null;
const client = () => (rest ??= new Ably.Rest({ key: KEY() }));

export const GAMES = ['quiz', 'capitals', 'trivia', 'top5', 'street'] as const;
export type GameId = (typeof GAMES)[number];

export interface Ticket { m: string; host: string; players: string[]; game: GameId; exp: number }
const TICKET_HOURS = 3;

export const newMatchId = () => randomBytes(9).toString('base64url');

export function issueTicket(t: Omit<Ticket, 'exp'>) {
  return signData('match-ticket', { ...t, exp: Date.now() + TICKET_HOURS * 3600_000 } satisfies Ticket);
}

/** The ticket, if it's genuine, unexpired and names `user` as a player. */
export async function readTicket(token: unknown, user: string) {
  const t = await verifyData<Ticket>('match-ticket', token);
  if (!t || typeof t.m !== 'string' || !Array.isArray(t.players) || t.exp < Date.now() || !t.players.includes(user)) return null;
  return t;
}

/** A signed Ably token request for `user`, including the match channels their tickets allow. */
export async function tokenRequest(user: string, tickets: unknown) {
  const capability: Record<string, string[]> = { lobby: ['presence', 'subscribe'], [`inbox:${user}`]: ['subscribe'] };
  for (const tok of Array.isArray(tickets) ? tickets.slice(-8) : []) {
    const t = await readTicket(tok, user);
    if (t) capability[`match:${t.m}`] = ['publish', 'subscribe', 'presence'];
  }
  return client().auth.createTokenRequest({ clientId: user, capability: JSON.stringify(capability), ttl: 60 * 60_000 });
}

/** Deliver a challenge to someone's private inbox. */
export async function sendInvite(to: string, data: object) {
  await client().channels.get(`inbox:${to}`).publish('invite', data);
}

// ── Open invite links: anyone signed in who has the link may join that host's lobby ──
export interface OpenInvite { m: string; host: string; game: GameId; opts: object; exp: number }
const OPEN_MINUTES = 30;
export const issueOpenInvite = (t: Omit<OpenInvite, 'exp'>) => signData('open-invite', { ...t, exp: Date.now() + OPEN_MINUTES * 60_000 } satisfies OpenInvite);
export async function readOpenInvite(token: unknown) {
  const t = await verifyData<OpenInvite>('open-invite', token);
  return t && typeof t.m === 'string' && typeof t.host === 'string' && GAMES.includes(t.game) && t.exp > Date.now() ? t : null;
}
