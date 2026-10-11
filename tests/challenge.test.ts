import { describe, it, expect } from 'vitest';
import { challengeMessage, cleanName, decodeChallenge, encodeChallenge, newTargets, outcome, previewTitle } from '../src/lib/challenge';
import { challengePreview } from '../middleware';

const T = ['IND', 'FRA', 'BRA', 'JPN', 'EGY'];

describe('5-country challenge links', () => {
  it('round-trips the countries, the sender and their score', () => {
    const token = encodeChallenge({ targets: T, by: 'Snehil', points: [3, 2, 0, 1, 3] });
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain('IND'); // not readable at a glance in a chat
    expect(decodeChallenge(token)).toEqual({ targets: T, by: 'Snehil', points: [3, 2, 0, 1, 3] });
  });
  it('keeps non-English names, and drops anything odd from them', () => {
    expect(decodeChallenge(encodeChallenge({ targets: T, by: 'Zoë 李' }))?.by).toBe('Zoë 李');
    expect(cleanName('<b>Al"ex</b>')).toBe('bAlexb');
  });
  it('works without a sender or score', () => {
    expect(decodeChallenge(encodeChallenge({ targets: T }))).toEqual({ targets: T });
  });
  it('refuses broken or tampered links', () => {
    expect(decodeChallenge(null)).toBeNull();
    expect(decodeChallenge('not a token!')).toBeNull();
    expect(decodeChallenge(encodeChallenge({ targets: ['IND', 'IND', 'BRA', 'JPN', 'EGY'] }))).toBeNull();
    expect(decodeChallenge(encodeChallenge({ targets: T.slice(0, 4) }))).toBeNull();
    expect(decodeChallenge(encodeChallenge({ targets: T }), (c) => c !== 'EGY')).toBeNull();
    // A score that can't be real is dropped, the challenge still plays.
    const bad = btoa('1~IND.FRA.BRA.JPN.EGY~Max~99999').replace(/=+$/, '');
    expect(decodeChallenge(bad)).toEqual({ targets: T, by: 'Max' });
  });
  it('picks five different countries', () => {
    const seq = ['IND', 'IND', 'FRA', 'BRA', 'FRA', 'JPN', 'EGY'];
    let i = 0;
    expect(newTargets(() => seq[i++])).toEqual(T);
  });
  it('says who won, without spoiling the countries', () => {
    expect(outcome([3, 3, 3, 3, 3], [3, 3, 3, 3, 2])).toBe('win');
    expect(outcome([1, 1, 1, 1, 1], [1, 1, 1, 1, 1])).toBe('tie');
    expect(outcome([3, 3, 3, 3, 3])).toBeNull();
    const msg = challengeMessage([3, 2, 0, 1, 3], 'Snehil', [3, 3, 1, 0, 0]);
    expect(msg).toContain('I beat Snehil');
    expect(msg).toContain('🟩🟨⬛🟧🟩 9/15');
    expect(msg).not.toMatch(/India|France/);
    expect(challengeMessage([0, 0, 0, 0, 0])).toContain('I scored 0/15');
  });
  it('retitles the link preview for chat apps', () => {
    const html = '<title>GeoQuest</title><meta property="og:title" content="GeoQuest" /><meta name="twitter:title" content="GeoQuest" /><meta property="og:description" content="x" />';
    const token = encodeChallenge({ targets: T, by: 'Snehil', points: [3, 3, 3, 1, 1] });
    const out = challengePreview(html, token);
    expect(previewTitle(decodeChallenge(token)!)).toBe('⚔️ Snehil scored 11/15 — can you beat it?');
    expect(out.match(/Snehil scored 11\/15/g)).toHaveLength(3);
    expect(out).toContain('og:description" content="Find the same 5 countries');
    expect(challengePreview(html, 'junk')).toBe(html);
  });
});
