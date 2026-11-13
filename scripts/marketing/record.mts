// Record one marketing scene from GeoQuest as a vertical 1080×1920 video.
//
//   npx tsx scripts/marketing/record.mts <scene> [YYYY-MM-DD] [--url https://playgeoquest.app] [--out dir]
//
// Scenes: mystery, wordle-yesterday, fact, empires, eras, voyages (see marketing/calendar.md), and
// story — a narrated battle or voyage, from a chapter, with George's voice and its sound bed mixed in
// (--id lepanto [--chapter 1] [--seconds 30]; voyages: --id voyage:vasco-da-gama).
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
import { BATTLES } from '../../src/lib/battles';
import { WORLD_WARS } from '../../src/lib/worldWars';
import { ERAS } from '../../src/lib/eras';
import { EMPIRES } from '../../src/lib/empires';
import { endCard, hookCard } from './cards.mts';

export const SCENES = ['mystery', 'wordle-yesterday', 'fact', 'empires', 'eras', 'voyages', 'story'] as const;
export type Scene = (typeof SCENES)[number];
/** What the video shows — for the hook line and the captions (facts only from the app's data). */
export interface Subject { scene: Scene; title: string; hook: string; facts: string[]; secrets: string[]; path: string; params: string; select?: string; story?: StoryShot }
/** A narrated story to film: which clip George starts on, and for how long. */
export interface StoryShot { kind: 'battles' | 'voyages'; id: string; chapter: number; clip: string; startMs: number; seconds: number }
/** What to film instead of the day's pick (a chosen empire, voyage or story; a hand-written hook). */
export interface Choice { id?: string; chapter?: number; seconds?: number; hook?: string }
type Manifest = Record<string, { file: string; ms: number; lines?: string[]; bed?: string }>;
const manifest = (): Manifest => JSON.parse(readFileSync('narration/out/manifest.json', 'utf8'));

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
export function subjectFor(scene: Scene, date: string, choice: Choice = {}): Subject {
  const s = subjectOf(scene, date, choice);
  // (Nothing the captions are given names one of today's answers.)
  const facts = s.facts.filter((f) => !s.secrets.some((x) => f.toLowerCase().includes(x.toLowerCase())));
  return { ...s, facts, ...(choice.hook && { hook: choice.hook }) };
}
function subjectOf(scene: Scene, date: string, choice: Choice): Subject {
  const secrets = todaysSecrets(date);
  if (scene === 'story') {
    if (!choice.id) throw new Error('story: pass --id (a battle id, or voyage:<id>)');
    const voyage = choice.id.startsWith('voyage:'), id = choice.id.replace(/^voyage:/, ''), m = manifest();
    // (A battle told in chapters still has its older one-clip summary in the list: the chapters win.)
    const told = Object.keys(m).filter((k) => k.startsWith(`${voyage ? 'voyage' : 'battle'}:${id}:`));
    const clips = told.length ? told : Object.keys(m).filter((k) => k === `battle:${id}`);
    if (!clips.length) throw new Error(`story: no narration for ${choice.id}`);
    // (Battles: chapters 0, 1, 2…; voyages: the introduction, then one clip per stop.)
    const order = voyage ? [`voyage:${id}:intro`, ...clips.filter((k) => !k.endsWith(':intro')).sort((a, b) => Number(a.split(':')[2]) - Number(b.split(':')[2]))] : clips.sort((a, b) => Number(a.split(':')[2] ?? 0) - Number(b.split(':')[2] ?? 0));
    const chapter = Math.min(choice.chapter ?? 0, order.length - 1), clip = order[chapter];
    const startMs = order.slice(0, chapter).reduce((t, k) => t + m[k].ms, 0);
    const seconds = choice.seconds ?? Math.min(34, m[clip].ms / 1000 + 0.6);
    const v = voyage ? VOYAGES.find((x) => x.id === id) : null;
    const title = v ? `${v.voyager}: ${v.title}` : (BATTLES.find((b) => b.id === id)?.name ?? (WORLD_WARS as Record<string, { name: string }>)[id]?.name ?? id);
    return { scene, title, hook: v ? `${v.voyager}’s voyage, told on a 3D globe` : 'A battle, told on a 3D globe', facts: (m[clip].lines ?? []).slice(0, 4), secrets, path: '/', params: `explore=${voyage ? 'voyages' : 'battles'}&id=${id}`, story: { kind: voyage ? 'voyages' : 'battles', id, chapter, clip, startMs, seconds } };
  }
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
    const e = EMPIRES.find((x) => x.id === choice.id) ?? pick(EMPIRES, `empire-${date}`);
    return { scene, title: e.name, hook: `How big was the ${e.name.replace(/^The /, '')}, really?`, facts: [e.tagline, e.summary].filter(Boolean), secrets, path: '/', params: `explore=empires&id=${e.id}` };
  }
  if (scene === 'eras') {
    const e = ERAS.find((x) => x.id === choice.id) ?? pick(ERAS, `era-${date}`);
    return { scene, title: e.name, hook: `Where did people live in the ${e.name}?`, facts: [e.tagline, e.summary].filter(Boolean), secrets, path: '/', params: `explore=eras&id=${e.id}` };
  }
  if (scene === 'voyages') {
    const v = VOYAGES.find((x) => x.id === choice.id) ?? pick(VOYAGES, `voyage-${date}`);
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
    await page.evaluate(() => document.querySelector<HTMLButtonElement>('.vy-tour')?.click()); // set sail (hidden while filming)
    await sleep(15000);
    return;
  }
  if (scene === 'story') {
    const st = subject.story!;
    // Set sail (George begins): a voyage opened from a link waits on its big play button.
    if (st.kind === 'voyages' && st.startMs === 0) { await sleep(1500); await page.evaluate(() => (document.querySelector<HTMLButtonElement>('.start-story') ?? document.querySelector<HTMLButtonElement>('.vy-tour'))?.click()); }
    await sleep(st.seconds * 1000);
    return;
  }
  await sleep(scene === 'empires' || scene === 'eras' ? 14000 : 12000);
}

/** Press play, jump to the chapter (or stop), and wait for George to be speaking it. */
async function startStory(page: Page, st: StoryShot) {
  if (st.kind === 'voyages' && st.startMs === 0) return; // (it sets sail on camera)
  await page.evaluate(() => (document.querySelector<HTMLButtonElement>('.start-story') ?? document.querySelector<HTMLButtonElement>('.vy-tour'))?.click());
  if (st.startMs > 0) {
    await sleep(800);
    await page.evaluate((ms) => {
      const i = document.querySelector<HTMLInputElement>('.story-bar .sb-scrub input')!; // (hidden while filming, still there)
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(i, String(ms + 50));
      i.dispatchEvent(new Event('input', { bubbles: true }));
      i.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    }, st.startMs);
  }
  const file = manifest()[st.clip].file;
  await page.waitForFunction((f) => ((window as unknown as { __voice?: { e: string; file: string }[] }).__voice ?? []).some((x) => x.e === 'playing' && x.file === f), file, { timeout: 30000 });
}

/**
 * Note when the narration plays, pauses or jumps, and which clip file it is: the voice is mixed
 * into the video afterwards from the same files (the browser's own sound isn't in the frames).
 */
const LISTEN = () => {
  const w = window as unknown as { __voice: { t: number; e: string; file: string; at: number }[] };
  w.__voice = [];
  const files = new Map<string, string>();
  const blob = Response.prototype.blob;
  Response.prototype.blob = async function (this: Response) { const b = await blob.call(this); (b as Blob & { __url?: string }).__url = this.url; return b; };
  const make = URL.createObjectURL;
  URL.createObjectURL = (o: Blob | MediaSource) => { const u = make(o); const src = (o as Blob & { __url?: string }).__url; if (src) files.set(u, src); return u; };
  const seen = new WeakSet<HTMLMediaElement>();
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    if (!seen.has(this)) {
      seen.add(this);
      for (const e of ['playing', 'pause', 'seeked', 'ended']) this.addEventListener(e, () => {
        const file = (files.get(this.currentSrc) ?? this.currentSrc).split('/').pop() ?? '';
        if (file.endsWith('.mp3')) w.__voice.push({ t: Date.now() / 1000, e, file, at: this.currentTime });
      });
    }
    return play.call(this);
  };
};

/** The voice (and each clip's sound bed) as ffmpeg inputs and a filter, laid against the video's clock. */
function voiceMix(events: { t: number; e: string; file: string; at: number }[], t0: number, length: number, firstInput: number) {
  const m = manifest(), byFile = new Map(Object.values(m).map((c) => [c.file, c]));
  const segs: { file: string; at: number; from: number; to: number }[] = [];
  let open: { file: string; at: number; from: number } | null = null;
  const close = (t: number) => { if (open) segs.push({ ...open, to: t }); open = null; };
  for (const x of events) {
    if (x.e === 'playing' || (x.e === 'seeked' && open)) { close(x.t); open = { file: x.file, at: x.at, from: x.t }; }
    else if (x.e === 'pause' || x.e === 'ended') close(x.t);
  }
  close(t0 + length);
  const inputs: string[] = [], parts: string[] = [], labels: string[] = [];
  let n = firstInput;
  for (const g of segs) {
    let from = g.from - t0, at = g.at;
    if (from < 0) { at -= from; from = 0; } // (already speaking when filming began)
    const dur = Math.min(g.to - t0, length) - from;
    if (dur <= 0.2) continue;
    inputs.push('-i', join('narration', 'out', g.file));
    parts.push(`[${n}:a]atrim=start=${at.toFixed(3)}:duration=${dur.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${Math.round(from * 1000)}:all=1[v${n}]`);
    labels.push(`[v${n}]`); n++;
    const bed = byFile.get(g.file)?.bed;
    if (bed) {
      inputs.push('-stream_loop', '-1', '-i', join('narration', 'sfx', `${bed}.mp3`));
      parts.push(`[${n}:a]atrim=duration=${(length - from).toFixed(3)},asetpts=PTS-STARTPTS,volume=0.22,afade=t=in:d=1.2,adelay=${Math.round(from * 1000)}:all=1[v${n}]`);
      labels.push(`[v${n}]`); n++;
    }
  }
  if (!labels.length) return null;
  return { inputs, filter: `${parts.join(';')};${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,loudnorm=I=-15:TP=-1.5:LRA=11,aresample=44100` };
}

export interface Recording { video: string; still: string; seconds: number; subject: Subject }

export async function record(scene: Scene, date: string, base: string, outDir: string, choice: Choice = {}): Promise<Recording> {
  const subject = subjectFor(scene, date, choice);
  const tmp = resolve(outDir, '.frames'); // absolute: ffmpeg's frame list is read relative to itself
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  // A GPU when there is one (much smoother globe); software rendering on servers.
  const browser = await chromium.launch({ args: ['--use-angle=default', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: W / VW, isMobile: true, hasTouch: true, timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone });
  // A returning visitor (no first-time hints), and for the mystery: yesterday's case.
  await context.addInitScript(() => { try { for (const k of ['gq-menu-seen', 'gq-play-seen', 'gq-trivia-seen']) localStorage.setItem(k, '1'); localStorage.setItem('gq-music', 'off'); } catch { /* */ } });
  if (subject.story) await context.addInitScript(LISTEN);
  const page = await context.newPage();
  const url = `${base.replace(/\/$/, '')}${subject.path}?demo=1&${subject.params}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // Film only once the scene is on screen (the globe's imagery can take a while to arrive).
  const ready = scene === 'mystery' ? '.mx-brief' : subject.story ? '.start-story' : ['empires', 'eras', 'voyages', 'story'].includes(scene) ? '.voy-panel' : '.play-fab';
  await page.waitForSelector(ready, { timeout: 120000 });
  await sleep(scene === 'mystery' ? 300 : 900);
  if (subject.story) { await sleep(2500); await startStory(page, subject.story); }
  const { frames, end } = await capture(page, tmp, () => play(page, scene, date, subject));
  const voice = subject.story ? await page.evaluate(() => (window as unknown as { __voice: { t: number; e: string; file: string; at: number }[] }).__voice) : [];
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
  // The sound: George and his bed where there's narration (fading out over the end card), else silence.
  const length = end - frames[0].t, total = length + 2.5;
  const mix = voiceMix(voice, frames[0].t, length, 4);
  const audio = mix
    ? { inputs: mix.inputs, filter: `;${mix.filter},apad=whole_dur=${total.toFixed(2)},afade=t=out:st=${(length - 0.4).toFixed(2)}:d=2.6[aud]`, map: '[aud]' }
    : { inputs: [], filter: '', map: '3:a' };
  ff(['-i', raw, '-loop', '1', '-t', '2.5', '-i', join(tmp, 'end.png'), '-i', join(tmp, 'hook.png'), '-f', 'lavfi', '-t', '60', '-i', 'anullsrc=r=44100:cl=stereo', ...audio.inputs,
    '-filter_complex', `[0:v][2:v]overlay=0:0:enable='between(t,0,3.6)'[a];[1:v]scale=${W}:${H},fps=30,format=yuv420p[b];[a][b]concat=n=2:v=1:a=0[v]${audio.filter}`,
    '-map', '[v]', '-map', audio.map, '-t', total.toFixed(2), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', video]);
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
  const choice: Choice = { id: opt('id'), chapter: opt('chapter') ? Number(opt('chapter')) : undefined, seconds: opt('seconds') ? Number(opt('seconds')) : undefined, hook: opt('hook') };
  const r = await record(scene as Scene, date, opt('url') ?? 'https://playgeoquest.app', out, choice);
  console.log(JSON.stringify({ video: r.video, seconds: r.seconds, hook: r.subject.hook }, null, 2));
}
