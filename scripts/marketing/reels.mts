// A set of chosen videos (rather than the day's pick): each one recorded, with its cover and
// captions, into marketing/packs/reels/<n>-<name>/. Edit SET to make a different set.
//
//   npx tsx scripts/marketing/reels.mts [--url https://playgeoquest.app] [--only 2]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { localDate } from '../../src/lib/daily';
import { record, type Choice, type Scene } from './record.mts';
import { coverCard } from './cards.mts';
import { captionsMd, writeCaptions, type Pack } from './pack.mts';

const SET: { name: string; scene: Scene; choice: Choice }[] = [
  { name: 'trafalgar', scene: 'story', choice: { id: 'trafalgar', chapter: 1, hook: 'Outnumbered 33 to 27, Nelson sails straight at them' } },
  { name: 'lepanto', scene: 'story', choice: { id: 'lepanto', chapter: 0, hook: '251 galleys against 206. Who wins?' } },
  { name: 'vasco-da-gama', scene: 'story', choice: { id: 'voyage:vasco-da-gama', chapter: 7, seconds: 32, hook: 'A pilot, the monsoon, and 23 days to India' } },
  { name: 'mystery', scene: 'mystery', choice: {} },
  { name: 'normandy', scene: 'story', choice: { id: 'normandy', chapter: 1, hook: '156,000 troops. Five beaches. One morning.' } },
];

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const base = opt('url') ?? 'https://playgeoquest.app', only = opt('only'), date = localDate();
for (const [i, v] of SET.entries()) {
  if (only && Number(only) !== i + 1) continue;
  const dir = join('marketing', 'packs', 'reels', `${i + 1}-${v.name}`);
  mkdirSync(dir, { recursive: true });
  const rec = await record(v.scene, date, base, dir, v.choice);
  const cover = join(dir, 'cover.png');
  writeFileSync(cover, await coverCard(readFileSync(rec.still), rec.subject.hook));
  const captions = await writeCaptions(rec.subject, date, v.name);
  const pack: Pack = { date, scene: v.scene, hook: rec.subject.hook, title: rec.subject.title, seconds: Math.round(rec.seconds * 10) / 10, video: rec.video, cover, captions };
  writeFileSync(join(dir, 'captions.json'), JSON.stringify(pack, null, 2));
  writeFileSync(join(dir, 'captions.md'), captionsMd(pack, `# ${i + 1}. ${v.name}`));
  console.log(`${i + 1}. ${v.name}: ${pack.seconds} s, captions ${captions.every((c) => !c.problems.length) ? 'ok' : 'need a look'}`);
}
