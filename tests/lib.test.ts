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
    expect(first).toMatch(/north-east of Spain/);
    expect(first).toMatch(/Western Europe/);
    expect(missHint('NLD', 'ESP', 2)).toMatch(/borders .*Germany|borders .*Belgium/);
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
