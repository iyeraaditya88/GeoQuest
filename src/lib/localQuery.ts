// Offline question answering over the bundled dataset. Used when the AI server
// isn't configured, so the app still answers common trivia questions instantly.
import { COUNTRIES, BY_CCA3, curatedFor, fmtInt, fmtCompact, type Country } from './data';

export interface LocalAnswer { text: string; highlight: string[] }

const REGIONS = ['africa', 'americas', 'asia', 'europe', 'oceania'];
const SUB = ['south america', 'north america', 'central america', 'caribbean', 'western europe', 'eastern europe',
  'northern europe', 'southern europe', 'south-eastern asia', 'southeast asia', 'eastern asia', 'southern asia',
  'western asia', 'middle east', 'central asia', 'northern africa', 'western africa', 'eastern africa',
  'southern africa', 'middle africa'];

const indep = COUNTRIES.filter((c) => c.independent);

function findCountry(q: string): Country | undefined {
  const s = q.toLowerCase();
  let best: Country | undefined;
  for (const c of COUNTRIES) {
    const names = [c.name, c.official].map((x) => x.toLowerCase());
    if (names.some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(s))) {
      if (!best || c.name.length > best.name.length) best = c;
    }
  }
  return best;
}

function scopeFilter(q: string): { list: Country[]; label: string } {
  const s = q.toLowerCase();
  const sub = SUB.find((x) => s.includes(x));
  if (sub) {
    const norm = sub === 'southeast asia' ? 'south-eastern asia' : sub === 'middle east' ? 'western asia' : sub;
    const list = indep.filter((c) => c.subregion.toLowerCase() === norm ||
      (norm === 'north america' && c.subregion === 'North America'));
    if (list.length) return { list, label: ` in ${sub.replace(/\b\w/g, (m) => m.toUpperCase())}` };
  }
  const reg = REGIONS.find((x) => s.includes(x)) ?? (s.includes('america') ? 'americas' : undefined);
  if (reg) return { list: indep.filter((c) => c.region.toLowerCase() === reg), label: ` in ${reg[0].toUpperCase()}${reg.slice(1)}` };
  return { list: indep, label: ' in the world' };
}

const list = (cs: Country[], f: (c: Country) => string) =>
  cs.map((c, i) => `${i + 1}. ${c.flag} **${c.name}** — ${f(c)}`).join('\n');

export function answerLocally(q: string, selected?: Country | null): LocalAnswer | null {
  const s = q.toLowerCase().trim();
  const target = findCountry(s) ?? (/\b(it|this|its|here|there)\b|this country/.test(s) || !/countr/.test(s) ? selected ?? undefined : undefined);

  // Superlatives
  const sup = s.match(/\b(largest|biggest|smallest|most populous|least populous|most people|fewest people|densest|most densely)\b/);
  if (sup && /countr|nation/.test(s)) {
    const { list: pool, label } = scopeFilter(s);
    const word = sup[1];
    let sorted: Country[]; let fmt: (c: Country) => string; let title: string;
    if (/populous|people/.test(word)) {
      const asc = /least|fewest/.test(word);
      sorted = [...pool].sort((a, b) => (asc ? a.population - b.population : b.population - a.population));
      fmt = (c) => `${fmtCompact(c.population)} people`; title = `${asc ? 'Least' : 'Most'} populous countries${label}`;
    } else if (/dens/.test(word)) {
      sorted = [...pool].sort((a, b) => b.population / b.area - a.population / a.area);
      fmt = (c) => `${fmtInt(Math.round(c.population / c.area))} /km²`; title = `Most densely populated${label}`;
    } else {
      const asc = word === 'smallest';
      sorted = [...pool].sort((a, b) => (asc ? a.area - b.area : b.area - a.area));
      fmt = (c) => `${fmtInt(Math.round(c.area))} km²`; title = `${asc ? 'Smallest' : 'Largest'} countries by area${label}`;
    }
    const top = sorted.slice(0, 5);
    return { text: `**${title}**\n\n${list(top, fmt)}`, highlight: top.map((c) => c.cca3) };
  }

  // Drive on the left
  if (/drive|driving/.test(s) && /left/.test(s) && !target) {
    const { list: pool, label } = scopeFilter(s);
    const hits = pool.filter((c) => c.drive === 'left');
    return { text: `**${hits.length} countries${label} drive on the left** — highlighted on the globe.`, highlight: hits.map((c) => c.cca3) };
  }

  // Landlocked
  if (/landlocked/.test(s) && !target) {
    const { list: pool, label } = scopeFilter(s);
    const hits = pool.filter((c) => c.landlocked);
    return { text: `**${hits.length} landlocked countries${label}** — highlighted on the globe.`, highlight: hits.map((c) => c.cca3) };
  }

  // Speak a language
  const lang = s.match(/(?:speak|speaks|speaking|language is)\s+([a-z]+)/);
  if (lang) {
    const L = lang[1];
    const hits = COUNTRIES.filter((c) => c.languages.some((l) => l.toLowerCase() === L));
    if (hits.length) return { text: `**Countries where ${L[0].toUpperCase() + L.slice(1)} is official** — ${hits.length} of them, highlighted on the globe.`, highlight: hits.map((c) => c.cca3) };
  }

  if (!target) return null;
  const c = target; const cur = curatedFor(c.cca3);
  const one = (text: string, extra: string[] = []) => ({ text, highlight: [c.cca3, ...extra] });

  if (/capital/.test(s)) return one(`The capital of ${c.flag} **${c.name}** is **${c.capital.join(', ') || '—'}**.`);
  if (/population|how many people|populous/.test(s)) return one(`${c.flag} **${c.name}** has about **${fmtInt(c.population)}** people.`);
  if (/area|how big|size/.test(s)) return one(`${c.flag} **${c.name}** covers **${fmtInt(Math.round(c.area))} km²**.`);
  if (/language/.test(s)) return one(`Official language${c.languages.length > 1 ? 's' : ''} of ${c.name}: **${c.languages.join(', ')}**.`);
  if (/currenc|money/.test(s)) return one(`${c.name} uses the **${c.currencies.map((x) => `${x.name} (${x.code})`).join(', ')}**.`);
  if (/border|neighbo/.test(s)) {
    const ns = c.borders.map((b) => BY_CCA3.get(b)).filter(Boolean) as Country[];
    return ns.length
      ? one(`${c.flag} **${c.name}** borders ${ns.length} countries:\n\n${ns.map((x) => `${x.flag} ${x.name}`).join(' · ')}`, ns.map((x) => x.cca3))
      : one(`${c.flag} **${c.name}** has no land borders.`);
  }
  if (/river/.test(s)) return one(cur ? `Longest river in ${c.name}: **${cur.river}**.` : `I don't have river data for ${c.name} offline — connect the AI to ask.`);
  if (/mountain|peak|highest|tallest/.test(s)) return one(cur ? `Highest point in ${c.name}: **${cur.peak}**${cur.range && cur.range !== '—' ? `, in the ${cur.range}` : ''}.` : `I don't have mountain data for ${c.name} offline — connect the AI to ask.`);
  if (/drive|driving/.test(s)) return one(`In ${c.name} they drive on the **${c.drive}**.`);
  if (/time ?zone/.test(s)) return one(`${c.name} time zone${c.timezones.length > 1 ? 's' : ''}: **${c.timezones.join(', ')}**.`);
  if (/calling|phone|dial/.test(s)) return one(`${c.name}'s calling code is **${c.idd || '—'}**.`);
  if (/domain|tld/.test(s)) return one(`${c.name}'s internet domain is **${c.tld.join(', ')}**.`);
  return one(`${c.flag} **${c.name}** — capital **${c.capital[0] ?? '—'}**, population **${fmtCompact(c.population)}**, ${c.languages.join(', ')}. ` +
    `Drives on the ${c.drive}.${cur ? ` Highest point: ${cur.peak}. Longest river: ${cur.river}.` : ''}`);
}
