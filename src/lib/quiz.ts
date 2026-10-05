// Map quiz targets: which countries can be asked, and GeoGuessr-style clues with the name hidden.
import { BY_CCA3, COUNTRIES, MAPPABLE } from './data';
import { CURATED } from '../data/curated';

export const QUIZ_POOL = COUNTRIES.filter((c) => c.un && MAPPABLE.has(c.cca3) && c.area > 2000).map((c) => c.cca3);
export const CLUE_POOL = Object.keys(CURATED).filter((k) => MAPPABLE.has(k));
export const pickRandom = <T,>(xs: T[], not?: T) => { let x: T; do { x = xs[Math.floor(Math.random() * xs.length)]; } while (xs.length > 1 && x === not); return x; };

/** One of the country's curated tips, with its name and demonym blanked out. */
export function clueFor(target: string) {
  const c = BY_CCA3.get(target)!;
  let clue = pickRandom(CURATED[target].tips.map((t) => t.t));
  for (const w of [c.name, c.demonym].filter(Boolean)) clue = clue.replace(new RegExp(w, 'gi'), '▢▢▢');
  return clue;
}
