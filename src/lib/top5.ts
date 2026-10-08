// "Name the Top 5" — question bank + forgiving answer matching.
import { COUNTRIES, MAPPABLE, fmtCompact, fmtInt, type Country } from './data';

export interface Top5Answer { name: string; aliases: string[]; detail?: string; cca3?: string }
export interface Top5Question { id: string; title: string; hint?: string; category: 'Countries' | 'Nature' | 'Regions'; answers: Top5Answer[] }

// ── Matching ──────────────────────────────────────────────
export const norm = (s: string) => s
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ')
  .replace(/\b(the|of|republic|federation|river|lake|mount|mt|mountain|ocean|sea|desert|island|islands)\b/g, ' ')
  .replace(/\s+/g, ' ').trim();

function lev(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}
const tolerance = (len: number) => (len <= 4 ? 0 : len <= 7 ? 1 : len <= 12 ? 2 : 3);

/** Index of the answer the guess refers to (typos and nicknames allowed), or -1. */
export function matchAnswer(guess: string, answers: Top5Answer[]): number {
  const g = norm(guess);
  if (!g) return -1;
  let best = -1, bestD = 99;
  answers.forEach((a, i) => {
    for (const alias of [a.name, ...a.aliases]) {
      const n = norm(alias);
      if (!n) continue;
      if (n === g) { best = i; bestD = -1; return; }
      const d = lev(g, n);
      if (d <= tolerance(n.length) && d < bestD) { best = i; bestD = d; }
    }
  });
  return best;
}

// ── Country names & nicknames ─────────────────────────────
const NICK: Record<string, string[]> = {
  USA: ['usa', 'us', 'america', 'united states of america', 'the states'], GBR: ['uk', 'britain', 'great britain', 'england', 'united kingdom'],
  COD: ['drc', 'dr congo', 'congo kinshasa', 'democratic republic of the congo', 'zaire', 'congo'], COG: ['congo brazzaville', 'republic of the congo'],
  CIV: ['ivory coast', 'cote divoire'], MMR: ['burma'], CZE: ['czech republic', 'czechia'], NLD: ['holland', 'the netherlands'],
  KOR: ['south korea', 'korea'], PRK: ['north korea'], RUS: ['russia'], VAT: ['vatican', 'vatican city', 'holy see'], SWZ: ['swaziland', 'eswatini'],
  MKD: ['macedonia'], TUR: ['turkey', 'turkiye'], CPV: ['cape verde'], TLS: ['east timor'], ARE: ['uae', 'emirates'], LAO: ['laos'],
  IRN: ['persia', 'iran'], VNM: ['vietnam', 'viet nam'], FSM: ['micronesia'], BOL: ['bolivia'], VEN: ['venezuela'], TZA: ['tanzania'],
  SYR: ['syria'], MDA: ['moldova'], PSE: ['palestine'], CHN: ['china', 'prc'], TWN: ['taiwan'], DEU: ['germany', 'deutschland'],
  ESP: ['spain', 'espana'], IND: ['india', 'bharat'], BRA: ['brazil', 'brasil'], MEX: ['mexico'], JPN: ['japan', 'nippon'],
  KAZ: ['kazakstan'], KGZ: ['kirgizstan', 'kyrgyzstan'], STP: ['sao tome'], KNA: ['st kitts'], LCA: ['st lucia'], VCT: ['st vincent'],
};
const countryAnswer = (c: Country, detail?: string): Top5Answer => ({
  name: c.name, cca3: c.cca3, detail,
  aliases: [c.official, ...(NICK[c.cca3] ?? []), c.cca3, c.demonym ? c.demonym : ''].filter(Boolean) as string[],
});

// ── Question bank ─────────────────────────────────────────
const indep = COUNTRIES.filter((c) => c.independent && MAPPABLE.has(c.cca3));
const pop = (c: Country) => `${fmtCompact(c.population)} people`;
const area = (c: Country) => `${fmtInt(Math.round(c.area))} km²`;

function top(id: string, title: string, list: Country[], by: (c: Country) => number, desc: boolean, detail: (c: Country) => string, category: Top5Question['category'] = 'Countries', hint?: string): Top5Question {
  const sorted = [...list].sort((a, b) => (desc ? by(b) - by(a) : by(a) - by(b))).slice(0, 5);
  return { id, title, category, hint, answers: sorted.map((c) => countryAnswer(c, detail(c))) };
}
const region = (r: string) => indep.filter((c) => c.region === r);
const sub = (s: string) => indep.filter((c) => c.subregion === s);
const speaks = (l: string) => indep.filter((c) => c.languages.includes(l));

const COMPUTED: Top5Question[] = [
  top('pop-world', 'Most populous countries', indep, (c) => c.population, true, pop),
  top('area-world', 'Largest countries by area', indep, (c) => c.area, true, area),
  top('area-small', 'Smallest countries by area', indep, (c) => c.area, false, area, 'Countries', 'Think microstates'),
  top('pop-least', 'Least populous countries', indep, (c) => c.population, false, pop, 'Countries', 'Tiny states and Pacific islands'),
  top('pop-africa', 'Most populous countries in Africa', region('Africa'), (c) => c.population, true, pop, 'Regions'),
  top('area-africa', 'Largest countries in Africa', region('Africa'), (c) => c.area, true, area, 'Regions'),
  top('pop-europe', 'Most populous countries in Europe', region('Europe'), (c) => c.population, true, pop, 'Regions', 'Russia counts here'),
  top('area-europe', 'Largest countries in Europe', region('Europe'), (c) => c.area, true, area, 'Regions', 'Russia counts here'),
  top('pop-asia', 'Most populous countries in Asia', region('Asia'), (c) => c.population, true, pop, 'Regions'),
  top('area-asia', 'Largest countries in Asia (excluding Russia)', region('Asia'), (c) => c.area, true, area, 'Regions'),
  top('pop-sa', 'Most populous countries in South America', sub('South America'), (c) => c.population, true, pop, 'Regions'),
  top('area-sa', 'Largest countries in South America', sub('South America'), (c) => c.area, true, area, 'Regions'),
  top('pop-oceania', 'Most populous countries in Oceania', region('Oceania'), (c) => c.population, true, pop, 'Regions'),
  top('pop-me', 'Most populous countries in Western Asia & the Middle East', sub('Western Asia'), (c) => c.population, true, pop, 'Regions'),
  top('pop-sea', 'Most populous countries in Southeast Asia', sub('South-Eastern Asia'), (c) => c.population, true, pop, 'Regions'),
  top('landlocked-area', 'Largest landlocked countries', indep.filter((c) => c.landlocked), (c) => c.area, true, area),
  top('landlocked-pop', 'Most populous landlocked countries', indep.filter((c) => c.landlocked), (c) => c.population, true, pop),
  top('left-pop', 'Most populous countries that drive on the LEFT', indep.filter((c) => c.drive === 'left'), (c) => c.population, true, pop, 'Countries', 'GeoGuessr gold'),
  top('spanish', 'Most populous Spanish-speaking countries', speaks('Spanish'), (c) => c.population, true, pop),
  top('arabic', 'Most populous Arabic-speaking countries', speaks('Arabic'), (c) => c.population, true, pop),
  top('french', 'Most populous countries with French as an official language', speaks('French'), (c) => c.population, true, pop),
  top('english', 'Most populous countries with English as an official language', speaks('English'), (c) => c.population, true, pop, 'Countries', 'Official, not just widely spoken'),
  top('dense', 'Most densely populated countries', indep.filter((c) => c.area > 0), (c) => c.population / c.area, true, (c) => `${fmtInt(Math.round(c.population / c.area))} per km²`, 'Countries', 'Mostly tiny places'),
];

const n = (name: string, detail: string, aliases: string[] = []): Top5Answer => ({ name, detail, aliases });

const CURATED: Top5Question[] = [
  { id: 'rivers', title: 'Longest rivers in the world', category: 'Nature', answers: [
    n('Nile', '6,650 km'), n('Amazon', '6,400 km'), n('Yangtze', '6,300 km', ['chang jiang', 'yangtse']),
    n('Mississippi–Missouri', '6,275 km', ['mississippi', 'missouri', 'mississippi missouri']), n('Yenisei', '5,539 km', ['yenisey', 'yenisei angara']) ] },
  { id: 'peaks', title: 'Highest mountains on Earth', category: 'Nature', answers: [
    n('Mount Everest', '8,849 m', ['everest', 'sagarmatha', 'chomolungma']), n('K2', '8,611 m', ['godwin austen', 'chhogori']),
    n('Kangchenjunga', '8,586 m', ['kanchenjunga', 'kangchendzonga']), n('Lhotse', '8,516 m'), n('Makalu', '8,485 m') ] },
  { id: 'lakes', title: 'Largest lakes by area', category: 'Nature', answers: [
    n('Caspian Sea', '371,000 km²', ['caspian']), n('Lake Superior', '82,100 km²', ['superior']), n('Lake Victoria', '68,870 km²', ['victoria']),
    n('Lake Huron', '59,600 km²', ['huron']), n('Lake Michigan', '58,000 km²', ['michigan']) ] },
  { id: 'islands', title: 'Largest islands', category: 'Nature', hint: 'Australia counts as a continent', answers: [
    n('Greenland', '2.17M km²'), n('New Guinea', '786,000 km²', ['papua']), n('Borneo', '743,000 km²', ['kalimantan']),
    n('Madagascar', '587,000 km²'), n('Baffin Island', '507,000 km²', ['baffin']) ] },
  { id: 'oceans', title: 'Oceans, largest first', category: 'Nature', answers: [
    n('Pacific', '165M km²', ['pacific ocean']), n('Atlantic', '106M km²', ['atlantic ocean']), n('Indian', '70M km²', ['indian ocean']),
    n('Southern', '21M km²', ['southern ocean', 'antarctic ocean']), n('Arctic', '15M km²', ['arctic ocean']) ] },
  { id: 'deserts', title: 'Largest deserts (polar ones count)', category: 'Nature', answers: [
    n('Antarctic Desert', '14M km²', ['antarctica', 'antarctic']), n('Arctic Desert', '13.9M km²', ['arctic']), n('Sahara', '9.2M km²'),
    n('Arabian Desert', '2.3M km²', ['arabian', 'rub al khali']), n('Gobi', '1.3M km²', ['gobi desert']) ] },
  { id: 'eu-rivers', title: 'Longest rivers in Europe', category: 'Nature', answers: [
    n('Volga', '3,530 km'), n('Danube', '2,850 km', ['donau', 'duna', 'dunarea']), n('Ural', '2,428 km'),
    n('Dnieper', '2,201 km', ['dnipro', 'dnepr']), n('Don', '1,870 km') ] },
  { id: 'continents-area', title: 'Largest continents by area', category: 'Nature', answers: [
    n('Asia', '44.6M km²'), n('Africa', '30.4M km²'), n('North America', '24.2M km²', ['n america']),
    n('South America', '17.8M km²', ['s america']), n('Antarctica', '14.2M km²') ] },
  { id: 'us-pop', title: 'Most populous US states', category: 'Regions', answers: [
    n('California', '~39M', ['ca', 'cali']), n('Texas', '~31M', ['tx']), n('Florida', '~23M', ['fl']),
    n('New York', '~20M', ['ny']), n('Pennsylvania', '~13M', ['pa']) ] },
  { id: 'us-area', title: 'Largest US states by area', category: 'Regions', answers: [
    n('Alaska', '1.72M km²', ['ak']), n('Texas', '696,000 km²', ['tx']), n('California', '424,000 km²', ['ca']),
    n('Montana', '381,000 km²', ['mt']), n('New Mexico', '315,000 km²', ['nm']) ] },
  { id: 'ca-area', title: 'Largest Canadian provinces & territories', category: 'Regions', answers: [
    n('Nunavut', '2.09M km²'), n('Quebec', '1.54M km²', ['québec']), n('Northwest Territories', '1.35M km²', ['nwt', 'north west territories']),
    n('Ontario', '1.08M km²'), n('British Columbia', '945,000 km²', ['bc']) ] },
  { id: 'in-pop', title: 'Most populous Indian states (2011 census)', category: 'Regions', answers: [
    n('Uttar Pradesh', '200M', ['up']), n('Maharashtra', '112M'), n('Bihar', '104M'),
    n('West Bengal', '91M', ['bengal']), n('Madhya Pradesh', '73M', ['mp']) ] },
];

export const TOP5: Top5Question[] = [...COMPUTED, ...CURATED];

/** Shuffled order, so every session feels fresh. */
export function shuffledQuestions() {
  const qs = [...TOP5];
  for (let i = qs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [qs[i], qs[j]] = [qs[j], qs[i]]; }
  return qs;
}
