// The hard rules every marketing caption must pass (see marketing/voice.md). Pure, so the pack
// script and the tests share it: no banned names, no answers to today's puzzles, within the
// channel's length, and every link to GeoQuest tagged with its ?ref= so we can see what worked.

export interface CaptionCheck {
  /** Lower-case words/phrases that must not appear (voice.md "banned:" line). */
  banned: string[];
  /** Today's answers (country names, capitals) — must not appear anywhere. */
  secrets: string[];
  /** Maximum characters for this channel. */
  limit: number;
  /** The ref tag every GeoQuest link must carry, e.g. "tiktok-20261023". */
  ref: string;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const hasWord = (text: string, phrase: string) => new RegExp(`(^|[^a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(norm(text));

/** Everything wrong with a caption (empty: good to go). */
export function checkCaption(text: string, c: CaptionCheck): string[] {
  const out: string[] = [];
  if (!text.trim()) out.push('empty');
  if (text.length > c.limit) out.push(`too long (${text.length} > ${c.limit})`);
  for (const b of c.banned) if (b && hasWord(text, norm(b))) out.push(`banned: "${b}"`);
  for (const s of c.secrets) if (s && hasWord(text, norm(s))) out.push(`gives away today's answer: "${s}"`);
  const links = text.match(/https?:\/\/(?:www\.)?playgeoquest\.app[^\s)]*/gi) ?? [];
  for (const l of links) if (!new RegExp(`[?&]ref=${c.ref}(?:&|$)`).test(l)) out.push(`link without ?ref=${c.ref}: ${l}`);
  return out;
}

/** The "banned: a, b, c" line from voice.md. */
export const bannedFrom = (voice: string) => (voice.match(/^banned:\s*(.+)$/im)?.[1] ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
/** "caption limits: tiktok 300, reels 300, shorts 100" from a channel file. */
export function limitsFrom(md: string): Record<string, number> {
  const line = md.match(/^caption limits:\s*(.+)$/im)?.[1] ?? '';
  return Object.fromEntries(line.split(',').map((p) => p.trim().split(/\s+/)).filter((p) => p.length === 2 && Number(p[1]) > 0).map(([k, v]) => [k.toLowerCase(), Number(v)]));
}
/** The scene for a weekday from calendar.md's table ("| Monday | mystery | …"). */
export function sceneFor(calendar: string, date: Date): string | null {
  const day = date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const row = calendar.split('\n').find((l) => new RegExp(`^\\|\\s*${day}\\s*\\|`, 'i').test(l));
  return row?.split('|')[2]?.trim().toLowerCase() || null;
}
/** A tracked link: https://playgeoquest.app/?ref=tiktok-20261023 (plus any path/params). */
export const tagged = (ref: string, path = '/', params = '') => `https://playgeoquest.app${path}?${params ? `${params}&` : ''}ref=${ref}`;
