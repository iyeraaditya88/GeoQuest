// Capitals quiz: ten questions, each "capital of X?" or "X is the capital of…?".
import { COUNTRIES, MAPPABLE, type Country } from './data';

const ROUND = 10;
export type Level = 'easy' | 'all';

export interface CapitalsQ {
  country: Country;
  kind: 'capital' | 'country'; // ask for the capital, or for the country of a capital
  options: Country[];
}

const shuffle = <T,>(xs: T[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function makeRound(level: Level, n = ROUND): CapitalsQ[] {
  const pool = COUNTRIES.filter((c) => c.independent && MAPPABLE.has(c.cca3) && c.capital[0] && (level === 'all' || c.population >= 8e6));
  return shuffle(pool).slice(0, n).map((country) => {
    // Distractors from the same region make it about knowledge, not elimination.
    const near = shuffle(pool.filter((c) => c !== country && c.region === country.region && c.capital[0] !== country.capital[0]));
    const far = shuffle(pool.filter((c) => c !== country && c.region !== country.region));
    const options = shuffle([country, ...[...near, ...far].slice(0, 3)]);
    return { country, kind: Math.random() < 0.6 ? 'capital' : 'country', options };
  });
}
