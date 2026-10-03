// Geo Trivia: question bank, "always something new" picking, and adaptive difficulty.
import bank from '../../geography_trivia_bank.json';
import citiesRaw from '../data/cities.json';
import { COUNTRIES } from './data';

export const LEVELS = ['Easy', 'Medium', 'Hard', 'Impossible'] as const;
export type Level = (typeof LEVELS)[number];
export const POINTS = [100, 200, 300, 500];
export const ROUND = 10;
/** Correct answers in a row needed to move up a level (one miss moves you down). */
export const UP_AFTER = 2;

export interface TriviaQ { id: number; difficulty: Level; question: string; options: string[]; answer: string }

// Only well-formed questions make it in (answer must be one of the options).
export const QUESTIONS: TriviaQ[] = (bank as TriviaQ[]).filter(
  (q) => LEVELS.includes(q.difficulty) && q.options.length >= 2 && q.options.includes(q.answer),
);

// ── "Always new": remember what this browser has seen, least-recent first ──
const SEEN_KEY = 'gq-trivia-seen';
function loadSeen(): number[] {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as number[]; } catch { return []; }
}
function markSeen(id: number) {
  const seen = loadSeen().filter((x) => x !== id);
  seen.push(id);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { /* private mode */ }
}

const shuffle = <T,>(xs: T[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/**
 * Next question at `level` (0–3), never one already asked this round. Prefers questions
 * this browser has never seen; once a level is exhausted, the one seen longest ago.
 * Falls back to the nearest level if a level has nothing left this round.
 */
export function nextQuestion(level: number, askedThisRound: Set<number>): TriviaQ | null {
  const seen = loadSeen();
  const order = new Map(seen.map((id, i) => [id, i]));
  for (const lv of [level, level - 1, level + 1, level - 2, level + 2, level - 3, level + 3]) {
    if (lv < 0 || lv >= LEVELS.length) continue;
    const pool = QUESTIONS.filter((q) => q.difficulty === LEVELS[lv] && !askedThisRound.has(q.id));
    if (!pool.length) continue;
    const fresh = pool.filter((q) => !order.has(q.id));
    const pick = fresh.length
      ? fresh[Math.floor(Math.random() * fresh.length)]
      : pool.sort((a, b) => order.get(a.id)! - order.get(b.id)!)[0]; // least recently seen
    markSeen(pick.id);
    return { ...pick, options: shuffle(pick.options) };
  }
  return null;
}

export function loadBest() { try { return Number(localStorage.getItem('gq-trivia-best') ?? 0); } catch { return 0; } }
export function saveBest(n: number) { try { localStorage.setItem('gq-trivia-best', String(n)); } catch { /* ignore */ } }

// ── Show the answer on the globe when it's a place we know ──
type City = [string, number, number, number, number, 0 | 1, string];
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').replace(/^the\s+/, '').trim();

/** Seas, rivers, ranges… that aren't countries or cities: [lat, lng, camera altitude]. */
const FEATURES_AT: Record<string, [number, number, number]> = {
  'pacific ocean': [0, -160, 2.2], 'atlantic ocean': [15, -40, 2], 'indian ocean': [-20, 80, 2], 'arctic ocean': [85, 0, 1.8], 'southern ocean': [-65, 60, 2],
  'mediterranean sea': [35, 18, 1.1], 'aegean sea': [39, 25, 0.6], 'red sea': [20, 38.5, 0.9], 'caspian sea': [41.5, 51, 0.8], 'dead sea': [31.5, 35.5, 0.4],
  'strait of gibraltar': [35.97, -5.6, 0.35], 'cook strait': [-41.2, 174.5, 0.4], 'mariana trench': [11.35, 142.2, 0.8],
  'nile river': [25, 32.7, 1], 'nile': [25, 32.7, 1], 'amazon river': [-3, -60, 1.1], 'indus river': [27, 68.3, 0.9], 'danube river': [45.5, 22, 0.8],
  'mount everest': [27.99, 86.93, 0.45], 'denali': [63.07, -151, 0.5], 'ural mountains': [60, 59.5, 1], 'himalayas': [28.6, 84.3, 0.8], 'andes': [-20, -68, 1.4],
  'sahara desert': [23, 13, 1.1], 'sahara': [23, 13, 1.1], 'sicily': [37.6, 14.1, 0.45], 'borneo': [0.9, 114, 0.8], 'kyushu': [32.6, 130.8, 0.5],
  'alaska': [64, -152, 0.9], 'south america': [-15, -60, 1.6], 'africa': [5, 20, 1.6], 'europe': [50, 15, 1.4], 'asia': [40, 90, 1.8],
  'oceania': [-22, 140, 1.6], 'antarctica': [-82, 0, 1.6], 'north america': [45, -100, 1.6],
  'astana': [51.17, 71.45, 0.8], 'nur-sultan': [51.17, 71.45, 0.8],
};

export function placeFor(answer: string): { cca3: string } | { lat: number; lng: number; alt: number } | null {
  const full = norm(answer);
  // "Quito, Ecuador" → also try "quito"
  for (const n of [full, full.split(',')[0].trim()]) {
    const country = COUNTRIES.find((c) => norm(c.name) === n || norm(c.official) === n);
    if (country) return { cca3: country.cca3 };
    const f = FEATURES_AT[n];
    if (f) return { lat: f[0], lng: f[1], alt: f[2] };
    const city = (citiesRaw as City[]).filter((c) => norm(c[0]) === n).sort((a, b) => b[3] - a[3])[0];
    if (city) return { lat: city[1], lng: city[2], alt: 0.9 };
  }
  return null;
}
