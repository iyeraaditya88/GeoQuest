// Sharing a game: one link format and one flow for every game. The share sheet where there is one,
// otherwise the clipboard. Shared texts carry scores and coloured squares — never the answers.
import { track } from './analytics';

import { GAME_PITCH, type ShareGame } from './shareGames';
export * from './shareGames';

/** A link that opens the game straight away (?game=…). */
export const gameLink = (g: ShareGame) => `${location.origin}/?game=${g}&ref=share`;
/** The invite for a game (from the games list): no score, just the pitch and the link. */
export const inviteText = (g: ShareGame) => `${GAME_PITCH[g].emoji} ${GAME_PITCH[g].name} on GeoQuest — ${GAME_PITCH[g].pitch}. Free, right in your browser — come play!\n${gameLink(g)}`;
/** A result to share: the score lines, a nudge, and the link. */
export const resultText = (g: ShareGame, lines: string, link = gameLink(g)) => `${lines}\nYour turn 🌍\n${link}`;

/** Share `text` (the share sheet, else the clipboard). 'copied' means the caller should say so. */
export async function shareText(game: ShareGame | string, text: string, kind: 'invite' | 'result' = 'result'): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  track('share', { g: game, k: kind });
  if (typeof navigator.share === 'function') {
    try { await navigator.share({ text }); return 'shared'; } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
      // Some browsers refuse (no user gesture, unsupported data): fall through to the clipboard.
    }
  }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return 'failed'; }
}

// ── Result lines for each game (scores and squares only — never the answers) ──
const fmt = (n: number) => n.toLocaleString('en-US');
/** "🏆 GeoQuest Top 5 — Longest rivers in Africa: 4/5" + a square per slot. */
export const top5Share = (title: string, found: boolean[]) =>
  `🏆 GeoQuest Top 5 — ${title}: ${found.filter(Boolean).length}/${found.length}\n${found.map((f) => (f ? '🟩' : '⬛')).join('')}`;
export const triviaShare = (score: number, correct: number, of: number, peak: string) =>
  `🧠 GeoQuest Trivia — ${fmt(score)} pts · ${correct}/${of} correct · reached ${peak}`;
export const capitalsShare = (score: number, of: number) =>
  `🏛️ GeoQuest Capitals — ${score}/${of}\n${'🟩'.repeat(score)}${'⬛'.repeat(Math.max(0, of - score))}`;
/** A square per country: 🟩 first try, 🟨 got it later, ⬛ missed. */
export const shapesShare = (points: number[], perCountry: number) =>
  `🧩 GeoQuest Guess the Country — ${points.reduce((s, p) => s + p, 0)}/${points.length * perCountry}\n${points.map((p) => (p >= perCountry ? '🟩' : p > 0 ? '🟨' : '⬛')).join('')}`;
/** A square per round by score (out of 5,000): no places, no distances. */
export const streetShare = (scores: number[]) =>
  `📍 GeoQuest Street View — ${fmt(scores.reduce((s, p) => s + p, 0))} / ${fmt(scores.length * 5000)}\n${scores.map((p) => (p >= 4000 ? '🟩' : p >= 2000 ? '🟨' : p > 0 ? '🟧' : '⬛')).join('')}`;
export const quizShare = (mode: string, score: number, rounds: number, best: number) =>
  `🗺️ GeoQuest Map quiz (${mode}) — ${score}/${rounds} found · best streak ${best}`;
