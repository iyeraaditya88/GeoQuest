// Record one marketing scene from GeoQuest as a vertical 1080×1920 video.
//
//   npx tsx scripts/marketing/record.mts <scene> [YYYY-MM-DD] [--url https://playgeoquest.app] [--out dir]
//
// Scenes: mystery, wordle-yesterday, fact, empires, eras, voyages (see marketing/calendar.md).
// The app runs in demo mode (?demo=1: no footer, nudges, music or analytics). Frames come straight
// from the browser at full phone resolution (not Playwright's low-bitrate recorder) and ffmpeg
// stitches them together, then lays the hook line over the start and adds the end card.
// Never shows today's answers: the mystery is a promotional practice case, the Wordle is yesterday's.
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium, type Page } from 'playwright';
import { BY_CCA3 } from '../../src/lib/data';
import { CURATED } from '../../src/data/curated';
import { addDays, localDate, seeded } from '../../src/lib/daily';
import { dailyWordle } from '../../src/lib/wordle';
import { dailyCase, makeCase } from '../../src/lib/mystery';
import { VOYAGES } from '../../src/lib/voyages';
import { ERAS } from '../../src/lib/eras';
import { EMPIRES } from '../../src/lib/empires';
import { endCard, hookCard } from './cards.mts';

export const SCENES = ['mystery', 'wordle-yesterday', 'fact', 'empires', 'eras', 'voyages'] as const;
export type Scene = (typeof SCENES)[number];
/** What the video shows — for the hook line and the captions (facts only from the app's data). */
export interface Subject { scene: Scene; title: string; hook: string; facts: string[]; secrets: string[]; path: string; params: string; select?: string }

const W = 1080, H = 1920, VW = 405, VH = 720; // a 9:16 phone, drawn at 1080×1920
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T,>(xs: T[], seed: string) => xs[Math.floor(seeded(seed)() * xs.length)];
const promoSeed = (date: string) => `promo-${date}`;

/** Today's answers (never to appear in a caption or on screen). */
export function todaysSecrets(date: string): string[] {
  const out: string[] = [];
  const w = BY_CCA3.get(dailyWordle(date));
  if (w) out.push(w.name, ...(w.capital[0] ? [w.capital[0]] : []));
  for (const level of [1, 2, 3, 4, 5]) for (const c of dailyCase(date, level).route) { const k = BY_CCA3.get(c); if (k) out.push(k.name); }
  return [...new Set(out)];
}

/** What a scene will show on a date (no browser needed). */
export function subjectFor(scene: Scene, date: string): Subject {
  const secrets = todaysSecrets(date);
  const yesterday = addDays(date, -1);
  const facty = Object.keys(CURATED).filter((k) => CURATED[k]?.fact && BY_CCA3.get(k) && !secrets.includes(BY_CCA3.get(k)!.name));
  if (scene === 'fact' || scene === 'wordle-yesterday') {
    const cca3 = scene === 'fact' ? pick(facty, `fact-${date}`) : dailyWordle(yesterday);
    const c = BY_CCA3.get(cca3)!, cur = CURATED[cca3];
    const facts = [cur?.fact, c.capital[0] && `Capital: ${c.capital[0]}`, `Population: about ${Math.round(c.population / 1e5) / 10} million`, cur?.river && `Longest river: ${cur.river}`].filter(Boolean) as string[];
    return scene === 'fact'
      ? { scene, title: c.name, hook: cur?.fact && cur.fact.length < 70 ? `${c.name}: ${cur.fact}` : `Can you find ${c.name} on a globe?`, facts, secrets, path: '/', params: '', select: cca3 }
      : { scene, title: `Yesterday's Geo Wordle: ${c.name}`, hook: 'Yesterday’s Geo Wordle answer… did you get it?', facts, secrets, path: '/', params: '', select: cca3 };
  }
  if (scene === 'empires') {
    const e = pick(EMPIRES, `empire-${date}`);
    return { scene, title: e.name, hook: `How big was the ${e.name.replace(/^The /, '')}, really?`, facts: [e.tagline, e.summary].filter(Boolean), secrets, path: '/', params: `explore=empires&id=${e.id}` };
  }
  if (scene === 'eras') {
    const e = pick(ERAS, `era-${date}`);
    return { scene, title: e.name, hook: `Where did people live in the ${e.name}?`, facts: [e.tagline, e.summary].filter(Boolean), secrets, path: '/', params: `explore=eras&id=${e.id}` };
  }
  if (scene === 'voyages') {
    const v = pick(VOYAGES, `voyage-${date}`);
    return { scene, title: `${v.voyager}: ${v.title}`, hook: `${v.voyager}’s voyage in 20 seconds`, facts: [v.tagline, v.story].filter(Boolean), secrets, path: '/', params: `explore=voyages&id=${v.id}` };
  }
  // mystery: a promotional practice case (never the Daily — that would give it away)
  const k = makeCase(promoSeed(date), 1);
  const first = BY_CCA3.get(k.route[0])!;
  return { scene: 'mystery', title: `The theft of ${k.item}`, hook: 'A thief stole a treasure. Can you track them across the world?', facts: [`The trail starts in ${first.capital[0]}, ${first.name}`, 'Witnesses give clues: capitals, flags, currencies, rivers', 'Name the thief at the hideout before the clock runs out'], secrets, path: '/', params: `game=mystery&case=${promoSeed(date)}` };
}

/** Grab frames from the browser while `act` runs. */
async function capture(page: Page, dir: string, act: () => Promise<void>) {
  const cdp = await page.context().newCDPSession(page);
  const frames: { t: number; file: string }[] = [];
  cdp.on('Page.screencastFrame', (f) => {
    const file = join(dir, `f${String(frames.length).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ t: f.metadata.timestamp ?? Date.now() / 1000, file });
    void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => null);
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  const t0 = Date.now() / 1000;
  await act();
  await cdp.send('Page.stopScreencast');
  return { frames, end: Date.now() / 1000, t0 };
}

/** Play the scene in the page (the browser is already showing the app). */
async function play(page: Page, scene: Scene, date: string, subject: Subject) {
  if (subject.select) {
    await sleep(2600); // the globe turning…
    await page.evaluate((c) => (window as unknown as { __demo?: { select: (c: string) => void } }).__demo?.select(c), subject.select);
    await sleep(9500); // …then swooping in to the country
    return;
  }
  if (scene === 'mystery') {
    const k = makeCase(promoSeed(date), 1);
    await sleep(4200); // the brief types itself out
    await page.click('.mx-brief .mx-go');
    await sleep(2600); // the city scene and the reticle
    const leg = k.legs[0];
    for (let i = 0; i < leg.witnesses.length; i++) { await page.locator('.mx-witness').nth(i).click(); await sleep(1500); }
    await page.click('.mx-actions .mx-go');
    await sleep(2400); // the departures board flaps into place
    const name = BY_CCA3.get(leg.to)!.name.toUpperCase().replace(/\s/g, '');
    const rows = page.locator('.mx-row');
    for (let i = 0; i < (await rows.count()); i++) {
      const t = (await rows.nth(i).locator('.mx-flap').innerText()).replace(/\s/g, '');
      if (t === name) { await rows.nth(i).click(); break; }
    }
    await sleep(6500); // the flight, and landing
    return;
  }
  if (scene === 'voyages') {
    await page.waitForSelector('.vy-tour', { timeout: 20000 });
    await sleep(2500);
    await page.click('.vy-tour'); // set sail
    await sleep(15000);
    return;
  }
  await sleep(scene === 'empires' || scene === 'eras' ? 14000 : 12000);
}

export interface Recording { video: string; still: string; seconds: number; subject: Subject }

export async function record(scene: Scene, date: string, base: string, outDir: string): Promise<Recording> {
  const subject = subjectFor(scene, date);
  const tmp = resolve(outDir, '.frames'); // absolute: ffmpeg's frame list is read relative to itself
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  // A GPU when there is one (much smoother globe); software rendering on servers.
  const browser = await chromium.launch({ args: ['--use-angle=default', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: W / VW, isMobile: true, hasTouch: true, timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone });
  // A returning visitor (no first-time hints), and for the mystery: yesterday's case.
  await context.addInitScript(() => { try { for (const k of ['gq-menu-seen', 'gq-play-seen', 'gq-trivia-seen']) localStorage.setItem(k, '1'); localStorage.setItem('gq-music', 'off'); } catch { /* */ } });
  const page = await context.newPage();
  const url = `${base.replace(/\/$/, '')}${subject.path}?demo=1&${subject.params}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // Film only once the scene is on screen (the globe's imagery can take a while to arrive).
  const ready = scene === 'mystery' ? '.mx-brief' : ['empires', 'eras', 'voyages'].includes(scene) ? '.voy-panel' : '.play-fab';
  await page.waitForSelector(ready, { timeout: 120000 });
  await sleep(scene === 'mystery' ? 300 : 900);
  const { frames, end } = await capture(page, tmp, () => play(page, scene, date, subject));
  await browser.close();
  if (frames.length < 10) throw new Error(`Only ${frames.length} frames captured — is the app reachable at ${base}?`);

  // Frames → video (each frame held until the next one arrived), then the hook and the end card.
  const list = frames.map((f, i) => `file '${f.file}'\nduration ${Math.max(0.001, (frames[i + 1]?.t ?? end) - f.t).toFixed(4)}`).join('\n') + `\nfile '${frames[frames.length - 1].file}'\n`;
  writeFileSync(join(tmp, 'list.txt'), list);
  const raw = join(tmp, 'raw.mp4');
  const ff = (args: string[]) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  ff(['-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt'), '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x050913,fps=30`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', raw]);
  writeFileSync(join(tmp, 'hook.png'), await hookCard(subject.hook));
  writeFileSync(join(tmp, 'end.png'), await endCard());
  const video = join(outDir, 'video.mp4');
  ff(['-i', raw, '-loop', '1', '-t', '2.5', '-i', join(tmp, 'end.png'), '-i', join(tmp, 'hook.png'), '-f', 'lavfi', '-t', '60', '-i', 'anullsrc=r=44100:cl=stereo',
    '-filter_complex', `[0:v][2:v]overlay=0:0:enable='between(t,0,3.6)'[a];[1:v]scale=${W}:${H},fps=30,format=yuv420p[b];[a][b]concat=n=2:v=1:a=0[v]`,
    '-map', '[v]', '-map', '3:a', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', video]);
  // A still from about two-thirds in (for the cover).
  const still = join(outDir, 'still.jpg');
  writeFileSync(still, readFileSync(frames[Math.floor(frames.length * 0.66)].file));
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).toString().trim());
  rmSync(tmp, { recursive: true, force: true });
  return { video, still, seconds, subject };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const [scene, maybeDate] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const opt = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
  if (!SCENES.includes(scene as Scene)) { console.error(`Scene: one of ${SCENES.join(', ')}`); process.exit(1); }
  const date = maybeDate && /^\d{4}-\d{2}-\d{2}$/.test(maybeDate) ? maybeDate : localDate();
  const out = opt('out') ?? join('marketing', 'packs', date);
  mkdirSync(out, { recursive: true });
  const r = await record(scene as Scene, date, opt('url') ?? 'https://playgeoquest.app', out);
  console.log(JSON.stringify({ video: r.video, seconds: r.seconds, hook: r.subject.hook }, null, 2));
}
