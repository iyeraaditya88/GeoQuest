// The promo ad's footage: each feature filmed clean in a phone-sized browser, at full resolution,
// into marketing/ad/shots/<name>.mp4 (30 fps). The clock is set back a month while filming, so the
// Daily and the Geo Wordle on screen are old puzzles — never today's answers.
//
//   npx tsx scripts/marketing/ad-shots.mts [--url http://localhost:5173] [--only wordle]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium, type Page } from 'playwright';
import { BY_CCA3 } from '../../src/lib/data';
import { addDays, dailyPicks, localDate } from '../../src/lib/daily';
import { QUIZ_POOL } from '../../src/lib/quiz';
import { dailyWordle, letters, WORDLE_POOL } from '../../src/lib/wordle';
import { makeCase } from '../../src/lib/mystery';

const W = 1080, H = 1920, VW = 405, VH = 720;
const BACK_DAYS = 35; // how far the clock is set back while filming
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const BASE = (opt('url') ?? 'http://localhost:5173').replace(/\/$/, '');
const OUT = resolve('marketing', 'ad', 'shots');
const day = addDays(localDate(), -BACK_DAYS);

/** Grab frames while `act` runs, then make them a 30 fps video. */
async function film(page: Page, name: string, act: () => Promise<void>) {
  const tmp = join(OUT, `.${name}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames: { t: number; file: string }[] = [];
  let done = false;
  cdp.on('Page.screencastFrame', (f) => {
    if (done) return; // (a frame still on its way after filming stopped)
    const file = join(tmp, `f${String(frames.length).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ t: f.metadata.timestamp ?? Date.now() / 1000, file });
    void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => null);
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  await act();
  await cdp.send('Page.stopScreencast');
  done = true;
  await cdp.detach().catch(() => null);
  const end = Date.now() / 1000;
  const list = frames.map((f, i) => `file '${f.file}'\nduration ${Math.max(0.001, (frames[i + 1]?.t ?? end) - f.t).toFixed(4)}`).join('\n') + `\nfile '${frames[frames.length - 1].file}'\n`;
  writeFileSync(join(tmp, 'list.txt'), list);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt'),
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x050913,fps=30`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '14', join(OUT, `${name}.mp4`)]);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`${name}: ${frames.length} frames, ${(end - frames[0].t).toFixed(1)} s`);
}

/** A phone, a returning visitor, music off, and the clock a month back. */
async function phone(browser: Awaited<ReturnType<typeof chromium.launch>>, url: string) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: W / VW, isMobile: true, hasTouch: true });
  // (As text: a function passed from here gets the bundler's helpers, which the page doesn't have.)
  await ctx.addInitScript(`
    try { for (const k of ['gq-menu-seen', 'gq-play-seen', 'gq-trivia-seen', 'gq-wordle-seen']) localStorage.setItem(k, '1'); localStorage.setItem('gq-music', 'off'); } catch {}
    (() => {
      const shift = ${-BACK_DAYS} * 86400000, Real = Date, now = () => Real.now() + shift;
      function Shifted(...a) { return new.target ? (a.length ? new Real(...a) : new Real(now())) : new Real(now()).toString(); }
      Shifted.prototype = Real.prototype;
      Object.setPrototypeOf(Shifted, Real);
      Shifted.now = now;
      globalThis.Date = Shifted;
    })();
  `);
  const page = await ctx.newPage();
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' });
  const seen = await page.evaluate('new Date().toLocaleDateString("en-CA")');
  if (seen !== day) throw new Error(`the page thinks it's ${seen}, not ${day}: today's puzzles would show`);
  return page;
}
const demo = (page: Page) => page.evaluate.bind(page) as Page['evaluate'];

const SHOTS: Record<string, (b: Awaited<ReturnType<typeof chromium.launch>>) => Promise<void>> = {
  // The globe alone, turning: the opening.
  async globe(b) {
    const page = await phone(b, '/?demo=1');
    await page.waitForSelector('.play-fab', { timeout: 120000 });
    await page.addStyleTag({ content: '.demo :is(.today-top, .fab-row, .play-fab, .ask-fab, .dock, .hint, .music-fab, .fo-fab, .signin-fab, .friends-fab, .app-legal, .fb-fab, .top-right, .corner-btns) { display: none !important; }' });
    await sleep(4000);
    await film(page, 'globe', () => sleep(7000));
    await page.context().close();
  },
  // The Daily: the button at the top, the first country found, the next one asked.
  async daily(b) {
    const page = await phone(b, '/?demo=1');
    await page.waitForSelector('.daily-top', { timeout: 120000 });
    await sleep(3500);
    const targets = dailyPicks(day, QUIZ_POOL).targets;
    await film(page, 'daily', async () => {
      await sleep(1200);
      await page.click('.daily-top');
      await sleep(3200); // the first country asked, the globe turning
      await demo(page)((c) => (window as unknown as { __demo: { answer: (c: string) => void } }).__demo.answer(c), targets[0]);
      await sleep(3000); // found: it lights up
      await demo(page)((c) => (window as unknown as { __demo: { answer: (c: string) => void } }).__demo.answer(c), targets[1]);
      await sleep(2600);
    });
    console.log(`  (the Daily of ${day}: ${targets.slice(0, 2).map((c) => BY_CCA3.get(c)?.name).join(', ')})`);
    await page.context().close();
  },
  // Geo Wordle: two near misses, then the answer, tiles flipping.
  async wordle(b) {
    const page = await phone(b, '/?demo=1&game=wordle');
    await page.waitForSelector('.gw-grid', { timeout: 120000 });
    await sleep(2500);
    const answer = letters(BY_CCA3.get(dailyWordle(day))!.name);
    const same = WORDLE_POOL.map((c) => letters(BY_CCA3.get(c)!.name)).filter((w) => w.length === answer.length && w !== answer);
    // (Misses that share some letters with the answer: yellows and greens on the way.)
    const score = (w: string) => [...w].filter((ch, i) => answer[i] === ch).length * 2 + [...new Set(w)].filter((ch) => answer.includes(ch)).length;
    const misses = same.sort((x, y) => score(y) - score(x)).slice(0, 2).reverse();
    await film(page, 'wordle', async () => {
      await sleep(800);
      for (const w of [...misses, answer]) {
        for (const ch of w) { await page.keyboard.press(ch); await sleep(110); }
        await page.keyboard.press('Enter');
        await sleep(2300);
      }
      await sleep(1500);
    });
    console.log(`  (the Geo Wordle of ${day}: ${misses.join(', ')} → ${answer})`);
    await page.context().close();
  },
  // The Mystery: the case, the witnesses, the departures board, the flight.
  async mystery(b) {
    const seed = `promo-ad-${day}`;
    const page = await phone(b, `/?demo=1&game=mystery&case=${seed}`);
    await page.waitForSelector('.mx-brief', { timeout: 120000 });
    await sleep(800);
    const k = makeCase(seed, 1), leg = k.legs[0];
    await film(page, 'mystery', async () => {
      await sleep(2600);
      await page.click('.mx-brief .mx-go');
      await sleep(2400);
      for (let i = 0; i < leg.witnesses.length; i++) { await page.locator('.mx-witness').nth(i).click(); await sleep(1300); }
      await page.click('.mx-actions .mx-go');
      await sleep(2200);
      const name = BY_CCA3.get(leg.to)!.name.toUpperCase().replace(/\s/g, '');
      const rows = page.locator('.mx-row');
      for (let i = 0; i < (await rows.count()); i++) if ((await rows.nth(i).locator('.mx-flap').innerText()).replace(/\s/g, '') === name) { await rows.nth(i).click(); break; }
      await sleep(6500);
    });
    await page.context().close();
  },
  // History: D-Day — the armada crosses, the paratroopers drop, the beaches named (George's words on screen).
  async history(b) {
    const page = await phone(b, '/?demo=1&explore=battles&id=normandy');
    await page.waitForSelector('.start-story', { timeout: 120000 });
    await sleep(3000);
    await page.click('.start-story');
    await sleep(800);
    await page.evaluate(() => {
      const i = document.querySelector<HTMLInputElement>('.story-bar .sb-scrub input')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(i, String(Number(i.max) * 0.39));
      i.dispatchEvent(new Event('input', { bubbles: true }));
      i.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    });
    await sleep(1500);
    await film(page, 'history', () => sleep(14000));
    await page.context().close();
  },
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=default', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
for (const [name, shot] of Object.entries(SHOTS)) if (!opt('only') || opt('only') === name) await shot(browser);
await browser.close();
