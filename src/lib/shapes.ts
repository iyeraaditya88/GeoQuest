// "Guess the Country": name a country from its outline. Each wrong guess earns a new kind of
// clue — the view pulls back to show its neighbours, then the coast and continent, then nearby
// capitals, then the first letter. Pure logic here; the map is drawn in components/ShapeGame.
import { BY_CCA3, COUNTRIES, MAPPABLE, type Country } from './data';
import { QUIZ_POOL, nextTarget } from './quiz';
import { distKm, fromTo } from './quizCoach';

export const ROUND = 5;
export const TRIES = 5;
/** Points for solving it after `misses` wrong guesses (5 on the first look … 1 on the last); 0 if revealed. */
export const shapePoints = (misses: number, solved: boolean) => (solved ? Math.max(1, TRIES - misses) : 0);

/** How far the view is pulled back, per number of misses (1 = the country fills the frame). */
export const ZOOM = [1, 2.1, 3.4, 3.4, 3.4];

/** Five different countries, none of the last few you've seen (big enough to have a recognisable shape). */
export function newShapeRound(): string[] {
  const pool = QUIZ_POOL.filter((c) => (BY_CCA3.get(c)?.area ?? 0) > 9000);
  const out: string[] = [];
  for (let guard = 0; out.length < ROUND && guard < 40; guard++) {
    const t = nextTarget('shapes', pool);
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

// ── Guesses ──
export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
/** Common short names people type. */
const ALIASES: Record<string, string> = {
  usa: 'USA', us: 'USA', america: 'USA', 'united states of america': 'USA', uk: 'GBR', britain: 'GBR', 'great britain': 'GBR', england: 'GBR',
  uae: 'ARE', emirates: 'ARE', drc: 'COD', 'dr congo': 'COD', 'congo kinshasa': 'COD', 'congo brazzaville': 'COG', 'ivory coast': 'CIV', 'cote d ivoire': 'CIV',
  'south korea': 'KOR', korea: 'KOR', 'north korea': 'PRK', burma: 'MMR', holland: 'NLD', russia: 'RUS', czechia: 'CZE', 'czech republic': 'CZE',
  'east timor': 'TLS', swaziland: 'SWZ', eswatini: 'SWZ', 'cape verde': 'CPV', turkey: 'TUR', turkiye: 'TUR', vatican: 'VAT', laos: 'LAO', vietnam: 'VNM',
};
const GUESSABLE = COUNTRIES.filter((c) => MAPPABLE.has(c.cca3));
const NAMES = GUESSABLE.map((c) => ({ c, n: norm(c.name), o: norm(c.official) }));

/** The country a typed guess means, or null. */
export function matchGuess(text: string): Country | null {
  const t = norm(text);
  if (!t) return null;
  if (ALIASES[t]) return BY_CCA3.get(ALIASES[t]) ?? null;
  return NAMES.find((x) => x.n === t || x.o === t)?.c ?? null;
}
/** Up to `n` countries for what's been typed so far: names starting with it first, then containing it. */
export function suggest(text: string, n = 5): Country[] {
  const t = norm(text);
  if (!t) return [];
  const alias = ALIASES[t] ? BY_CCA3.get(ALIASES[t]) : undefined;
  const starts = NAMES.filter((x) => x.n.startsWith(t) || x.n.split(' ').some((w) => w.startsWith(t)));
  const has = NAMES.filter((x) => !starts.includes(x) && x.n.includes(t));
  const out = [...(alias ? [alias] : []), ...[...starts, ...has].map((x) => x.c)];
  return [...new Map(out.map((c) => [c.cca3, c])).values()].slice(0, n);
}

// ── Clues ──
/** What a wrong guess tells you: where the answer lies from it. */
export function guessClue(targetCca3: string, guessCca3: string) {
  const t = BY_CCA3.get(targetCca3), g = BY_CCA3.get(guessCca3);
  const ft = fromTo(guessCca3, targetCca3);
  if (!t || !g || !ft) return '';
  if (t.borders.includes(g.cca3)) return `Close — it shares a border with ${g.name}, to the ${ft.dir}.`;
  if (ft.km < 400) return `Very close — it’s right next to ${g.name}.`;
  return `It’s ${ft.text} ${ft.dir} of ${g.name}.`;
}

/** Capitals around it (its neighbours', topped up with the nearest others), for the cities clue. */
export function nearbyCapitals(targetCca3: string, n = 5) {
  const t = BY_CCA3.get(targetCca3);
  if (!t) return [];
  const withCap = (c: Country | undefined): c is Country => !!c && !!c.capLatLng && !!c.capital[0] && c.cca3 !== t.cca3;
  const ns = t.borders.map((b) => BY_CCA3.get(b)).filter(withCap).sort((a, b) => b.population - a.population);
  const near = GUESSABLE.filter((c) => withCap(c) && !ns.includes(c) && c.population > 300_000)
    .sort((a, b) => distKm(a.latlng, t.latlng) - distKm(b.latlng, t.latlng));
  return [...ns, ...near].slice(0, n).map((c) => ({ city: c.capital[0], country: c.name, lat: c.capLatLng![0], lng: c.capLatLng![1] }));
}

/** "M _ _ _ _ _ _ _ _ _" — the first letter of each word, the rest as blanks. */
export const lettersHint = (name: string) =>
  name.split(' ').map((w) => [...w].map((ch, i) => (i === 0 ? ch.toUpperCase() : /[a-zA-ZÀ-ɏ]/.test(ch) ? '_' : ch)).join(' ')).join('    ');

/** The clue unlocked after `misses` wrong guesses (shown under the map). */
export function stageClue(targetCca3: string, misses: number) {
  const t = BY_CCA3.get(targetCca3)!;
  const where = t.region === 'Americas' ? (t.subregion === 'South America' ? 'South America' : t.subregion === 'Caribbean' ? 'the Caribbean' : t.subregion === 'Central America' ? 'Central America' : 'North America') : t.region;
  switch (misses) {
    case 0: return 'Which country has this shape?';
    case 1: return 'Zoomed out: its neighbours are outlined.';
    case 2: return `Further out — it’s in ${where}.`;
    case 3: return 'Capitals nearby are marked.';
    default: return `Last try: ${lettersHint(t.name)}`;
  }
}
