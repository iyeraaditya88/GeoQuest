// Map quiz targets: which countries can be asked, and GeoGuessr-style clues with the name hidden.
import { BY_CCA3, COUNTRIES, MAPPABLE } from './data';
import { CURATED } from '../data/curated';

export const QUIZ_POOL = COUNTRIES.filter((c) => c.un && MAPPABLE.has(c.cca3) && c.area > 2000).map((c) => c.cca3);
export const CLUE_POOL = Object.keys(CURATED).filter((k) => MAPPABLE.has(k));
export const pickRandom = <T,>(xs: T[], not?: T) => { let x: T; do { x = xs[Math.floor(Math.random() * xs.length)]; } while (xs.length > 1 && x === not); return x; };

// ── No repeats: a shuffled deck per quiz mode ──
// Every country comes up once before any comes round again; when the deck runs out it's
// reshuffled with the last few played kept to the back, so they don't reappear straight away.
// Remembered between visits (a copy in memory if storage isn't available).
const RECENT = 20;
const memory = new Map<string, string>();
const load = (k: string): string[] => {
  try { const v = localStorage.getItem(k) ?? memory.get(k); return v ? (JSON.parse(v) as string[]) : []; } catch { const v = memory.get(k); return v ? (JSON.parse(v) as string[]) : []; }
};
const store = (k: string, v: string[]) => { const t = JSON.stringify(v); memory.set(k, t); try { localStorage.setItem(k, t); } catch { /* private mode */ } };
const shuffle = <T,>(xs: T[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** The next country to ask in this mode — never one that's come up recently. */
export function nextTarget(mode: string, pool: readonly string[], not?: string): string {
  const deckKey = `gq-deck-${mode}`, recentKey = `gq-recent-${mode}`;
  const inPool = new Set(pool);
  let deck = load(deckKey).filter((c) => inPool.has(c));
  const recent = load(recentKey).filter((c) => inPool.has(c));
  if (!deck.length) {
    const back = new Set(recent);
    const fresh = shuffle(pool.filter((c) => !back.has(c)));
    deck = [...fresh, ...shuffle(pool.filter((c) => back.has(c)))];
  }
  const i = deck[0] === not && deck.length > 1 ? 1 : 0;
  const pick = deck[i];
  deck = [...deck.slice(0, i), ...deck.slice(i + 1)];
  store(deckKey, deck);
  store(recentKey, [...recent.filter((c) => c !== pick), pick].slice(-RECENT));
  return pick;
}

/** One of the country's curated tips (a given one, or random), with its name and demonym blanked out. */
export function clueFor(target: string, seed?: number) {
  const c = BY_CCA3.get(target)!;
  const tips = CURATED[target].tips.map((t) => t.t);
  let clue = seed === undefined ? pickRandom(tips) : tips[seed % tips.length];
  for (const w of [c.name, c.demonym].filter(Boolean)) clue = clue.replace(new RegExp(w, 'gi'), '▢▢▢');
  return clue;
}
