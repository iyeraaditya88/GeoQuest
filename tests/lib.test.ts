import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../src/lib/html';
import { sidePanel, panelWidth } from '../src/lib/layout';
import { riverLength, displayName } from '../src/lib/features';
import { missHint, takeaway } from '../src/lib/quizCoach';
import { speedPoints, buildScript, GAMES } from '../src/lib/match';
import { matchAnswer, TOP5 } from '../src/lib/top5';
import { makeRound } from '../src/lib/capitals';
import { matchQuestions, MATCH_RAMP, LEVELS } from '../src/lib/trivia';

describe('escapeHtml', () => {
  it('escapes markup and quotes', () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe('&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
  });
});

describe('layout', () => {
  it('uses a side panel on wide screens and landscape phones, a sheet on upright phones', () => {
    expect(sidePanel(1280, 800)).toBe(true);
    expect(panelWidth(1280, 800)).toBe(420);
    expect(sidePanel(812, 375)).toBe(true);
    expect(panelWidth(812, 375)).toBe(380);
    expect(sidePanel(375, 812)).toBe(false);
    expect(panelWidth(375, 812)).toBe(0);
  });
});

describe('river facts', () => {
  it('reads a stated length, not just any distance', () => {
    expect(riverLength('The Marañón River … arising about 160 km to the northeast of Lima, Peru.')).toBeUndefined();
    expect(riverLength('The 1,450-mile-long (2,330 km) river drains')).toBe(2330);
    expect(riverLength('It is about 6,650 km (4,130 mi) long')).toBe(6650);
    expect(riverLength('with a length of 2,850 km')).toBe(2850);
  });
  it('names features nicely', () => {
    expect(displayName({ kind: 'river', name: 'Colorado#1' })).toBe('Colorado River');
    expect(displayName({ kind: 'range', name: 'Cordillera Central#2' })).toBe('Cordillera Central');
  });
});

describe('map quiz coach', () => {
  it('points from the wrong guess toward the answer, then narrows it down', () => {
    const first = missHint('NLD', 'ESP', 1);
    expect(first).toMatch(/^You picked Spain\./); // the hint clearly follows from what you clicked
    expect(first).toMatch(/north-east of Spain/);
    expect(first).toMatch(/Western Europe/);
    expect(missHint('NLD', 'ESP', 2)).toMatch(/borders .*Germany|borders .*Belgium/);
  });
  it('says so when a guess is way off, and points to the right continent', () => {
    const far = missHint('KEN', 'BRA', 1);
    expect(far).toBe('You picked Brazil. That’s a long way from Kenya — try looking in Africa.');
    expect(missHint('KEN', 'BRA', 2)).toMatch(/Eastern Africa.*borders/);
    expect(missHint('PER', 'USA', 1)).toMatch(/try looking in South America/);
    expect(missHint('FJI', 'AUS', 1)).toMatch(/Fiji is about [\d,]+ km east of Australia/); // same continent: a direction
    expect(missHint('NLD', 'BEL', 1)).toMatch(/^You picked Belgium\. So close — the Netherlands borders Belgium, to the north/);
  });
  it('gives something to remember with the answer', () => {
    const lines = takeaway('MRT');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.join(' ')).toMatch(/Western Africa/);
    expect(lines.join(' ')).toMatch(/Capital: Nouakchott/);
  });
  it('handles island nations', () => {
    expect(takeaway('ISL')[0]).toMatch(/island nation/i);
  });
});

describe('games', () => {
  it('scores speed between 500 and 1000', () => {
    expect(speedPoints(0)).toBe(500);
    expect(speedPoints(1)).toBe(1000);
    expect(speedPoints(2)).toBe(1000);
  });
  it('matches Top 5 answers leniently', () => {
    const q = TOP5.find((t) => t.answers.some((a) => a.name === 'Russia'))!;
    expect(matchAnswer('russia', q.answers)).toBeGreaterThanOrEqual(0);
    expect(matchAnswer('Rusia', q.answers)).toBeGreaterThanOrEqual(0);
    expect(matchAnswer('Atlantis', q.answers)).toBe(-1);
  });
  it('builds a valid Capitals round', () => {
    const round = makeRound('easy');
    expect(round).toHaveLength(10);
    for (const q of round) {
      expect(q.options).toHaveLength(4);
      expect(q.options.some((o) => o.cca3 === q.country.cca3)).toBe(true);
      expect(new Set(q.options.map((o) => o.cca3)).size).toBe(4);
    }
  });
  it('ramps trivia difficulty for matches', () => {
    const qs = matchQuestions();
    expect(qs).toHaveLength(MATCH_RAMP.length);
    expect(qs.map((q) => LEVELS.indexOf(q.difficulty))).toEqual(MATCH_RAMP);
    expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
  });
  it('builds scripts every game understands', async () => {
    for (const g of ['capitals', 'trivia', 'quiz', 'top5'] as const) {
      const s = await buildScript(g, { mode: 'flag', level: 'all' });
      expect(s.game).toBe(g);
      expect(s.qs).toHaveLength(GAMES[g].n);
    }
  });
});

describe('stale-version detection', async () => {
  const { isChunkError } = await import('../src/lib/chunks');
  it('recognises a missing code file from an older deploy, and nothing else', () => {
    expect(isChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/StreetGame-abc.js'))).toBe(true); // Chrome
    expect(isChunkError(new TypeError('Importing a module script failed.'))).toBe(true); // Safari
    expect(isChunkError(new TypeError('error loading dynamically imported module'))).toBe(true); // Firefox
    expect(isChunkError(new Error('Cannot read properties of undefined'))).toBe(false);
  });
});

describe('Street View locations', async () => {
  const { pickCountry } = await import('../src/lib/mapillary');
  it('never repeats a country within a game', () => {
    for (let game = 0; game < 200; game++) {
      const seen = new Set<string>();
      for (let round = 0; round < 5; round++) seen.add(pickCountry(seen));
      expect(seen.size).toBe(5);
    }
  });
  it('doesn’t lean heavily on any one country', () => {
    const n: Record<string, number> = {};
    for (let i = 0; i < 20000; i++) { const c = pickCountry(new Set()); n[c] = (n[c] ?? 0) + 1; }
    expect(n.USA / 20000).toBeLessThan(0.08); // was ~34% when towns, not countries, were picked
    expect(Object.keys(n).length).toBeGreaterThan(50);
  });
});

describe('Daily challenge', async () => {
  const d = await import('../src/lib/daily');
  const { QUIZ_POOL } = await import('../src/lib/quiz');
  it('gives everyone the same five countries on a day, and different ones the next', () => {
    const a = d.dailyPicks('2026-10-09', QUIZ_POOL).targets;
    expect(a).toEqual(d.dailyPicks('2026-10-09', [...QUIZ_POOL].reverse()).targets); // order of the pool doesn't matter
    expect(new Set(a).size).toBe(5);
    expect(a.every((c) => QUIZ_POOL.includes(c))).toBe(true);
    expect(d.dailyPicks('2026-10-10', QUIZ_POOL).targets).not.toEqual(a);
  });
  it('numbers the days, sets the theme, and scores', () => {
    expect(d.dailyNumber('2026-10-09')).toBe(1);
    expect(d.dailyNumber('2026-10-12')).toBe(4);
    expect(['2026-10-09', '2026-10-10', '2026-10-11'].map(d.themeOf)).toEqual(['find', 'find', 'find']); // always "find the country"
    expect([d.pointsFor(0, false), d.pointsFor(1, false), d.pointsFor(2, false), d.pointsFor(1, true)]).toEqual([3, 2, 1, 0]);
    expect(d.shareLine('2026-10-09', [3, 3, 2, 0, 1])).toBe('GeoQuest Daily #1 🟩🟩🟨⬛🟧 9/15');
    expect(d.validPoints([3, 3, 3, 3, 4])).toBe(false);
    expect(d.addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('Map quiz order', async () => {
  const { nextTarget, QUIZ_POOL } = await import('../src/lib/quiz');
  it('asks every country once before any repeats', () => {
    const seen = Array.from({ length: QUIZ_POOL.length }, () => nextTarget('t-find', QUIZ_POOL));
    expect(new Set(seen).size).toBe(QUIZ_POOL.length);
  });
  it('keeps the last ones played away from the start of the next round of the deck', () => {
    const pool = Array.from({ length: 60 }, (_, i) => `C${i}`);
    const first = Array.from({ length: 60 }, () => nextTarget('t-small', pool));
    const next = Array.from({ length: 30 }, () => nextTarget('t-small', pool));
    const lastPlayed = new Set(first.slice(-20));
    expect(next.slice(0, 30).filter((c) => lastPlayed.has(c))).toEqual([]);
  });
  it('never asks the same country twice in a row', () => {
    let prev: string | undefined;
    for (let i = 0; i < 400; i++) { const c = nextTarget('t-row', ['A', 'B', 'C'], prev); expect(c).not.toBe(prev); prev = c; }
  });
});

describe('shared Daily link preview', () => {
  it('retitles the home page preview for chat apps', async () => {
    const { dailyPreview } = await import('../middleware');
    const html = '<title>GeoQuest</title><meta property="og:title" content="GeoQuest" /><meta name="twitter:title" content="GeoQuest" /><meta property="og:description" content="x" />';
    const out = dailyPreview(html);
    expect(out.match(/GeoQuest Daily — can you find today’s 5 countries\?/g)).toHaveLength(3);
    expect(out).toContain('og:description" content="A new set of 5 countries every day');
  });
  it('shows the score in the picture when the link carries one', async () => {
    const { dailyPreview } = await import('../middleware');
    const html = '<title>GeoQuest</title><meta property="og:title" content="GeoQuest" /><meta property="og:image" content="old.jpg" /><meta name="twitter:image" content="old.jpg" />';
    const out = dailyPreview(html, new URL('https://playgeoquest.app/?daily=2&r=13333'));
    expect(out).toContain('<title>GeoQuest Daily #2 — 13/15. Can you beat it?</title>');
    expect(out.match(/https:\/\/playgeoquest\.app\/api\/og\/daily\?n=2&r=13333/g)).toHaveLength(2);
    // A made-up score is ignored: the usual picture.
    expect(dailyPreview(html, new URL('https://playgeoquest.app/?daily=2&r=99999'))).toContain('old.jpg');
  });
  it('draws the share picture', async () => {
    const { dailyCard, parsePoints } = await import('../server/og');
    expect(parsePoints('13333')).toEqual([1, 3, 3, 3, 3]);
    expect(parsePoints('1333')).toBeNull();
    const png = await dailyCard(2, [1, 3, 3, 3, 3]);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.length).toBeLessThan(300_000); // WhatsApp's limit for preview images
  }, 20_000);
});

describe('guests are never nagged by background requests', () => {
  it('stays quiet for a guest, and only notes an expired sign-in', async () => {
    const events: string[] = [];
    const win = new EventTarget();
    for (const t of ['gq:signin', 'gq:signedout']) win.addEventListener(t, () => events.push(t));
    const g = globalThis as unknown as { window?: EventTarget; fetch: typeof fetch };
    const realFetch = g.fetch, hadWindow = 'window' in g, realWindow = g.window;
    g.window = win;
    g.fetch = (async () => new Response('{}', { status: 401 })) as typeof fetch;
    try {
      const { api } = await import('../src/lib/api');
      const { setAuth, getAuth } = await import('../src/lib/session');
      setAuth({ hosted: true, user: null, role: null }); // a guest
      await api('/api/favorites');
      expect(events).toEqual([]); // no sign-in pop-up out of nowhere
      setAuth({ hosted: true, user: 'maya', role: 'member' }); // signed in… until it expires
      await api('/api/favorites');
      expect(events).toEqual(['gq:signedout']);
      expect(getAuth().user).toBeNull(); // carries on as a guest
    } finally {
      g.fetch = realFetch;
      if (hadWindow) g.window = realWindow; else delete g.window;
    }
  });
});

describe('security helpers', () => {
  it('pauses an account after a handful of wrong passwords, then lets it go', async () => {
    const { failureCounter } = await import('../server/http');
    const c = failureCounter(3, 60_000);
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) { expect(c.blocked('maya', t)).toBe(false); c.note('maya', t); }
    expect(c.blocked('maya', t)).toBe(true);
    expect(c.blocked('bob', t)).toBe(false); // per account
    expect(c.blocked('maya', t + 61_000)).toBe(false); // the pause passes
    c.note('maya', t); c.clear('maya');
    expect(c.blocked('maya', t)).toBe(false);
  });
  it('keeps the reserved names back', async () => {
    const { reservedName } = await import('../server/users');
    for (const n of ['guest', 'admin', 'geoquest', 'support_team', 'official.geoquest']) expect(reservedName(n)).toBe(true);
    for (const n of ['maya', 'bob', 'guesty', 'aaditya']) expect(reservedName(n)).toBe(false);
  });
  it('sends Claude only the latest turns, trimmed', async () => {
    const { askConversation } = await import('../server/routes/ai');
    const long = 'x'.repeat(50_000);
    const msgs = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: long }));
    msgs.push({ role: 'user', content: 'Where is Chad?' });
    const convo = askConversation(msgs);
    const total = convo.reduce((s, m) => s + String(m.content).length, 0);
    expect(total).toBeLessThanOrEqual(16_000);
    expect(convo[0].role).toBe('user');
    expect(convo[convo.length - 1]).toEqual({ role: 'user', content: 'Where is Chad?' });
  });
});

describe('country pages', () => {
  it('gives every country a clean, unique address', async () => {
    const { slugify, countrySlug, pageCountries, isCountryPath } = await import('../src/lib/countryPages');
    const { COUNTRIES } = await import('../src/lib/data');
    expect(slugify('São Tomé and Príncipe')).toBe('sao-tome-and-principe');
    expect(slugify('Côte d’Ivoire')).toBe('cote-divoire');
    expect(slugify('Bosnia & Herzegovina')).toBe('bosnia-and-herzegovina');
    const pages = pageCountries(COUNTRIES);
    expect(pages.length).toBeGreaterThan(190);
    const slugs = pages.map(countrySlug);
    expect(new Set(slugs).size).toBe(slugs.length); // no two countries share an address
    for (const s of slugs) expect(isCountryPath(`/country/${s}`)).toBe(true);
    expect(isCountryPath('/country/../etc/passwd')).toBe(false);
    expect(isCountryPath('/country/India')).toBe(false);
  });
});
