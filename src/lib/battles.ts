// Battles and wars since 1500: where and when each happened, who fought, how it ended and why it
// mattered. Figures are rounded scholarly estimates; many are disputed, so they're given loosely.
// Colours on the globe use today's countries, which is only an approximation of the lands then.
import { BATTLES_EARLY } from '../data/battles/early';
import { BATTLES_NATIONS } from '../data/battles/nations';
import { BATTLES_MODERN } from '../data/battles/modern';

export type LL = [number, number];
export interface Side {
  name: string;
  who?: string;    // the commanders
  men?: number;    // roughly how many fought, for the strength bars
  lost?: string;
}
/** A march or a fleet's course, drawn on the globe as an arrow. */
export interface Move { f: LL; t: LL; s: 'a' | 'b' }
export interface Battle {
  id: string;
  name: string;
  kind: 'battle' | 'war';
  year: number;      // the year it began: its place in the timeline
  when: string;
  place: string;
  at: LL;
  a: Side;
  b: Side;
  won: 'a' | 'b' | 'draw' | 'open';  // 'open': not over, or still contested
  line: string;      // one line for the list
  story: string;
  why: string[];
  empire?: string;   // a turning point for an empire: which, and how
  lands?: { a: string[]; b: string[] };  // cca3 of today's countries, for the fill
  moves?: Move[];
  alt?: number;      // how far out the camera sits
  toll?: string;     // a war's whole cost
  asOf?: string;     // still unfolding: how recent this account is
  wiki: string;
}

export const BATTLES = [...BATTLES_EARLY, ...BATTLES_NATIONS, ...BATTLES_MODERN].sort((x, y) => x.year - y.year);
export const BY_BATTLE = new Map(BATTLES.map((b) => [b.id, b]));

// The timeline's chapters: one at a time on the globe and in the list. `view` is where the globe rests.
export const BATTLE_ERAS = [
  { to: 1700, short: 'Gunpowder', range: '1500–1700', view: [28, 40] as LL, sub: 'Cannon and muskets make and break the great empires' },
  { to: 1815.5, short: 'Revolution', range: '1700–1815', view: [32, 15] as LL, sub: 'Britain wins India, America breaks free, Napoleon rises and falls' },
  { to: 1914, short: 'Nations', range: '1815–1914', view: [28, 20] as LL, sub: 'New nations, colonial conquest and the industrial way of war' },
  { to: 1945.9, short: 'World wars', range: '1914–1945', view: [40, 25] as LL, sub: 'The turning points inside the two great wars, and those around them' },
  { to: Infinity, short: 'Since 1945', range: '1945–today', view: [25, 55] as LL, sub: 'Decolonisation, the Cold War and the conflicts of today' },
];
export const battleEraOf = (year: number) => BATTLE_ERAS.findIndex((e) => year < e.to);
export const battlesIn = (era: number) => BATTLES.filter((b) => battleEraOf(b.year) === era);
export const SIDE_COLOR = { a: '#60a5fa', b: '#f87171' } as const;

const rad = (d: number) => (d * Math.PI) / 180;
function km([a1, o1]: LL, [a2, o2]: LL) {
  const h = Math.sin(rad(a2 - a1) / 2) ** 2 + Math.cos(rad(a1)) * Math.cos(rad(a2)) * Math.sin(rad(o2 - o1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** How far out to sit to see a battle and its arrows. */
export function battleAltitude(b: Battle) {
  if (b.alt) return b.alt;
  const far = Math.max(0, ...(b.moves ?? []).flatMap((m) => [km(b.at, m.f), km(b.at, m.t)])) / 111;
  return Math.min(2.6, Math.max(b.kind === 'war' ? 1.3 : 0.9, 0.4 + far / 20));
}
/** A count of men, as it reads in a sentence. */
export const fmtMen = (n: number) => (n >= 1e6 ? `≈ ${+(n / 1e6).toFixed(1)} million` : `≈ ${n.toLocaleString('en-US')}`);
