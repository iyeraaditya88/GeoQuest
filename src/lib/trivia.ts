// Geo Trivia: levels, scoring, and where an answer is on the globe. (Picking questions: triviaPick.)
import citiesRaw from '../data/cities.json';
import { COUNTRIES } from './data';

export const LEVELS = ['Easy', 'Medium', 'Hard', 'Impossible'] as const;
export type Level = (typeof LEVELS)[number];
export const POINTS = [100, 200, 300, 500];
export const ROUND = 10;
/** Correct answers in a row needed to move up a level (one miss moves you down). */
export const UP_AFTER = 2;

export interface TriviaQ { id: number; difficulty: Level; question: string; options: string[]; answer: string; kind?: string }

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
