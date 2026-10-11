// 5-country challenges: play five countries, then dare anyone to beat your score with a link.
// Everything is in the link itself (the five countries, who sent it and their score) — nothing
// stored, nothing that expires, and it works without an account. The link is lightly encoded so
// the countries aren't readable at a glance in a chat. Pure functions: the middleware uses them too.

import { DAILY_N, MAX_POINTS, total, validPoints } from './daily.js';

export interface Challenge {
  targets: string[];
  /** Who sent it, and their score (absent for a fresh challenge nobody has played yet) */
  by?: string;
  points?: number[];
}

const MAX = DAILY_N * MAX_POINTS;
const CODE = /^[A-Z]{3}$/;

/** A display name: letters, numbers, spaces, dots, dashes and underscores; at most 24 characters. */
export const cleanName = (s: unknown) =>
  typeof s === 'string' ? s.replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24) : '';

const toB64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/** The link token for a challenge. */
export function encodeChallenge(ch: Challenge) {
  const by = cleanName(ch.by);
  const pts = ch.points && validPoints(ch.points) ? ch.points.join('') : '';
  return toB64(['1', ch.targets.join('.'), by, pts].join('~'));
}

/** Read a link token; null if it isn't a valid challenge (`known` checks each country exists). */
export function decodeChallenge(token: string | null | undefined, known: (cca3: string) => boolean = () => true): Challenge | null {
  if (!token || token.length > 200 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  let text: string;
  try { text = fromB64(token); } catch { return null; }
  const [v, list, by, pts] = text.split('~');
  if (v !== '1' || !list) return null;
  const targets = list.split('.');
  if (targets.length !== DAILY_N || new Set(targets).size !== DAILY_N || !targets.every((t) => CODE.test(t) && known(t))) return null;
  const points = pts ? [...pts].map(Number) : undefined;
  const name = cleanName(by);
  return {
    targets,
    ...(name ? { by: name } : {}),
    ...(points && validPoints(points) ? { points } : {}),
  };
}

/** Five different countries for a new challenge. */
export function newTargets(next: () => string) {
  const out: string[] = [];
  for (let guard = 0; out.length < DAILY_N && guard < 50; guard++) {
    const t = next();
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** Where a challenge's result is kept on this device (so it isn't replayed by accident). */
export const challengeKey = (targets: string[]) => `gq-ch-${targets.join('.')}`;

export const squares = (points: number[]) => points.map((p) => (p === 3 ? '🟩' : p === 2 ? '🟨' : p === 1 ? '🟧' : '⬛')).join('');

/** You vs whoever sent it: 'win' | 'lose' | 'tie' (null when there's no one to compare with). */
export function outcome(mine: number[], theirs?: number[]) {
  if (!theirs) return null;
  const a = total(mine), b = total(theirs);
  return a > b ? 'win' : a < b ? 'lose' : 'tie';
}

/** The message that goes with the link (no spoilers — just squares and scores). */
export function challengeMessage(mine: number[], by?: string, theirs?: number[]) {
  const me = total(mine);
  const line = `${squares(mine)} ${me}/${MAX}`;
  const o = by ? outcome(mine, theirs) : null;
  if (o === 'win') return `I beat ${by} on a GeoQuest challenge — ${me} vs ${total(theirs!)} 🏆\n${line}\nFind the same 5 countries on the globe. Can you beat me?`;
  if (o === 'lose') return `${by} beat me on a GeoQuest challenge, ${total(theirs!)} to ${me}.\n${line}\nFind the same 5 countries on the globe — can you do better?`;
  if (o === 'tie') return `${by} and I tied on a GeoQuest challenge — ${me} each.\n${line}\nFind the same 5 countries on the globe. Can you beat us?`;
  return `I scored ${me}/${MAX} on a GeoQuest challenge 🌍\n${line}\nFind the same 5 countries on the globe. Can you beat me?`;
}

/** The link preview title (WhatsApp, iMessage…) for a challenge link. */
export function previewTitle(ch: Challenge) {
  if (ch.by && ch.points) return `⚔️ ${ch.by} scored ${total(ch.points)}/${MAX} — can you beat it?`;
  if (ch.by) return `⚔️ ${ch.by} challenged you on GeoQuest`;
  return '⚔️ A GeoQuest challenge — find 5 countries';
}
