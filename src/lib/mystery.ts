// Solve the Mystery: the case engine. A Magpie stole a treasure and is fleeing across the world;
// at each stop, witnesses give clues to the next country — easy at first (a capital, a flag), then
// harder (rivers and peaks, then road signs and neighbours) — until the hideout, where you name the
// culprit from the traits you picked up. Pure and seeded: the Daily case is the same everywhere.
import { BY_CCA3, COUNTRIES, MAPPABLE, type Country } from './data';
import { CURATED } from '../data/curated';
import { QUIZ_POOL } from './quiz';
import { seeded } from './daily';
import { distKm } from './quizCoach';
import { levelOf, type LevelNo } from './mysteryCareer';
export * from './mysteryCareer';
import { ITEMS, SUSPECTS, TRAITS, WITNESS, type Suspect, type TraitKind } from '../data/mysteryCast';

export const LEGS = 5;          // travel decisions at Senior Detective level: S0 → S1 … → S5 (the hideout)
export const COST = { interview: 2, deadEnd: 6, wrongSuspect: 10, options: 3 } as const;
/** Hours to fly between two countries (a short hop is still a few hours). */
export const flightHours = (a: string, b: string) => {
  const x = BY_CCA3.get(a), y = BY_CCA3.get(b);
  return x && y ? Math.round(2 + distKm(x.latlng, y.latlng) / 1500) : 4;
};

export type ClueKind = 'capital' | 'flag' | 'currency' | 'language' | 'river' | 'peak' | 'range' | 'tip' | 'drive' | 'neighbours' | 'coast';
export interface Clue { kind: ClueKind; text: string; flag?: string; why: string }
export interface Trait { kind: TraitKind; value: 0 | 1; text: string }
export interface Witness { role: string; icon: string; clue?: Clue; trait?: Trait }
export interface Leg {
  tier: 1 | 2 | 3 | 4 | 5;
  to: string;                 // where the thief went
  witnesses: Witness[];       // interviewed at the stop before
  options: string[] | null;   // the departures board (null: tap the globe)
  extra: string[];            // tiers 4–5: the options you can buy (same region)
}
export interface Case {
  seed: string;
  level: LevelNo;
  clock: number;
  item: string;
  start: string;              // the crime scene
  route: string[];            // [start, …, hideout]
  legs: Leg[];
  culprit: Suspect;
  lineup: Suspect[];          // the culprit + the three who differ by one trait
}

// ── Picking countries ──
const OK = new Set(QUIZ_POOL);
/** The best-known countries (for the easy first steps): curated, or big and populous. */
const famous = (c: Country) => !!CURATED[c.cca3] || c.population > 25e6;
const POOL = COUNTRIES.filter((c) => OK.has(c.cca3) && MAPPABLE.has(c.cca3) && c.capital[0]);
const ROUTE_POOL = POOL.filter((c) => CURATED[c.cca3]); // every stop has rich clues and a fact to learn

function shuffle<T>(xs: T[], rnd: () => number) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const lastWord = (s: string) => s.trim().split(/\s+/).pop()!.toLowerCase();
const strip = (s: string) => s.replace(/\s*\([^)]*\)/g, '').trim();
const continentOf = (c: Country) => (c.region === 'Americas' ? (c.subregion === 'South America' ? 'South America' : 'North America') : c.region);

// ── Clues: what each kind says, and whether it would also fit another country ──
type Builder = { kind: ClueKind; make: (c: Country) => Clue | null; fits: (clue: Clue, o: Country) => boolean };
const BUILDERS: Record<ClueKind, Builder> = {
  capital: {
    kind: 'capital',
    make: (c) => (c.capital[0] ? { kind: 'capital', text: `They asked me the quickest way to ${c.capital[0]}.`, why: `${c.capital[0]} is the capital of ${c.name}.` } : null),
    fits: (clue, o) => !!o.capital[0] && clue.text.includes(o.capital[0]),
  },
  flag: {
    kind: 'flag',
    make: (c) => ({ kind: 'flag', text: 'Their suitcase had this flag stitched on it:', flag: c.cca2, why: `That’s the flag of ${c.name}.` }),
    fits: (clue, o) => clue.flag === o.cca2,
  },
  currency: {
    kind: 'currency',
    make: (c) => {
      const cur = c.currencies[0];
      if (!cur) return null;
      return { kind: 'currency', text: `They changed all their cash into ${lastWord(cur.name)}${/s$/.test(lastWord(cur.name)) ? '' : 's'}.`, why: `The ${cur.name} is the currency of ${c.name}.` };
    },
    fits: (clue, o) => o.currencies.some((x) => clue.text.includes(` ${lastWord(x.name)}`)),
  },
  language: {
    kind: 'language',
    make: (c) => (c.languages[0] ? { kind: 'language', text: `They were practising ${c.languages[0]} phrases from a little book.`, why: `${c.languages[0]} is spoken in ${c.name}.` } : null),
    fits: (clue, o) => o.languages.some((l) => clue.text.includes(` ${l} `)),
  },
  river: {
    kind: 'river',
    make: (c) => { const r = CURATED[c.cca3]?.river; return r ? { kind: 'river', text: `They wanted a boat trip on the ${strip(r)}.`, why: `The ${strip(r)} is ${c.name}’s longest river.` } : null; },
    fits: (clue, o) => { const r = CURATED[o.cca3]?.river; return !!r && clue.text.includes(strip(r)); },
  },
  peak: {
    kind: 'peak',
    make: (c) => { const p = CURATED[c.cca3]?.peak; return p ? { kind: 'peak', text: `They bought climbing gear — said they’d stand on top of ${strip(p)}.`, why: `${strip(p)} is the highest peak in ${c.name}.` } : null; },
    fits: (clue, o) => { const p = CURATED[o.cca3]?.peak; return !!p && clue.text.includes(strip(p)); },
  },
  range: {
    kind: 'range',
    make: (c) => { const r = CURATED[c.cca3]?.range?.split('·')[0].trim(); return r ? { kind: 'range', text: `They bought hiking maps of the ${r}.`, why: `${c.name} is home to the ${r}.` } : null; },
    fits: (clue, o) => { const r = CURATED[o.cca3]?.range; return !!r && r.split('·').some((x) => clue.text.includes(x.trim())); },
  },
  tip: {
    kind: 'tip',
    make: (c) => {
      // (Not the side of the road — that's its own clue.)
      const t = CURATED[c.cca3]?.tips.find((x) => (x.k === 'script' || x.k === 'sign' || x.k === 'road') && !/drives? on the|left-hand|right-hand/i.test(x.t));
      return t ? { kind: 'tip', text: `They said where they’re going you’ll see this: “${t.t.replace(/\.$/, '')}”.`, why: `That’s a telltale sign of ${c.name}: ${t.t.replace(/\.$/, '').replace(/^./, (ch) => ch.toLowerCase())}.` } : null;
    },
    fits: (clue, o) => !!CURATED[o.cca3]?.tips.some((x) => clue.text.includes(x.t.replace(/\.$/, ''))),
  },
  drive: {
    kind: 'drive',
    make: (c) => ({ kind: 'drive', text: `They grumbled about having to drive on the ${c.drive} again.`, why: `${c.name} drives on the ${c.drive}.` }),
    fits: (clue, o) => clue.text.includes(`on the ${o.drive} `),
  },
  neighbours: {
    kind: 'neighbours',
    make: (c) => {
      const ns = c.borders.map((b) => BY_CCA3.get(b)).filter((n): n is Country => !!n && MAPPABLE.has(n.cca3)).sort((a, b) => b.population - a.population);
      if (ns.length < 2) return null;
      // The fewest neighbours that point to this country alone.
      for (let k = 2; k <= Math.min(4, ns.length); k++) {
        const pick = ns.slice(0, k);
        const others = POOL.filter((o) => o.cca3 !== c.cca3 && pick.every((n) => o.borders.includes(n.cca3)));
        if (!others.length) {
          const names = pick.map((n) => n.name);
          return { kind: 'neighbours', text: `They’re heading to a country that borders ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`, why: `${c.name} borders ${names.join(', ')}.` };
        }
      }
      return null;
    },
    fits: (clue, o) => {
      const named = COUNTRIES.filter((n) => clue.text.includes(n.name));
      return named.length > 0 && named.every((n) => o.borders.includes(n.cca3));
    },
  },
  coast: {
    kind: 'coast',
    make: (c) => (c.landlocked
      ? { kind: 'coast', text: 'They said not to bother packing a swimsuit — there’s no sea where they’re going.', why: `${c.name} is landlocked: it has no coastline.` }
      : { kind: 'coast', text: 'They wanted a hotel with a sea view.', why: `${c.name} has a coastline.` }),
    fits: (clue, o) => (clue.text.includes('no sea') ? o.landlocked : !o.landlocked),
  },
};

/** Which clue kinds each tier may use (easiest first). */
const TIER_KINDS: Record<Leg['tier'], ClueKind[]> = {
  1: ['capital', 'flag'],
  2: ['currency', 'language'],
  3: ['river', 'peak', 'range'],
  4: ['tip', 'neighbours', 'drive'],
  5: ['neighbours', 'tip', 'coast', 'drive'],
};
/** Fallbacks if a country lacks a tier's clues (keeps every leg solvable). */
const FALLBACK: ClueKind[] = ['neighbours', 'currency', 'language', 'capital'];

/** Would this clue give the answer away? Its name, or its stem ("Canadian Rockies", "Mexican pesos"). */
export const namesIt = (text: string, c: Country) => {
  const t = text.toLowerCase();
  const stem = c.name.toLowerCase().slice(0, Math.min(5, c.name.length));
  return t.includes(c.name.toLowerCase()) || t.includes(stem);
};
/** Does this set of clues point to `target` alone among all countries? */
const pinsDown = (clues: Clue[], target: Country) => !POOL.some((o) => o.cca3 !== target.cca3 && clues.every((c) => BUILDERS[c.kind].fits(c, o)));

/**
 * Clues for a leg. Board legs: each clue alone rules out every other option on the board.
 * Globe legs: each clue rules out the nearby countries, and together they point to one country
 * in the whole world. Always at least `want` clues, never naming the country.
 */
function cluesFor(target: Country, tier: Leg['tier'], others: Country[], rnd: () => number, want = 2, not: ClueKind[] = []): Clue[] {
  const all = Object.keys(BUILDERS) as ClueKind[];
  const order = [...shuffle(TIER_KINDS[tier], rnd), ...FALLBACK, ...shuffle(all, rnd)].filter((k, i, xs) => xs.indexOf(k) === i && !not.includes(k));
  const out: Clue[] = [];
  const make = (k: ClueKind) => { const c = BUILDERS[k].make(target); return c && !namesIt(c.text, target) ? c : null; };
  // 1. Clues that rule out every other option.
  for (const k of order) {
    if (out.length >= want) break;
    const c = make(k);
    if (c && !others.some((o) => BUILDERS[k].fits(c, o))) out.push(c);
  }
  // 2. Globe legs: keep adding until the clues point to one country (up to 4).
  if (tier >= 4) for (const k of order) {
    if (pinsDown(out, target) || out.length >= 4) break;
    if (out.some((c) => c.kind === k)) continue;
    const c = make(k);
    if (c) out.push(c);
  }
  // 3. Never fewer than `want`: fall back to any true clue.
  for (const k of order) {
    if (out.length >= want) break;
    if (out.some((c) => c.kind === k)) continue;
    const c = make(k);
    if (c) out.push(c);
  }
  return out;
}

/** Wrong answers for the board: always from the same part of the world (nearer still on hard legs). */
function optionsFor(target: Country, tier: Leg['tier'], rnd: () => number, n: number): Country[] {
  const pool = shuffle(POOL.filter((c) => c.cca3 !== target.cca3), rnd);
  // Decoys from the same part of the world, so a clue takes real knowing ("Warsaw" among Poland,
  // Czechia and Hungary — not among Poland, Peru and Japan). Harder legs go nearer still.
  const sameCont = (c: Country) => continentOf(c) === continentOf(target);
  const sameSub = (c: Country) => c.subregion === target.subregion;
  const tiers: ((c: Country) => boolean)[] = tier <= 2 ? [(c) => sameCont(c) && famous(c), sameCont] : [sameSub, sameCont];
  const picked: Country[] = [];
  for (const pred of [...tiers, () => true]) for (const c of pool) { if (picked.length >= n) break; if (pred(c) && !picked.includes(c)) picked.push(c); }
  return picked;
}

/** Build a whole case from a seed ('mystery-2026-10-18' for the Daily) at a level (rank). */
export function makeCase(seed: string, levelNo: number = 3): Case {
  const level = levelOf(levelNo);
  const rnd = seeded(seed);
  const item = ITEMS[Math.floor(rnd() * ITEMS.length)];
  const culprit = SUSPECTS[Math.floor(rnd() * SUSPECTS.length)];
  // The route: famous places on easy legs, any curated country later; never the same country twice.
  const used = new Set<string>();
  const take = (pred: (c: Country) => boolean) => {
    const c = shuffle(ROUTE_POOL.filter((x) => !used.has(x.cca3) && pred(x)), rnd)[0] ?? shuffle(ROUTE_POOL.filter((x) => !used.has(x.cca3)), rnd)[0];
    used.add(c.cca3);
    return c;
  };
  const stopFor = (tier: Leg['tier']) => (tier === 1 ? (c: Country) => famous(c) && c.population > 20e6 : tier === 2 ? famous : tier === 3 ? () => true : (c: Country) => c.borders.length >= 2);
  const start = take((c) => c.population > 10e6);
  const route = [start, ...level.tiers.map((t) => take(stopFor(t)))];

  // Suspect traits: one per stop at the first three stops (look, hobby, ride — in a shuffled order).
  const traitOrder = shuffle<TraitKind>(['look', 'hobby', 'ride'], rnd);

  const legs: Leg[] = [];
  level.tiers.forEach((tier, k) => {
    const i = k + 1;
    const target = route[i];
    const board = tier <= 3;
    const opts = board ? optionsFor(target, tier, rnd, tier === 1 ? 2 : 3) : optionsFor(target, tier, rnd, 4);
    const clues = cluesFor(target, tier, opts, rnd, board ? 2 : 3);
    const witnesses: Witness[] = clues.map((clue) => ({ ...WITNESS_OF(clue.kind), clue }));
    if (i <= 3) {
      const kind = traitOrder[i - 1];
      const value = culprit[kind];
      witnesses.push({ ...WITNESS_OF(kind), trait: { kind, value, text: traitLine(kind, value) } });
    }
    legs.push({
      tier, to: target.cca3,
      witnesses: shuffle(witnesses, rnd),
      options: board ? shuffle([target, ...opts], rnd).map((c) => c.cca3) : null,
      extra: board ? [] : shuffle([target, ...opts], rnd).map((c) => c.cca3),
    });
  });
  // The line-up: the culprit and look-alikes who differ by exactly one trait (two of them for a Rookie).
  let lineup = shuffle([culprit, ...SUSPECTS.filter((s) => (s.look !== culprit.look ? 1 : 0) + (s.hobby !== culprit.hobby ? 1 : 0) + (s.ride !== culprit.ride ? 1 : 0) === 1)], rnd);
  if (level.lineup === 3) lineup = [culprit, ...lineup.filter((s) => s !== culprit).slice(0, 2)].sort((a, b) => lineup.indexOf(a) - lineup.indexOf(b));
  return { seed, level: level.n, clock: level.clock, item, start: start.cca3, route: route.map((c) => c.cca3), legs, culprit, lineup };
}

const WITNESS_OF = (k: string) => WITNESS[k] ?? { role: 'Witness', icon: '👤' };
export function traitLine(kind: TraitKind, value: 0 | 1) {
  const t = TRAITS[kind][value];
  return kind === 'look' ? `The one you’re after was wearing ${t}.` : kind === 'hobby' ? `They wouldn’t stop talking about ${t}.` : `They left town on ${t}.`;
}
export const traitLabel = (kind: TraitKind, value: 0 | 1) => (kind === 'look' ? `Wears ${TRAITS.look[value]}` : kind === 'hobby' ? `Loves ${TRAITS.hobby[value]}` : `Travels by ${TRAITS.ride[value]}`);

/** The Daily case: the same for everyone at the same rank (Senior Detective keeps the original seed). */
export const dailyCase = (date: string, level: number = 3) => makeCase(level === 3 ? `mystery-${date}` : `mystery-${date}-L${level}`, level);

// ── Results ──
export interface CaseResult { solved: boolean; hoursLeft: number; deadEnds: number; wrongSuspect: boolean }

/** What you learned: one card per country on the trail. */
export function takeaway(c: Case) {
  return c.route.map((id, i) => {
    const k = BY_CCA3.get(id)!;
    const cur = CURATED[id];
    return {
      cca3: id, cca2: k.cca2, name: k.name, capital: k.capital[0] ?? '—',
      currency: k.currencies[0]?.name ?? '—', language: k.languages[0] ?? '—',
      fact: cur?.fact ?? (cur?.river ? `Longest river: ${strip(cur.river)}.` : `Capital: ${k.capital[0]}.`),
      clues: i === 0 ? [] : c.legs[i - 1].witnesses.filter((w) => w.clue).map((w) => w.clue!.why),
      role: i === 0 ? 'Crime scene' : i === c.route.length - 1 ? 'Hideout' : `Stop ${i}`,
    };
  });
}

/**
 * The share line — no spoilers: a square per stop (🟩 straight there, 🟨 one dead end, 🟥 more,
 * ⬛ never reached), then 🔒 caught or 💨 escaped. Never the countries, flags or culprit.
 * "🕵️ GeoQuest Case #12 — solved with 31 h to spare · 1 dead end\n🟩🟨🟩🟩🟩 🔒"
 */
export function caseShare(no: number | null, c: Case, r: CaseResult, wrongPerLeg: number[] = [], reached = c.legs.length) {
  const rank = c.level === 3 ? '' : ` (${levelOf(c.level).name})`;
  const title = no === null ? `🕵️ GeoQuest mystery${rank}` : `🕵️ GeoQuest Case #${no}${rank}`;
  const squares = c.legs.map((_, i) => (i >= reached ? '⬛' : !wrongPerLeg[i] ? '🟩' : wrongPerLeg[i] === 1 ? '🟨' : '🟥')).join('');
  return `${title} — ${r.solved ? `solved with ${r.hoursLeft} h to spare` : 'the thief got away'}${r.deadEnds ? ` · ${r.deadEnds} dead end${r.deadEnds > 1 ? 's' : ''}` : ''}\n${squares} ${r.solved ? '🔒' : '💨'}`;
}

// ── Stats (on this device) ──
export interface MysteryStats { played: number; solved: number; streak: number; best: number; last: string | null }
export const emptyMysteryStats = (): MysteryStats => ({ played: 0, solved: 0, streak: 0, best: 0, last: null });
export function addCase(st: MysteryStats, date: string | null, solved: boolean, yesterday: string | null): MysteryStats {
  if (date && st.last === date) return st;
  const streak = date ? (solved ? (st.last === yesterday ? st.streak + 1 : 1) : 0) : st.streak;
  return { played: st.played + 1, solved: st.solved + (solved ? 1 : 0), streak, best: Math.max(st.best, streak), last: date ?? st.last };
}
