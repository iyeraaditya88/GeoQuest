// Geo Trivia, the big pool: thousands of questions built from the atlas's own data, each asked like
// a puzzle (who borders both, which is further north, the odd one out…) rather than a flash card,
// plus a hand-written set of surprising facts. Everything is built once, the first time it's needed.
import citiesRaw from '../data/cities.json';
import { CAPITAL_TIERS, FLAG_TIERS } from '../data/crosswordWords';
import { COUNTRIES, BY_CCA3, type Country } from './data';

export interface MoreQ { id: number; kind: string; level: number; question: string; options: string[]; answer: string }
type City = [string, number, number, number, number, 0 | 1, string];

// ── Seeded randomness: the same question always has the same options ──
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed: string) {
  let a = hash(seed);
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
type R = () => number;
const pick = <T,>(r: R, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
const sample = <T,>(r: R, xs: readonly T[], n: number) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };

// ── How well known a country is: 1 (everyone) … 5 (a geography buff) ──
const FAMOUS_SMALL = 'SGP MCO VAT JAM ISL LUX MLT CYP QAT ARE NZL IRL';
function fameOf(c: Country) {
  for (const t of [1, 2, 3] as const) if (CAPITAL_TIERS[t].includes(c.cca3) || FLAG_TIERS[t].includes(c.cca3)) return t;
  if (FAMOUS_SMALL.includes(c.cca3)) return 3;
  return c.population >= 30e6 ? 3 : c.population >= 8e6 ? 4 : 5;
}
/** A template's own difficulty, plus how obscure its countries are (a score; levels are shared out by rank). */
const levelFor = (base: number, main: number, ...others: number[]) => {
  const f = others.length ? 0.6 * main + 0.4 * (others.reduce((a, b) => a + b, 0) / others.length) : main;
  return base + Math.max(0, (f - 1.6) * 0.65);
};
/** The euro, as of now (the atlas data predates Bulgaria joining in 2026). */
const EURO_NOW = new Set(['BGR', 'HRV']);
const usesEuro = (c: Country) => EURO_NOW.has(c.cca3) || c.currencies.some((k) => k.name === 'euro');
/** Is `bit` spelt out, letter by letter in order, inside `word`? (“.lt” in Lithuania: yes; “.ch” in Switzerland: no) */
const spelt = (bit: string, word: string) => { let i = 0; for (const ch of word.toLowerCase()) if (ch === bit[i]) i++; return i === bit.length; };

const toRad = (d: number) => (d * Math.PI) / 180;
function km(a: [number, number], b: [number, number]) {
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

let built: MoreQ[] | null = null;
export function moreQuestions(): MoreQ[] { return built ??= build(); }

function build(): MoreQ[] {
  const out: MoreQ[] = [];
  const score = new Map<MoreQ, number>();
  const ids = new Set<number>();
  const seenText = new Set<string>();
  const add = (kind: string, key: string, level: number, question: string, answer: string, wrong: string[]) => {
    const opts = [answer, ...wrong.filter((w) => w !== answer)];
    const sig = `${question}|${[...opts].sort().join('|')}`;
    if (new Set(opts).size !== 4 || seenText.has(sig)) return;
    seenText.add(sig);
    const id = 1_000_000 + (hash(`${kind}|${key}`) % 2_000_000_000);
    if (ids.has(id)) return; // the same puzzle, worded differently
    ids.add(id);
    const q = { id, kind, level: 0, question, options: sample(rng(key), opts, 4), answer };
    score.set(q, level);
    out.push(q);
  };

  const C = COUNTRIES.filter((c) => c.un && c.capital.length && c.capLatLng);
  const fame = new Map(C.map((c) => [c.cca3, fameOf(c)]));
  const F = (c: Country) => fame.get(c.cca3)!;
  const inC = new Set(C.map((c) => c.cca3));
  const nbs = new Map(C.map((c) => [c, c.borders.filter((b) => inC.has(b))]));
  const nb = (c: Country) => nbs.get(c)!;
  const name = (cca3: string) => BY_CCA3.get(cca3)!.name;
  const byRegion = new Map<string, Country[]>();
  for (const c of C) (byRegion.get(c.region) ?? byRegion.set(c.region, []).get(c.region)!).push(c);
  const sameRegion = (c: Country) => byRegion.get(c.region)!.filter((x) => x !== c);
  const cap = (c: Country) => c.capital[0];
  // Capitals that are disputed or easily argued (an answer must be beyond argument).
  const CAP_SKIP = new Set(['ISR', 'LKA', 'GNQ', 'PSE']);
  const capOk = (c: Country) => !CAP_SKIP.has(c.cca3);

  // 1. Who borders both? "I border both X and Y."
  for (const z of C) {
    const ns = nb(z);
    const r = rng(`both:${z.cca3}`);
    let made = 0;
    for (const [x, y] of sample(r, ns.flatMap((a, i) => ns.slice(i + 1).map((b) => [a, b] as const)), 12)) {
      if (made >= 3) break;
      const both = nb(BY_CCA3.get(x)!).filter((c) => nb(BY_CCA3.get(y)!).includes(c));
      if (both.length !== 1) continue;
      const decoys = [...new Set([...nb(BY_CCA3.get(x)!), ...nb(BY_CCA3.get(y)!)])].filter((d) => d !== z.cca3 && d !== x && d !== y).map(name);
      if (decoys.length < 3) continue;
      const q = pick(r, [
        `I share a border with both ${name(x)} and ${name(y)}. Which country am I?`,
        `Which country could you walk into from both ${name(x)} and ${name(y)}?`,
        `${name(x)} and ${name(y)} have one neighbour in common. Which?`,
      ]);
      add('both', `${z.cca3}:${x}:${y}`, levelFor(0, F(z), fame.get(x)!, fame.get(y)!), q, z.name, sample(r, decoys, 3));
      made++;
    }
  }

  // 2. Odd one out: three neighbours and an impostor from next door.
  for (const z of C) {
    const ns = nb(z);
    if (ns.length < 3) continue;
    for (let v = 0; v < Math.min(3, Math.floor(ns.length / 3)); v++) {
      const r = rng(`odd:${z.cca3}:${v}`);
      const three = sample(r, ns, 3);
      const near = [...new Set(ns.flatMap((n) => nb(BY_CCA3.get(n)!)))].filter((x) => x !== z.cca3 && !ns.includes(x));
      const pool = near.length ? near : sameRegion(z).map((c) => c.cca3).filter((x) => !ns.includes(x));
      if (!pool.length) continue;
      const odd = pick(r, pool);
      const q = pick(r, [
        `Three of these share a border with ${z.name}. Which one doesn't?`,
        `Spot the impostor: which of these is NOT a neighbour of ${z.name}?`,
        `Driving out of ${z.name}, which of these could you NOT reach without crossing another country?`,
      ]);
      add('odd', `${z.cca3}:${three.join()}:${odd}`, levelFor(0, F(z), fame.get(odd)!), q, name(odd), three.map(name));
    }
  }

  // 3. Just one neighbour.
  for (const z of C.filter((c) => nb(c).length === 1)) {
    const r = rng(`one:${z.cca3}`);
    const crowded = sameRegion(z).filter((c) => nb(c).length >= 3);
    if (crowded.length < 3) continue;
    add('one', z.cca3, levelFor(1, F(z)), pick(r, ['Which of these countries has only one land neighbour?', 'Only one of these countries borders exactly one other country. Which?']), z.name, sample(r, crowded, 3).map((c) => c.name));
  }

  // 4. Most neighbours.
  for (const z of C.filter((c) => nb(c).length >= 4)) {
    const r = rng(`most:${z.cca3}`);
    const fewer = sameRegion(z).filter((c) => nb(c).length > 0 && nb(c).length <= nb(z).length - 2);
    if (fewer.length < 3) continue;
    const others = sample(r, fewer, 3);
    add('most', z.cca3, levelFor(0.5, F(z), ...others.map(F)), pick(r, ['Which of these countries has the most land neighbours?', 'Which of these borders the most countries?']), z.name, others.map((c) => c.name));
  }

  // 5. Capitals by latitude: further north, further south, nearest the equator.
  const knownCaps = C.filter((c) => F(c) <= 4 && capOk(c));
  for (let i = 0; i < 1300; i++) {
    const r = rng(`lat:${i}`);
    const four = sample(r, knownCaps, 4);
    const mode = pick(r, ['north', 'south', 'equator'] as const);
    const val = (c: Country) => (mode === 'north' ? c.capLatLng![0] : mode === 'south' ? -c.capLatLng![0] : -Math.abs(c.capLatLng![0]));
    const sorted = [...four].sort((a, b) => val(b) - val(a));
    if (val(sorted[0]) - val(sorted[1]) < 1.5) continue;
    const q = mode === 'north' ? pick(r, ['Which of these capitals lies furthest north?', 'Heading north: which of these capitals is closest to the North Pole?'])
      : mode === 'south' ? pick(r, ['Which of these capitals lies furthest south?', 'Which of these capitals is closest to the South Pole?'])
        : pick(r, ['Which of these capitals is closest to the equator?', 'Which of these capitals lies nearest the equator?']);
    add('lat', `${mode}:${four.map((c) => c.cca3).sort().join()}`, levelFor(0.5, F(sorted[0]), ...four.map(F)), q, cap(sorted[0]), sorted.slice(1).map(cap));
  }

  // 6. The shortest hop: which capital is nearest?
  for (const z of C.filter((c) => F(c) <= 4 && capOk(c))) {
    const others = sameRegion(z).filter((c) => F(c) <= 4 && capOk(c));
    for (let v = 0; v < 3; v++) {
      const r = rng(`hop:${z.cca3}:${v}`);
      const four = sample(r, others, 4);
      if (four.length < 4) continue;
      const d = (c: Country) => km(z.capLatLng!, c.capLatLng!);
      const sorted = [...four].sort((a, b) => d(a) - d(b));
      if (d(sorted[1]) < d(sorted[0]) * 1.12) continue;
      const q = pick(r, [`Flying from ${cap(z)}, which of these capitals is the shortest hop?`, `Which of these capitals is closest to ${cap(z)} as the crow flies?`]);
      add('hop', `${z.cca3}:${four.map((c) => c.cca3).sort().join()}`, levelFor(0.5, F(z), ...four.map(F)), q, cap(sorted[0]), sorted.slice(1).map(cap));
    }
  }

  // 7. Southern Hemisphere capitals close to the equator (Quito, Nairobi…).
  const tropical = C.filter((c) => Math.abs(c.capLatLng![0]) < 16 && capOk(c));
  for (const z of tropical.filter((c) => c.capLatLng![0] < 0)) {
    const north = tropical.filter((c) => c.capLatLng![0] > 0);
    for (let v = 0; v < 2; v++) {
      const r = rng(`hemi:${z.cca3}:${v}`);
      add('hemi', `${z.cca3}:${v}`, levelFor(1.5, F(z)), pick(r, ['Which of these capitals is in the Southern Hemisphere?', 'Only one of these capitals is south of the equator. Which?']), cap(z), sample(r, north, 3).map(cap));
    }
  }

  // 8. Which is bigger / which has more people (close calls only).
  for (const [kind, val, qs] of [
    ['area', (c: Country) => c.area, ['Which of these countries is the largest by area?', 'Which of these covers the most land?']],
    ['pop', (c: Country) => c.population, ['Which of these countries has the most people?', 'Which of these is home to the most people?']],
  ] as const) {
    const sorted = [...C].filter((c) => F(c) <= 4).sort((a, b) => val(a) - val(b));
    for (let i = 0; i + 4 < sorted.length; i++) {
      for (let v = 0; v < 2; v++) {
        const r = rng(`${kind}:${i}:${v}`);
        const window = sorted.slice(i, i + 8);
        const four = sample(r, window, 4).sort((a, b) => val(b) - val(a));
        if (val(four[0]) < val(four[1]) * (kind === 'pop' ? 1.2 : 1.15)) continue; // (clear winners only: figures drift)
        add(kind, four.map((c) => c.cca3).sort().join(), levelFor(0.5, F(four[0]), ...four.map(F)), pick(r, qs), four[0].name, four.slice(1).map((c) => c.name));
      }
    }
  }

  // 9. Keep left!
  for (const z of C.filter((c) => c.drive === 'left')) {
    const right = sameRegion(z).filter((c) => c.drive === 'right');
    if (right.length < 3) continue;
    for (let v = 0; v < 2; v++) {
      const r = rng(`left:${z.cca3}:${v}`);
      add('left', `${z.cca3}:${v}`, levelFor(0, F(z)), pick(r, ['In which of these countries do cars drive on the left?', 'Hiring a car: in which of these would you keep to the left?']), z.name, sample(r, right, 3).map((c) => c.name));
    }
  }

  // 10. No coastline.
  for (const z of C.filter((c) => c.landlocked)) {
    const coast = [...nb(z).map((b) => BY_CCA3.get(b)!), ...sameRegion(z)].filter((c) => !c.landlocked);
    for (let v = 0; v < 2; v++) {
      const r = rng(`land:${z.cca3}:${v}`);
      const wrong = [...new Set(sample(r, coast, 6).map((c) => c.name))].slice(0, 3);
      add('land', `${z.cca3}:${v}`, levelFor(0, F(z)), pick(r, ['Which of these countries has no coastline at all?', 'You can’t go to the beach at home in one of these countries. Which?', 'Which of these countries is landlocked?']), z.name, wrong);
    }
  }

  // 11. Money: a currency only one country uses.
  const curCount = new Map<string, number>();
  for (const c of C) for (const k of c.currencies) curCount.set(k.name, (curCount.get(k.name) ?? 0) + 1);
  for (const z of C) {
    if (EURO_NOW.has(z.cca3)) continue;
    const stem = (w: string) => w.toLowerCase().slice(0, 5);
    const k = z.currencies.find((x) => curCount.get(x.name) === 1 && !x.name.toLowerCase().includes(stem(z.name)) && !x.name.toLowerCase().includes(stem(z.demonym.split(',')[0] || '-----')));
    if (!k) continue;
    const r = rng(`cur:${z.cca3}`);
    const money = k.name.replace(/^./, (m) => m.toUpperCase());
    add('cur', z.cca3, levelFor(0.7, F(z)), pick(r, [`Your wallet is full of the ${money}. Where are you?`, `The ${money} is the money of which country?`]), z.name, sample(r, sameRegion(z), 3).map((c) => c.name));
  }
  // Which pays in pesos, dinars, francs…? (one of the four does)
  const coinOf = new Map(C.map((c) => [c, new Set(c.currencies.map((k) => k.name.toLowerCase().split(' ').pop()!.replace(/^krone$/, 'krona')))]));
  const coin = (c: Country) => coinOf.get(c)!;
  const coins = new Map<string, Country[]>();
  for (const c of C) for (const w of coin(c)) (coins.get(w) ?? coins.set(w, []).get(w)!).push(c);
  const PLURAL = new Set(['peso', 'dinar', 'dollar', 'franc', 'rupee', 'pound', 'shilling', 'rial', 'riyal', 'dirham', 'lira']);
  for (const [w, users] of coins) {
    if (users.length < 2 || w === 'euro') continue;
    for (const z of users.filter((c) => !EURO_NOW.has(c.cca3))) {
      const others = C.filter((c) => !coin(c).has(w) && c.region === z.region);
      if (others.length < 3) continue;
      for (let v = 0; v < 2; v++) {
        const r = rng(`coin:${w}:${z.cca3}:${v}`);
        const wrong = sample(r, others, 3);
        add('coin', `${w}:${z.cca3}:${wrong.map((c) => c.cca3).sort().join()}`, levelFor(0.4, F(z), ...wrong.map(F)), PLURAL.has(w) ? pick(r, [`Which of these countries pays in ${w}s?`, `Only one of these countries uses a currency called the ${w}. Which?`]) : `Only one of these countries uses a currency called the ${w}. Which?`, z.name, wrong.map((c) => c.name));
      }
    }
  }

  // The euro, outside the EU and in.
  const euro = C.filter(usesEuro);
  const notEuroEU = C.filter((c) => c.region === 'Europe' && !usesEuro(c));
  for (const z of notEuroEU) {
    const r = rng(`euro:${z.cca3}`);
    add('euro', z.cca3, levelFor(0.3, F(z)), pick(r, ['Which of these European countries does NOT use the euro?', 'Three of these pay in euros. Which one doesn’t?']), z.name, sample(r, euro, 3).map((c) => c.name));
  }

  // 12. Web addresses that don't spell the country.
  for (const z of C) {
    const tld = z.tld[0];
    if (!tld || spelt(tld.slice(1).toLowerCase(), z.name)) continue;
    const r = rng(`tld:${z.cca3}`);
    add('tld', z.cca3, levelFor(0.5, F(z)), pick(r, [`Websites ending in “${tld}” come from which country?`, `Which country’s web addresses end in “${tld}”?`]), z.name, sample(r, sameRegion(z), 3).map((c) => c.name));
  }

  // 13. What do you call someone from…? (only the ones that don't follow the name)
  for (const z of C) {
    const dem = z.demonym.split(',')[0].trim();
    const shared = [...dem.toLowerCase()].findIndex((ch, i) => ch !== z.name.toLowerCase()[i]);
    // Out: the obvious (Peruvian, Greek). In: the surprising (Monegasque, Malagasy, Filipino).
    if (!dem || spelt(dem.slice(0, 5).toLowerCase(), z.name) || shared >= 4 || (shared >= 3 && dem.length <= z.name.length + 2) || dem.toLowerCase().startsWith(z.name.slice(0, -1).toLowerCase())) continue;
    const r = rng(`dem:${z.cca3}`);
    add('dem', z.cca3, levelFor(0.5, F(z)), pick(r, [`Someone described as “${dem}” comes from which country?`, `You’ve just met ${/^[AEIOU]/.test(dem) ? 'an' : 'a'} ${dem} traveller. Where are they from?`]), z.name, sample(r, sameRegion(z), 3).map((c) => c.name));
  }

  // 15a. Which part of the world? Three from one region and a near miss.
  const bySub = new Map<string, Country[]>();
  for (const c of C) if (c.subregion) (bySub.get(c.subregion) ?? bySub.set(c.subregion, []).get(c.subregion)!).push(c);
  for (const [sub, members] of bySub) {
    if (members.length < 4) continue;
    const nearby = C.filter((c) => c.subregion !== sub && (c.region === members[0].region || members.some((m) => nb(m).includes(c.cca3))));
    for (let v = 0; v < Math.min(20, members.length * 2); v++) {
      const r = rng(`sub:${sub}:${v}`);
      const three = sample(r, members, 3);
      const odd = pick(r, nearby);
      if (!odd) continue;
      add('sub', `${sub}:${three.map((c) => c.cca3).sort().join()}:${odd.cca3}`, levelFor(0, F(odd), ...three.map(F)), pick(r, [`Three of these are in ${sub}. Which one isn’t?`, `Which of these countries is NOT part of ${sub}?`]), odd.name, three.map((c) => c.name));
    }
  }

  // ── Cities ──
  const FIX: Record<string, string> = { Shenyeng: 'Shenyang' };
  const cities = (citiesRaw as City[]).filter((c) => inC.has(c[6])).map((c) => { const n = c[0].replace(/\s+/g, ' '); return (FIX[n] || n !== c[0] ? [FIX[n] ?? n, ...c.slice(1)] : c) as City; });
  const cityName = (c: City) => c[0];
  const capCity = new Map(cities.filter((c) => c[5] === 1).map((c) => [c[6], c]));
  const bigByCountry = new Map<string, City[]>();
  for (const c of cities) (bigByCountry.get(c[6]) ?? bigByCountry.set(c[6], []).get(c[6])!).push(c);
  for (const l of bigByCountry.values()) l.sort((a, b) => b[3] - a[3]);
  const nameCount = new Map<string, number>();
  for (const c of cities) nameCount.set(c[0], (nameCount.get(c[0]) ?? 0) + 1);
  const uniqueCity = (c: City) => nameCount.get(c[0]) === 1;

  // 15. Not the capital: famous big cities among capitals.
  const NOT_A_CASE = new Set(['Delhi', 'Amaravati', 'George Town', 'Benoni', 'Giza', 'Zibo']); // (part of a capital, or a capital of something else)
  const bigNonCap = cities.filter((c) => c[5] === 0 && c[3] >= 4e6 && uniqueCity(c) && !NOT_A_CASE.has(c[0]) && (fame.get(c[6]) ?? 5) <= 3);
  const famousCaps = C.filter((c) => F(c) <= 3 && capOk(c)).map(cap);
  for (const z of bigNonCap) {
    for (let v = 0; v < 2; v++) {
      const r = rng(`notcap:${z[0]}:${v}`);
      add('notcap', `${z[0]}:${v}`, levelFor(0.5, fame.get(z[6])!), pick(r, ['Three of these are capital cities. Which one isn’t?', 'Which of these big cities is NOT a national capital?']), cityName(z), sample(r, famousCaps, 3));
    }
  }

  // 16. The biggest city isn't the capital.
  for (const z of C) {
    const list = bigByCountry.get(z.cca3);
    const capC = capCity.get(z.cca3);
    if (['IND', 'MYS'].includes(z.cca3) || !list || !capC || list.length < 4 || list[0][5] === 1 || list[0][3] < capC[3] * 1.3) continue; // (India, Malaysia: city limits make it arguable)
    const wrong = list.slice(1).filter((c) => c[5] === 0 && c[3] >= 300_000).slice(0, 3).map(cityName);
    add('biggest', z.cca3, levelFor(0.5, F(z)), `${z.name}’s capital is ${cap(z)}, but which is its biggest city?`, cityName(list[0]), wrong);
  }

  // 17. Border towns: which city is across the line?
  for (const z of C.filter((c) => F(c) <= 4)) {
    const own = (bigByCountry.get(z.cca3) ?? []).filter(uniqueCity).slice(0, 7);
    if (own.length < 3) continue;
    const ns = nb(z);
    if (!ns.length) continue;
    for (let v = 0; v < 2; v++) {
      const r = rng(`city:${z.cca3}:${v}`);
      const n = pick(r, ns);
      const theirs = (bigByCountry.get(n) ?? []).filter(uniqueCity).slice(0, 6);
      if (!theirs.length) continue;
      // The impostor: the neighbour's city nearest to this country's cities.
      const three = sample(r, own, 3);
      const odd = [...theirs].sort((a, b) => Math.min(...three.map((t) => km([a[1], a[2]], [t[1], t[2]]))) - Math.min(...three.map((t) => km([b[1], b[2]], [t[1], t[2]]))))[0];
      add('city', `${z.cca3}:${three.map(cityName).sort().join()}:${odd[0]}`, levelFor(0.3, F(z), fame.get(n)!), pick(r, [`Three of these cities are in ${z.name}. Which one isn’t?`, `Which of these cities would need a trip abroad from ${z.name}?`]), cityName(odd), three.map(cityName));
    }
  }

  // 18. Dig straight through the Earth.
  const bigCities = cities.filter((c) => c[3] >= 600_000 && uniqueCity(c));
  const byLat = [...bigCities].sort((a, b) => a[1] - b[1]);
  for (const a of bigCities) {
    const anti: [number, number] = [-a[1], a[2] > 0 ? a[2] - 180 : a[2] + 180];
    let best: City | null = null, bd = Infinity;
    // Only cities within ~6° of latitude can be within 600 km.
    let lo = 0, hi = byLat.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (byLat[m][1] < anti[0] - 6) lo = m + 1; else hi = m; }
    for (let i = lo; i < byLat.length && byLat[i][1] <= anti[0] + 6; i++) { const b = byLat[i]; const d = km(anti, [b[1], b[2]]); if (d < bd) { bd = d; best = b; } }
    if (!best || bd > 600) continue;
    const r = rng(`anti:${a[0]}`);
    if (best[3] < 1.2e6 && (fame.get(best[6]) ?? 5) > 3) continue;
    const far = sample(r, bigCities.filter((c) => km(anti, [c[1], c[2]]) > 4000 && c[3] >= 1e6), 3).map(cityName);
    add('anti', a[0], levelFor(2, fame.get(a[6]) ?? 5, fame.get(best[6]) ?? 5), `Dig straight down through the Earth from ${a[0]} (${name(a[6])}). Which city would you pop up nearest to?`, cityName(best), far);
  }

  // 19. Languages abroad: Portuguese in Mozambique, French in Haiti…
  const langs = new Map<string, Country[]>();
  for (const c of C) for (const l of c.languages) (langs.get(l) ?? langs.set(l, []).get(l)!).push(c);
  for (const [lang, users] of langs) {
    if (users.length < 2 || users.length > 40) continue;
    for (const z of users) {
      if (lang.slice(0, 4).toLowerCase() === z.name.slice(0, 4).toLowerCase() || lang.slice(0, 4).toLowerCase() === z.demonym.slice(0, 4).toLowerCase()) continue;
      const without = sameRegion(z).filter((c) => !c.languages.includes(lang));
      if (without.length < 3) continue;
      const r = rng(`lang:${lang}:${z.cca3}`);
      add('lang', `${lang}:${z.cca3}`, levelFor(0.3, F(z)), pick(r, [`${lang} is an official language in which of these countries?`, `Where in this list would you hear ${lang} spoken officially?`]), z.name, sample(r, without, 3).map((c) => c.name));
    }
  }

  // Easy, Medium, Hard, Impossible: a quarter each, by score (ties broken by a fixed shuffle).
  const ranked = [...out].sort((a, b) => score.get(a)! - score.get(b)! || a.id - b.id);
  ranked.forEach((q, i) => { q.level = Math.min(3, Math.floor((i * 4) / ranked.length)); });

  // ── Hand-written: the surprising ones (their levels are set by hand) ──
  for (const line of FACTS) {
    const [q, a, w1, w2, w3, l] = line.split('|');
    add('fact', q, 0, q, a, [w1, w2, w3]);
    const made = out[out.length - 1];
    if (made?.question === q) made.level = Number(l);
  }
  return out;
}

/** question|answer|wrong|wrong|wrong|level (0 Easy … 3 Impossible). */
const FACTS = [
  'France shares its longest land border with which country?|Brazil|Spain|Belgium|Germany|2',
  'Counting its overseas territories, which country has the most time zones?|France|Russia|United States|China|2',
  'Which country is home to the most pyramids?|Sudan|Egypt|Mexico|Peru|1',
  'Which is the only country whose flag isn’t a rectangle or square?|Nepal|Switzerland|Bhutan|Qatar|1',
  'Which is the highest seat of government of any country?|La Paz|Quito|Bogotá|Kathmandu|1',
  'Which of these countries has no permanent rivers?|Saudi Arabia|Egypt|Iraq|Pakistan|1',
  'At their closest, Russia and the USA are about how far apart?|About 4 km|About 40 km|About 85 km|About 400 km|2',
  'Which African country was never colonised, apart from a brief Italian occupation?|Ethiopia|Kenya|Ghana|Nigeria|1',
  'San Marino is completely surrounded by which country?|Italy|France|Switzerland|Austria|0',
  'Which country has the longest coastline in the world?|Canada|Russia|Australia|Indonesia|1',
  'Which is the world’s largest island that isn’t a continent?|Greenland|New Guinea|Borneo|Madagascar|0',
  'Which country is said to have the most islands of any in the world?|Sweden|Indonesia|Philippines|Japan|2',
  'Which US state is closest to Africa?|Maine|Florida|New York|Massachusetts|2',
  'Which of these cities lies furthest west?|Reno|Los Angeles|Las Vegas|Phoenix|2',
  'Which of these capitals is further north than Moscow?|Riga|Copenhagen|Berlin|Dublin|2',
  'Which US city sits at almost exactly the same latitude as Rome?|Chicago|Miami|Houston|Los Angeles|2',
  'London is further north than which of these cities?|Calgary|Edmonton|Moscow|Copenhagen|2',
  'Which country has the most active volcanoes?|Indonesia|Japan|Iceland|Italy|1',
  'Sailing through the Panama Canal from the Atlantic to the Pacific, which way do you mostly head?|South-east|West|North-west|South-west|3',
  'The world’s highest waterfall, Angel Falls, is in which country?|Venezuela|Brazil|Norway|Zimbabwe|1',
  'The northernmost permanently inhabited place on Earth, Alert, is in which country?|Canada|Norway|Russia|Denmark|3',
  'The summit of Mount Everest sits on the border of Nepal and which country?|China|India|Bhutan|Pakistan|0',
  'The Atacama, one of the driest places on Earth, is mostly in which country?|Chile|Peru|Argentina|Bolivia|1',
  'Which country’s largest city is split between Europe and Asia by a strait?|Turkey|Russia|Egypt|Georgia|0',
  'Which is the saltiest of these oceans?|Atlantic Ocean|Pacific Ocean|Indian Ocean|Arctic Ocean|2',
  'Which river flows through the most countries?|Danube|Rhine|Amazon|Mekong|2',
  'Lake Titicaca is shared by Peru and which country?|Bolivia|Chile|Ecuador|Argentina|0',
  'In which country is there a city called Batman?|Turkey|United States|Australia|Iran|2',
  'The village of Dull is twinned with Boring, Oregon. Which country is Dull in?|United Kingdom|Ireland|Canada|New Zealand|3',
  'The unicorn is the national animal of which part of the UK?|Scotland|Wales|England|Northern Ireland|1',
  'Which capital city lies closest to the equator?|Quito|Nairobi|Kampala|Bogotá|1',
  'Which country’s name comes from the Latin for “southern”?|Australia|Austria|Argentina|Ecuador|1',
  'Argentina takes its name from the Latin word for which metal?|Silver|Gold|Copper|Tin|1',
  'Which South American country is named after the equator?|Ecuador|Colombia|Venezuela|Bolivia|0',
  'Venezuela’s name means “little…” what?|Venice|Spain|Madrid|Lisbon|2',
  'Which country is named after Christopher Columbus?|Colombia|Costa Rica|Cuba|El Salvador|1',
  'Bolivia is named after which person?|Simón Bolívar|José de San Martín|Francisco Pizarro|Christopher Columbus|1',
  'Which Mediterranean country’s flag shows a map of the island?|Cyprus|Malta|Greece|Lebanon|1',
  'Which country has a dragon on its flag?|Bhutan|China|Vietnam|Japan|1',
  'Which country’s flag features a rifle?|Mozambique|Angola|Kenya|Zimbabwe|2',
  'Which is the only country with a Bible on its flag?|Dominican Republic|Vatican City|Malta|Portugal|2',
  'The Gobi desert covers much of Mongolia and which other country?|China|Kazakhstan|Russia|India|0',
  'The Kalahari desert covers most of which country?|Botswana|Kenya|Morocco|Egypt|1',
  'Timbuktu, a byword for the middle of nowhere, is in which country?|Mali|Niger|Morocco|Chad|1',
  'You can visit a village called Hell in which country?|Norway|Iceland|Denmark|Finland|2',
  'Which South American country drives on the left?|Guyana|Venezuela|Brazil|Colombia|1',
  'Besides the UK and Ireland, which European country drives on the left?|Malta|Portugal|Greece|Iceland|1',
  'Which country has the oldest national flag still in use?|Denmark|Scotland|Netherlands|Austria|1',
  'Which country gave the Statue of Liberty to the USA?|France|United Kingdom|Italy|Spain|0',
  'Angkor Wat, the largest religious monument on Earth, is in which country?|Cambodia|Thailand|Laos|Vietnam|0',
  'Which is the northernmost capital of a sovereign country?|Reykjavík|Oslo|Helsinki|Stockholm|1',
  'Which is the southernmost capital of a sovereign country?|Wellington|Canberra|Buenos Aires|Montevideo|1',
  'Easter Island, home of the moai statues, belongs to which country?|Chile|Peru|Ecuador|New Zealand|1',
  'The Galápagos Islands belong to which country?|Ecuador|Chile|Peru|Colombia|0',
  'Greenland is part of which kingdom?|Denmark|Norway|Iceland|Canada|0',
  'The Canary Islands belong to which country?|Spain|Portugal|Morocco|Italy|0',
  'The Azores, in the middle of the Atlantic, belong to which country?|Portugal|Spain|Brazil|France|1',
  'Since 2022, thanks to a tiny island, Canada has had a land border with which country?|Denmark|Norway|France|Iceland|3',
  'France and the Netherlands share a land border on which Caribbean island?|Saint Martin|Aruba|Curaçao|Martinique|3',
  'Spain has a land border with which African country?|Morocco|Algeria|Tunisia|Libya|2',
  'The world’s deepest lake is in which country?|Russia|Canada|Tanzania|United States|1',
  'Lake Victoria is shared by Uganda, Kenya and which other country?|Tanzania|Rwanda|Ethiopia|Malawi|1',
  'Machu Picchu is in which country?|Peru|Bolivia|Ecuador|Mexico|0',
  'Mount Kilimanjaro is in which country?|Tanzania|Kenya|Uganda|Ethiopia|0',
  'Victoria Falls lies on the border of Zambia and which country?|Zimbabwe|Botswana|Malawi|Mozambique|1',
  'Iguazu Falls lies on the border of Argentina and which country?|Brazil|Paraguay|Uruguay|Chile|1',
  'The Strait of Gibraltar separates Spain from which country?|Morocco|Algeria|Portugal|Tunisia|0',
  'Which sea has no coastline at all?|Sargasso Sea|Caspian Sea|Dead Sea|Red Sea|2',
  'Dig straight through the Earth from Spain and which country do you reach?|New Zealand|Australia|Argentina|Chile|1',
  'Which US state has the longest coastline?|Alaska|Florida|California|Hawaii|1',
  'Mount Ararat, where Noah’s Ark is said to have landed, is in which country?|Turkey|Armenia|Iran|Georgia|2',
  'Which country’s national symbol, Mount Ararat, lies outside its own borders?|Armenia|Turkey|Georgia|Azerbaijan|3',
  'Which South American country uses the US dollar as its own currency?|Ecuador|Peru|Colombia|Chile|1',
  'Which of these countries outside the EU uses the euro?|Montenegro|Switzerland|Norway|Serbia|2',
  'Which capital city is spread across 14 islands?|Stockholm|Copenhagen|Amsterdam|Helsinki|2',
  'Venice sits in a lagoon of which sea?|Adriatic Sea|Aegean Sea|Tyrrhenian Sea|Ionian Sea|1',
  'Which country is called “the Land of a Thousand Lakes”?|Finland|Canada|Sweden|Norway|0',
  'Which country is called “the Land of Fire and Ice”?|Iceland|Norway|Chile|New Zealand|0',
  'Which country is called “the Land of the Thunder Dragon”?|Bhutan|Nepal|China|Mongolia|1',
  'Which country calls itself “the Rainbow Nation”?|South Africa|Brazil|Jamaica|Ireland|0',
  'Which country did Winston Churchill call “the Pearl of Africa”?|Uganda|Kenya|Madagascar|Ghana|2',
  'Which country is “the Land of the Long White Cloud”?|New Zealand|Iceland|Ireland|Scotland|1',
  'Which country is known as “the Land of Smiles”?|Thailand|Philippines|Brazil|Fiji|1',
  'Which of these countries is known as “the Land of the Midnight Sun”?|Norway|Japan|Chile|Spain|1',
  'Which country moved its capital to a brand-new city in 1960?|Brazil|Australia|Nigeria|Argentina|1',
  'Which purpose-built city replaced Lagos as Nigeria’s capital?|Abuja|Kano|Ibadan|Port Harcourt|1',
  'Which city was Japan’s capital for over a thousand years before Tokyo?|Kyoto|Osaka|Hiroshima|Sapporo|1',
  'Which city was the capital of West Germany?|Bonn|Frankfurt|Munich|Hamburg|1',
  'In 2005, Myanmar moved its capital to which new city?|Naypyidaw|Yangon|Mandalay|Bagan|2',
  'Which is the world’s largest landlocked country?|Kazakhstan|Mongolia|Chad|Niger|1',
  'Which country is “doubly landlocked”, surrounded only by other landlocked countries?|Uzbekistan|Kazakhstan|Afghanistan|Turkmenistan|3',
  'Bolivia lost its coastline in a war with which country?|Chile|Peru|Argentina|Brazil|1',
  'Which is the largest country in Africa by area?|Algeria|DR Congo|Libya|Sudan|1',
  'Which is the smallest country on mainland Africa?|Gambia|Eswatini|Djibouti|Rwanda|2',
  'Which country has the world’s largest Muslim population?|Indonesia|Pakistan|India|Saudi Arabia|1',
  'Which country has the most Spanish speakers?|Mexico|Spain|Colombia|Argentina|1',
  'Which country has the largest population of Japanese descent outside Japan?|Brazil|United States|Peru|Canada|2',
  'Which country is crossed by both the equator and the Tropic of Capricorn?|Brazil|Ecuador|Kenya|Indonesia|3',
  'Which continent is crossed by the equator and both tropics?|Africa|Asia|South America|Oceania|2',
  'Which country gets the most international tourists?|France|Spain|United States|Italy|1',
];
