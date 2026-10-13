// Country pages for search: one plain, fast HTML page per country (map, capital, neighbours, facts,
// GeoGuessr clues) at /country/<name>, an A–Z index at /countries, and the sitemap. Written into
// dist/ after `vite build`, from GeoQuest's own data — so search engines read real pages without
// running the 3D app, and every page leads into it ("Find it on the 3D globe").
//
//   npx tsx scripts/country-pages.ts [outDir=dist]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { COUNTRIES, BY_CCA3, FEATURES, FEATURES_110, autoTips, fmtInt, rankOf, type Country } from '../src/lib/data';
import { CURATED } from '../src/data/curated';
import { takeaway } from '../src/lib/quizCoach';
import { countrySlug, pageCountries } from '../src/lib/countryPages';

const SITE = 'https://playgeoquest.app';
const OUT = process.argv[2] ?? 'dist';
const TODAY = new Date().toISOString().slice(0, 10);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const list = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const the = (c: Country) => (/^(United|Netherlands|Philippines|Bahamas|Gambia|Maldives|Comoros|Seychelles|Solomon|Marshall|Central African|Dominican|Czech|Democratic|Republic)/.test(c.name) ? `the ${c.name}` : c.name);
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const flag = (c: Country, w = 160) => `https://flagcdn.com/w${w}/${c.cca2.toLowerCase()}.png`;
const pageUrl = (c: Country) => `${SITE}/country/${countrySlug(c)}`;
const people = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} billion` : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} million` : fmtInt(n));
const where = (c: Country) => c.subregion || c.region;

const PAGES = pageCountries(COUNTRIES);
const ON_PAGES = new Set(PAGES.map((c) => c.cca3));
const link = (c: Country) => (ON_PAGES.has(c.cca3) ? `<a href="/country/${countrySlug(c)}">${esc(c.name)}</a>` : esc(c.name));

// ── The "where is it" globe: the country in gold on a globe turned to face it ──
const FEATURE_OF = new Map(FEATURES.filter((f) => f.properties.cca3).map((f) => [f.properties.cca3!, f]));
const FEATURE_OF_110 = new Map(FEATURES_110.filter((f) => f.properties.cca3).map((f) => [f.properties.cca3!, f]));
function globeSvg(c: Country) {
  const size = 360;
  const proj = geoOrthographic().rotate([-c.latlng[1], -Math.max(-60, Math.min(60, c.latlng[0]))]).scale(170).translate([size / 2, size / 2]).clipAngle(90);
  // Whole pixels for the background countries, a little finer for the one we're showing — at
  // 360px wide it looks the same and keeps the page light.
  const path = geoPath(proj).digits(1), rough = geoPath(proj).digits(0);
  const land = FEATURES_110.filter((f) => f.properties.cca3 !== c.cca3).map((f) => rough(f as never)).filter(Boolean).join('');
  const target = FEATURE_OF_110.get(c.cca3) ?? FEATURE_OF.get(c.cca3); // detailed shape only for small places
  const shape = target ? path(target as never) : null;
  const [x, y] = proj([c.latlng[1], c.latlng[0]]) ?? [size / 2, size / 2];
  const small = !shape || c.area < 40_000; // too small to see at this scale: ring it
  return `<svg class="globe" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(`${c.name} shown on a globe`)}">
<defs><radialGradient id="sea" cx="38%" cy="32%"><stop offset="0" stop-color="#1e4d8f"/><stop offset="1" stop-color="#0a1a3c"/></radialGradient></defs>
<path d="${path({ type: 'Sphere' })}" fill="url(#sea)"/>
<path d="${path(geoGraticule10())}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width=".6"/>
<path d="${land}" fill="#3b4a6b" stroke="#55658a" stroke-width=".4"/>
${shape ? `<path d="${shape}" fill="#fbbf24" stroke="#fde68a" stroke-width=".8"/>` : ''}
${small ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11" fill="none" stroke="#fbbf24" stroke-width="2.5"/>` : ''}
<path d="${path({ type: 'Sphere' })}" fill="none" stroke="rgba(125,211,252,.35)" stroke-width="1.2"/>
</svg>`;
}

// ── Shared page frame ──
function frame({ title, description, canonical, image, body, jsonLd }: { title: string; description: string; canonical: string; image: string; body: string; jsonLd: object[] }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${canonical}" />
  <meta name="theme-color" content="#04060f" />
  <link rel="icon" href="/icons/favicon-32.png" sizes="32x32" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="GeoQuest" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${image}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${image}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Space+Grotesk:wght@700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/legal.css" />
  <link rel="stylesheet" href="/country.css" />
  ${jsonLd.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n  ')}
</head>
<body>
  <header class="top">
    <a class="brand" href="/"><img src="/icons/icon-192.png" alt="" width="32" height="32" /> GeoQuest</a>
    <a class="play" href="/?play=1&ref=country">Play</a>
  </header>
  <main>
${body}
  </main>
  <footer>
    <a href="/countries">All countries</a>
    <a href="/about">About</a>
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
    <span>© ${TODAY.slice(0, 4)} GeoQuest</span>
  </footer>
</body>
</html>
`;
}

// ── One country ──
function countryPage(c: Country) {
  const ns = c.borders.map((b) => BY_CCA3.get(b)).filter((n): n is Country => !!n).sort((a, b) => b.population - a.population);
  const capital = c.capital[0];
  const popRank = c.independent ? rankOf(c, 'population') : null;
  const areaRank = c.independent ? rankOf(c, 'area') : null;
  const cur = CURATED[c.cca3];
  const tips = [...(cur?.tips ?? []), ...autoTips(c)].map((t) => t.t);
  const peers = PAGES.filter((o) => o.cca3 !== c.cca3 && o.subregion === c.subregion && !c.borders.includes(o.cca3)).sort((a, b) => b.population - a.population).slice(0, 8);
  const lines = takeaway(c.cca3).filter((l) => !l.startsWith('Capital:'));

  const intro = `${cap(the(c))} is ${c.independent ? 'a country' : 'a territory'} in ${where(c)}${ns.length ? `, bordering ${list(ns.slice(0, 4).map((n) => the(n)))}${ns.length > 4 ? ` and ${ns.length - 4} more` : ''}` : ''}.${capital ? ` Its capital is ${capital}.` : ''} About ${people(c.population)} people live there.`;
  const description = `${intro} See where it is on an interactive 3D globe, with facts and GeoGuessr clues — then test yourself with free geography games.`.slice(0, 300);
  const title = `${c.name} — Map, Capital & Facts | GeoQuest`;
  const facts: [string, string][] = [
    ['Capital', c.capital.length ? c.capital.join(', ') : '—'],
    ['Continent', c.continents.join(', ') || c.region],
    ['Region', where(c)],
    ['Population', `${fmtInt(c.population)}${popRank ? ` (#${popRank} in the world)` : ''}`],
    ['Area', `${fmtInt(Math.round(c.area))} km²${areaRank ? ` (#${areaRank} by size)` : ''}`],
    ['Languages', c.languages.join(', ') || '—'],
    ['Currency', c.currencies.map((x) => `${x.name}${x.symbol ? ` (${x.symbol})` : ''}`).join(', ') || '—'],
    ['Drives on the', c.drive],
    ['Calling code', c.idd || '—'],
    ['Time zone', c.timezones.length > 3 ? `${c.timezones.slice(0, 3).join(', ')} and ${c.timezones.length - 3} more` : c.timezones.join(', ') || '—'],
    ['Internet domain', c.tld.join(', ') || '—'],
    ['People are called', c.demonym || '—'],
  ];

  const body = `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">GeoQuest</a> › <a href="/countries">Countries</a> › <span>${esc(c.name)}</span></nav>
    <div class="ct-hero">
      <img class="ct-flag" src="${flag(c, 320)}" alt="Flag of ${esc(c.name)}" width="96" height="64" />
      <div>
        <h1>${esc(c.name)}</h1>
        <p class="ct-official">${c.official !== c.name ? `${esc(c.official)} · ` : ''}${esc(where(c))}</p>
      </div>
    </div>
    <p class="lede">${esc(intro)}</p>
    <div class="ct-actions">
      <a class="cta" href="/?country=${c.cca3}&ref=country">Find it on the 3D globe →</a>
      <a class="cta ghost" href="/?play=1&ref=country">Test yourself</a>
    </div>

    <figure class="ct-map">${globeSvg(c)}<figcaption>${esc(c.name)} on the globe${c.area < 40_000 ? ' (circled — it’s small at this scale)' : ''}.</figcaption></figure>

    <h2>Where is ${esc(the(c))}?</h2>
    ${lines.map((l) => `<p>${esc(l)}</p>`).join('\n    ')}
    <p>Its centre lies at about ${Math.abs(c.latlng[0]).toFixed(1)}°${c.latlng[0] >= 0 ? 'N' : 'S'}, ${Math.abs(c.latlng[1]).toFixed(1)}°${c.latlng[1] >= 0 ? 'E' : 'W'}${c.landlocked ? ', and it has no coastline' : ''}.</p>

    ${capital ? `<h2>What is the capital of ${esc(the(c))}?</h2>
    <p>The capital of ${esc(the(c))} is <b>${esc(capital)}</b>${c.capital.length > 1 ? ` (it also has ${esc(list(c.capital.slice(1)))})` : ''}.</p>` : ''}

    <h2>Which countries border ${esc(the(c))}?</h2>
    ${ns.length
      ? `<p>${esc(cap(the(c)))} shares land borders with ${ns.length} ${ns.length === 1 ? 'country' : 'countries'}:</p>
    <ul class="ct-links">${ns.map((n) => `<li><img src="${flag(n, 80)}" alt="" width="24" height="16" loading="lazy" /> ${link(n)}</li>`).join('')}</ul>`
      : `<p>${esc(cap(the(c)))} has no land borders${c.landlocked ? '' : ' — it’s surrounded by sea'}.</p>`}

    <h2>${esc(c.name)} at a glance</h2>
    <table class="ct-facts">${facts.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>

    ${cur ? `<h2>Geography</h2>
    <ul>
      ${cur.river ? `<li><b>Longest river:</b> ${esc(cur.river)}</li>` : ''}
      ${cur.peak ? `<li><b>Highest point:</b> ${esc(cur.peak)}</li>` : ''}
      ${cur.range ? `<li><b>Mountain ranges:</b> ${esc(cur.range)}</li>` : ''}
      ${cur.fact ? `<li>${esc(cur.fact)}</li>` : ''}
    </ul>` : ''}

    <h2>GeoGuessr clues for ${esc(the(c))}</h2>
    <p>How to recognise ${esc(the(c))} from street-level imagery:</p>
    <ul>${tips.slice(0, 10).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>

    <div class="card ct-play">
      <p><b>Can you find ${esc(the(c))} without the label?</b> Spin the globe, play the Daily challenge or a quick Map quiz — free, no sign-up.</p>
      <p><a class="cta" href="/?country=${c.cca3}&ref=country">Open ${esc(the(c))} on the globe</a> <a class="cta ghost" href="/?daily=1&ref=country">Today’s Daily</a></p>
    </div>

    ${peers.length ? `<h2>More countries in ${esc(where(c))}</h2>
    <ul class="ct-links">${peers.map((n) => `<li><img src="${flag(n, 80)}" alt="" width="24" height="16" loading="lazy" /> ${link(n)}</li>`).join('')}</ul>` : ''}`;

  const jsonLd = [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'GeoQuest', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Countries', item: `${SITE}/countries` },
      { '@type': 'ListItem', position: 3, name: c.name, item: pageUrl(c) },
    ] },
    { '@context': 'https://schema.org', '@type': 'Country', name: c.name, alternateName: c.official, url: pageUrl(c), image: flag(c, 320),
      geo: { '@type': 'GeoCoordinates', latitude: c.latlng[0], longitude: c.latlng[1] },
      ...(capital ? { containsPlace: { '@type': 'City', name: capital } } : {}) },
  ];
  return frame({ title, description, canonical: pageUrl(c), image: flag(c, 1280), body, jsonLd });
}

// ── A–Z index ──
function indexPage() {
  const REGIONS = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania', 'Antarctic'];
  const groups = REGIONS.map((r) => [r, PAGES.filter((c) => c.region === r).sort((a, b) => a.name.localeCompare(b.name))] as const).filter(([, xs]) => xs.length);
  const body = `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">GeoQuest</a> › <span>Countries</span></nav>
    <h1>Countries of the world</h1>
    <p class="lede">Maps, capitals, neighbours and quick facts for ${PAGES.length} countries and territories — and a 3D globe to find each one on.</p>
    <div class="ct-actions"><a class="cta" href="/?play=1&ref=country">Play the geography games</a></div>
    ${groups.map(([r, xs]) => `<h2>${r === 'Americas' ? 'The Americas' : r === 'Antarctic' ? 'Antarctica' : r} <small>${xs.length}</small></h2>
    <ul class="ct-links ct-index">${xs.map((c) => `<li><img src="${flag(c, 80)}" alt="" width="24" height="16" loading="lazy" /> ${link(c)}</li>`).join('')}</ul>`).join('\n    ')}`;
  return frame({
    title: 'Countries of the World — Maps, Capitals & Facts | GeoQuest',
    description: `Maps, capitals, neighbours and quick facts for ${PAGES.length} countries and territories, each shown on a 3D globe — plus free geography games to test yourself.`,
    canonical: `${SITE}/countries`, image: `${SITE}/icons/og-home.jpg`, body,
    jsonLd: [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'GeoQuest', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Countries', item: `${SITE}/countries` },
    ] }],
  });
}

// ── Write everything ──
mkdirSync(join(OUT, 'country'), { recursive: true });
for (const c of PAGES) writeFileSync(join(OUT, 'country', `${countrySlug(c)}.html`), countryPage(c));
writeFileSync(join(OUT, 'countries.html'), indexPage());

// Sitemap: the pages already listed (home, about…), then the index and every country.
const base = readFileSync(join(OUT, 'sitemap.xml'), 'utf8');
const entry = (loc: string, pr: string) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${pr}</priority>\n  </url>\n`;
const extra = entry(`${SITE}/countries`, '0.8') + PAGES.map((c) => entry(pageUrl(c), '0.7')).join('');
writeFileSync(join(OUT, 'sitemap.xml'), base.replace('</urlset>', `${extra}</urlset>`));
console.log(`country pages: ${PAGES.length} + index, sitemap updated (${OUT})`);
