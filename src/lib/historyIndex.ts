// History's front door: the narrated story of the day, and what happened in a given country.
// Loaded lazily (it pulls in every battle), so the home screen doesn't pay for it up front.
import { BATTLES } from './battles';
import { WORLD_WARS } from './worldWars';
import { VOYAGES } from './voyages';
import { countryAt } from './data';
import { seeded, dailyNumber } from './daily';
import { storyOf, type StoryKind } from './shareStory';

export interface StoryPick { kind: StoryKind; id: string; title: string; line: string; icon: 'war' | 'battle' | 'voyage' }

const pickOf = (kind: StoryKind, id: string, icon: StoryPick['icon']): StoryPick => {
  const s = storyOf(kind, id)!;
  return { kind, id, title: s.title.replace(/, told on a map, narrated$/, ''), line: s.line, icon };
};

// Every narrated story, shuffled once (the same order on every device). One a day, in that order,
// so nothing comes round again until the whole list has.
let order: StoryPick[] | null = null;
function stories() {
  if (order) return order;
  const all: StoryPick[] = [
    ...Object.keys(WORLD_WARS).map((id) => pickOf('battles', id, 'war')),
    ...BATTLES.map((b) => pickOf('battles', b.id, b.kind === 'war' ? 'war' : 'battle')),
    ...VOYAGES.map((v) => pickOf('voyages', v.id, 'voyage')),
  ];
  const rnd = seeded('geoquest-story');
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return (order = all);
}

/** Today's narrated story: a war, a battle or a voyage. */
export function storyOfDay(date: string): StoryPick {
  const xs = stories();
  const n = dailyNumber(date);
  return xs[((n % xs.length) + xs.length) % xs.length];
}

export interface Here { kind: StoryKind; id: string; name: string; year: number; when: string; icon: StoryPick['icon']; stop?: number }

// Ports sit on the coast, so at the map's resolution many land just offshore: look a little
// further out, nearest ring first, until a coast turns up.
function landAt(lat: number, lng: number): string | null {
  const c = countryAt(lat, lng);
  if (c) return c;
  for (const r of [0.2, 0.45, 0.8, 1.3]) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * 2 * Math.PI;
      const hit = countryAt(lat + r * Math.sin(a), lng + (r * Math.cos(a)) / Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
      if (hit) return hit;
    }
  }
  return null;
}

// Country → what happened there: battles where they were fought (a war where it was centred), and
// voyages at each stop they made on that country's soil.
let index: Map<string, Here[]> | null = null;
function build() {
  const m = new Map<string, Here[]>();
  const add = (c: string | null | undefined, h: Here) => { if (!c) return; const xs = m.get(c) ?? []; if (!xs.some((x) => x.id === h.id)) m.set(c, [...xs, h]); };
  for (const b of BATTLES) {
    const h: Here = { kind: 'battles', id: b.id, name: b.name, year: b.year, when: b.when, icon: b.kind === 'war' ? 'war' : 'battle' };
    add(landAt(b.at[0], b.at[1]), h);
  }
  for (const v of VOYAGES) {
    v.stops.forEach((s, i) => add(landAt(s.at[0], s.at[1]), { kind: 'voyages', id: v.id, name: `${v.voyager} at ${s.name.replace(/ \(.*\)$/, '').replace(/,.*$/, '')}`, year: v.year, when: s.when, icon: 'voyage', stop: i }));
  }
  for (const xs of m.values()) xs.sort((a, b) => a.year - b.year);
  return m;
}

/** Up to `n` stories that happened in a country (cca3), oldest first. Battles and voyages share the
 *  space (a country full of ports still shows its battles), each spread across the centuries. */
export function historyIn(cca3: string, n = 4): Here[] {
  index ??= build();
  const all = index.get(cca3) ?? [];
  const fights = all.filter((h) => h.kind === 'battles'), sails = all.filter((h) => h.kind === 'voyages');
  const nf = Math.min(fights.length, Math.max(Math.ceil(n / 2), n - sails.length));
  const spread = (xs: Here[], k: number) => (xs.length <= k ? xs : Array.from({ length: k }, (_, i) => xs[Math.round((i * (xs.length - 1)) / Math.max(1, k - 1))]));
  return [...spread(fights, nf), ...spread(sails, n - nf)].sort((a, b) => a.year - b.year);
}

/** How many stories a country has in all. */
export const historyCount = (cca3: string) => { index ??= build(); return index.get(cca3)?.length ?? 0; };
