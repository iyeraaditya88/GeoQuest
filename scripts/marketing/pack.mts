// Make the day's content pack: the video, a cover, and a caption per channel — each with its own
// tracked link — checked against marketing/voice.md's hard rules.
//
//   npx tsx scripts/marketing/pack.mts [YYYY-MM-DD] [--scene mystery] [--url https://playgeoquest.app]
//
// Output: marketing/packs/<date>/{video.mp4, cover.png, captions.json, captions.md}
// You post it yourself; nothing here posts anywhere.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { localDate } from '../../src/lib/daily';
import { bannedFrom, checkCaption, limitsFrom, sceneFor, tagged } from '../../src/lib/marketingRules';
import { record, SCENES, type Scene, type Subject } from './record.mts';
import { coverCard } from './cards.mts';

const MODEL = 'claude-haiku-5-5'; // the same model the app's Ask the Atlas uses
const CHANNELS = ['tiktok', 'reels', 'shorts'] as const;
type Channel = (typeof CHANNELS)[number];
const read = (p: string) => readFileSync(join('marketing', p), 'utf8');

export interface PackCaption { channel: Channel; caption: string; link: string; problems: string[] }
export interface Pack { date: string; scene: Scene; hook: string; title: string; seconds: number; video: string; cover: string; captions: PackCaption[] }

/** A safe caption when Claude isn't available or keeps breaking a rule. */
const fallback = (s: Subject, ch: Channel, link: string) =>
  ch === 'shorts' ? `${s.hook.slice(0, 60)} #geography #shorts`
    : `${s.hook}\n\n${s.facts[0] ?? ''}\n\nPlay free on a 3D globe — link in bio.\n#geography #maps #dailypuzzle #trivia`.replace(/\n\n\n/g, '\n\n');

async function writeCaptions(s: Subject, date: string): Promise<PackCaption[]> {
  const voice = read('voice.md'), shorts = read('channels/shorts.md');
  const banned = bannedFrom(voice), limits = limitsFrom(shorts);
  const stamp = date.replace(/-/g, '');
  const links = Object.fromEntries(CHANNELS.map((c) => [c, tagged(`${c}-${stamp}`)])) as Record<Channel, string>;
  if (existsSync('.env')) process.loadEnvFile('.env'); // (the key stays in the environment; never printed)
  const ai = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

  const ask = async (feedback = ''): Promise<Record<Channel, string> | null> => {
    if (!ai) return null;
    const msg = await ai.messages.create({
      model: MODEL, max_tokens: 900,
      system: `You write short social captions for GeoQuest, a free 3D geography game.\n\n${voice}\n\n${shorts}\n\nReply with JSON only: {"tiktok": "...", "reels": "...", "shorts": "..."}. For "shorts" write the YouTube Shorts title (under ${limits.shorts ?? 100} characters). Do not include any links; they are added for you. Use only the facts given.`,
      messages: [{ role: 'user', content: `The video (${s.scene}): ${s.title}\nOn-screen hook: "${s.hook}"\nFacts you may use (and nothing else):\n${s.facts.map((f) => `- ${f}`).join('\n')}\nNever mention: ${s.secrets.join(', ') || '(none)'}${feedback ? `\n\nYour last attempt broke these rules — fix them:\n${feedback}` : ''}` }],
    });
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    try { return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { return null; }
  };
  const check = (ch: Channel, caption: string) => checkCaption(caption, { banned, secrets: s.secrets, limit: limits[ch] ?? 300, ref: `${ch}-${stamp}` });

  let got = await ask().catch(() => null);
  const problems = (g: Record<Channel, string> | null) => CHANNELS.flatMap((c) => (g?.[c] ? check(c, g[c]).map((p) => `${c}: ${p}`) : [`${c}: missing`]));
  if (got && problems(got).length) got = (await ask(problems(got).join('\n')).catch(() => null)) ?? got;
  return CHANNELS.map((channel) => {
    let caption = got?.[channel]?.trim() ?? '';
    let issues = caption ? check(channel, caption) : ['missing'];
    if (issues.length) { caption = fallback(s, channel, links[channel]); issues = check(channel, caption); }
    return { channel, caption, link: links[channel], problems: issues };
  });
}

export async function makePack(date: string, base: string, sceneArg?: string): Promise<Pack> {
  const scene = (sceneArg ?? sceneFor(read('calendar.md'), new Date(`${date}T12:00:00Z`)) ?? 'fact') as Scene;
  if (!SCENES.includes(scene)) throw new Error(`Unknown scene "${scene}" (calendar.md): use one of ${SCENES.join(', ')}`);
  const dir = join('marketing', 'packs', date);
  mkdirSync(dir, { recursive: true });
  const rec = await record(scene, date, base, dir);
  const cover = join(dir, 'cover.png');
  writeFileSync(cover, await coverCard(readFileSync(rec.still), rec.subject.hook));
  const captions = await writeCaptions(rec.subject, date);
  const pack: Pack = { date, scene, hook: rec.subject.hook, title: rec.subject.title, seconds: Math.round(rec.seconds * 10) / 10, video: rec.video, cover, captions };
  writeFileSync(join(dir, 'captions.json'), JSON.stringify(pack, null, 2));
  const label: Record<Channel, string> = { tiktok: 'TikTok', reels: 'Instagram Reels', shorts: 'YouTube Shorts (title)' };
  writeFileSync(join(dir, 'captions.md'), [
    `# Content pack — ${date}`, '', `**Scene:** ${scene} — ${rec.subject.title}  `, `**Video:** video.mp4 (${pack.seconds} s) · **Cover:** cover.png`, '',
    ...captions.flatMap((c) => [`## ${label[c.channel]}`, '', '```', c.caption, '```', '', `Link (put in bio / description): ${c.link}`, ...(c.problems.length ? ['', `⚠️ ${c.problems.join('; ')}`] : []), '']),
  ].join('\n'));
  return pack;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
  const date = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? localDate();
  const pack = await makePack(date, opt('url') ?? 'https://playgeoquest.app', opt('scene'));
  console.log(JSON.stringify({ dir: join('marketing', 'packs', date), scene: pack.scene, seconds: pack.seconds, captions: pack.captions.map((c) => ({ channel: c.channel, ok: !c.problems.length })) }, null, 2));
}
