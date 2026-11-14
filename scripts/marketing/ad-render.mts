// The promo ad, put together: the filmed shots (ad-shots.mts) in a floating phone, kinetic type, an
// end card, George's voiceover and the score (ad-audio.mts). Each frame is drawn by a page (ad.html
// below) and photographed, 30 a second, so every move is exact.
//
//   npx tsx scripts/marketing/ad-render.mts [--cut long|short] [--vo vo-warm] [--music music-a] [--preview 12.5]
//
// Output: marketing/ad/geoquest-ad.mp4 (1080×1920). Everything that matters stays in Instagram's safe
// area: the middle 4:5 (y 285–1635, what the grid shows), above the caption (~1540), left of the buttons. --preview <s>: one frame as a PNG, nothing else.
import { existsSync, mkdirSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const W = 1080, H = 1920, FPS = 30;
const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const AD = resolve('marketing', 'ad'), SHOTS = join(AD, 'shots');
const ff = (a: string[]) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a], { stdio: 'inherit' });

// ── The cut: what's on screen when (seconds) ──
// Each scene: a kicker and a headline over the phone, and the footage inside it as pieces of shots
// [shot, from, to, speed] played one after another.
type Piece = [shot: string, from: number, to: number, speed?: number];
interface Scene { id: string; at: number; until: number; kicker?: string; head: string; gold?: string; pieces: Piece[] }
// Two cuts: the full 30 s, and a fast one for Reels (about 17 s, cuts every ~3 s, quick moves). The
// short one takes the score from its liveliest stretch to its own ending.
const CUTS: Record<string, { length: number; musicFrom: number; pace: number; out: string; scenes: Scene[]; lines: [number, number, number][] }> = {
  long: {
    length: 30, musicFrom: 0, pace: 1, out: 'geoquest-ad.mp4',
    scenes: [
      { id: 'intro', at: 0, until: 3.3, head: 'The whole world', gold: 'is your game board.', pieces: [['globe', 0.5, 4.0, 1.06]] },
      { id: 'daily', at: 3.3, until: 8.6, kicker: 'Daily challenge', head: 'A new challenge,', gold: 'every day.', pieces: [['daily', 0.9, 6.2]] },
      { id: 'wordle', at: 8.6, until: 13.8, kicker: 'Geo Wordle', head: 'Guess the country', gold: 'in six.', pieces: [['wordle', 0.7, 11.1, 2.0]] },
      { id: 'mystery', at: 13.8, until: 19.3, kicker: 'Solve the Mystery', head: 'Chase a thief', gold: 'across the globe.', pieces: [['mystery', 6.4, 9.0], ['mystery', 12.1, 15.0]] },
      { id: 'history', at: 19.3, until: 25.0, kicker: 'History, narrated', head: 'Watch history unfold', gold: 'on the map.', pieces: [['history', 0.4, 6.1]] },
      { id: 'end', at: 25.0, until: 30, head: 'GeoQuest', pieces: [['globe', 0, 5.0, 0.6]] },
    ],
    // George's lines, as [from, to] in the take, and where each lands in the ad (vo-warm's pauses).
    lines: [[0.0, 0.8, 0.35], [1.08, 2.03, 1.45], [2.5, 4.07, 3.75], [4.4, 5.8, 9.0], [6.38, 7.9, 14.15], [8.25, 11.25, 19.7], [11.88, 12.8, 25.55], [13.38, 15.98, 26.55]],
  },
  short: {
    length: 17.3, musicFrom: 10.5, pace: 0.55, out: 'geoquest-ad-short.mp4',
    scenes: [
      { id: 'intro', at: 0, until: 1.75, head: 'The whole world', gold: 'is your game board.', pieces: [['globe', 0.5, 2.6, 1.2]] },
      { id: 'daily', at: 1.75, until: 4.55, kicker: 'Daily challenge', head: 'A new challenge,', gold: 'every day.', pieces: [['daily', 1.0, 2.2, 1.2], ['daily', 4.3, 5.9]] },
      { id: 'wordle', at: 4.55, until: 7.35, kicker: 'Geo Wordle', head: 'Guess the country', gold: 'in six.', pieces: [['wordle', 0.7, 3.5, 2.4], ['wordle', 8.9, 12.4, 2.15]] },
      { id: 'mystery', at: 7.35, until: 10.15, kicker: 'Solve the Mystery', head: 'Chase a thief', gold: 'across the globe.', pieces: [['mystery', 6.7, 8.1], ['mystery', 12.4, 14.2, 1.3]] },
      { id: 'history', at: 10.15, until: 13.5, kicker: 'History, narrated', head: 'Watch history unfold', gold: 'on the map.', pieces: [['history', 0.4, 3.75]] },
      { id: 'end', at: 13.5, until: 17.3, head: 'GeoQuest', pieces: [['globe', 0, 3.8, 0.6]] },
    ],
    lines: [[0.0, 0.8, 0.1], [1.08, 2.03, 0.8], [2.5, 4.07, 1.95], [4.4, 5.8, 4.7], [6.38, 7.9, 7.5], [8.25, 11.25, 10.3], [11.88, 12.8, 13.6], [13.38, 15.98, 14.6]],
  },
};
const CUT = CUTS[opt('cut') ?? 'long'];
const LENGTH = CUT.length, SCENES = CUT.scenes, LINES = CUT.lines;
const BUILD = join(AD, 'build', opt('cut') ?? 'long'); // (each cut its own frames)

/** The frames each scene shows (one per output frame), extracted from the shots. */
function extract() {
  const out: Record<string, number> = {};
  for (const s of SCENES) {
    const dir = join(BUILD, 'f', s.id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const size = s.id === 'intro' || s.id === 'end' ? `${W}:${H}` : '720:1280';
    let n = 0;
    s.pieces.forEach(([shot, from, to, speed = 1], k) => {
      const part = join(dir, `p${k}`);
      mkdirSync(part, { recursive: true });
      ff(['-ss', String(from), '-t', String(to - from), '-i', join(SHOTS, `${shot}.mp4`), '-vf', `setpts=PTS/${speed},fps=${FPS},scale=${size}`, '-q:v', '2', join(part, '%05d.jpg')]);
      for (const f of readdirSync(part).sort()) { execFileSync('mv', [join(part, f), join(dir, `${String(n++).padStart(5, '0')}.jpg`)]); }
      rmSync(part, { recursive: true });
    });
    out[s.id] = n;
  }
  return out;
}

const font = (w: number) => pathToFileURL(resolve(`node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-${w}-normal.woff2`)).href;
const page = (counts: Record<string, number>) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: SG; font-weight: 500; src: url(${font(500)}); }
@font-face { font-family: SG; font-weight: 700; src: url(${font(700)}); }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #040712; font-family: SG, sans-serif; color: #fff; }
#stage { position: absolute; inset: 0; overflow: hidden; }
#bg { position: absolute; inset: -20%; background:
  radial-gradient(40% 30% at var(--gx, 30%) var(--gy, 25%), rgba(56, 108, 255, 0.28), transparent 70%),
  radial-gradient(35% 28% at var(--hx, 75%) var(--hy, 70%), rgba(251, 191, 36, 0.16), transparent 70%),
  radial-gradient(80% 60% at 50% 45%, #0c1a3d 0%, #060b1d 55%, #03050d 100%); }
.full { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; will-change: transform, opacity; }
#phone { position: absolute; left: 50%; top: 600px; transform-origin: 50% 0; width: 712px; height: 1266px; margin-left: -356px; transform-style: preserve-3d; opacity: 0; }
#phone .body { position: absolute; inset: 0; border-radius: 92px; background: linear-gradient(145deg, #2a2f3d, #0b0d13 40%, #1c2030);
  box-shadow: 0 80px 160px -30px rgba(0,0,0,0.85), 0 30px 60px -20px rgba(0,0,0,0.6), inset 0 0 0 2px rgba(255,255,255,0.14), inset 0 0 0 9px #05060a; }
#phone .screen { position: absolute; left: 16px; top: 16px; right: 16px; bottom: 16px; border-radius: 78px; overflow: hidden; background: #050913; }
#phone .screen img { position: absolute; left: 0; right: 0; top: 74px; bottom: 0; width: 100%; height: calc(100% - 74px); object-fit: cover; object-position: 50% 0; display: block; }
#phone .status { position: absolute; left: 0; right: 0; top: 0; height: 74px; background: #050913; display: flex; align-items: center; justify-content: space-between; padding: 14px 58px 0 66px; font-weight: 700; font-size: 26px; letter-spacing: -0.01em; }
#phone .status svg { display: block; }
#phone .island { position: absolute; left: 50%; top: 34px; width: 190px; height: 54px; margin-left: -95px; border-radius: 30px; background: #000; }
#phone .glare { position: absolute; inset: 16px; border-radius: 78px; pointer-events: none; overflow: hidden; }
#phone .glare i { position: absolute; top: -20%; bottom: -20%; width: 34%; left: -60%; transform: skewX(-18deg);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent); }
#copy { position: absolute; left: 80px; right: 80px; top: 310px; text-align: left; }
#kicker { display: flex; align-items: center; gap: 18px; font-weight: 700; font-size: 30px; letter-spacing: 0.24em; text-transform: uppercase; color: #fbbf24; height: 40px; }
#kicker b { display: block; height: 3px; background: #fbbf24; border-radius: 2px; }
#head { margin-top: 22px; font-weight: 700; font-size: 92px; line-height: 1.02; letter-spacing: -0.035em; }
#head .w { display: inline-block; margin-right: 0.22em; will-change: transform, opacity, filter; }
#head .g { color: #fbbf24; }
#head .line { display: block; overflow: visible; }
#intro { position: absolute; left: 60px; right: 60px; top: 50%; transform: translateY(-50%); text-align: center; font-weight: 700; font-size: 124px; line-height: 1.0; letter-spacing: -0.045em; text-shadow: 0 10px 60px rgba(0,0,0,0.7); }
#intro .w { display: inline-block; margin: 0 0.12em; }
#intro .g { color: #fbbf24; }
#end { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
#logo { width: 250px; height: 250px; border-radius: 58px; box-shadow: 0 40px 100px -20px rgba(56,108,255,0.6), 0 0 0 2px rgba(255,255,255,0.12); opacity: 0; }
#name { margin-top: 56px; font-weight: 700; font-size: 150px; letter-spacing: -0.05em; opacity: 0; }
#free { margin-top: 18px; font-weight: 700; font-size: 64px; color: #fbbf24; opacity: 0; }
#url { margin-top: 40px; padding: 26px 56px; border-radius: 999px; font-weight: 700; font-size: 54px; color: #0a0e1a; background: linear-gradient(135deg, #fde68a, #fbbf24); box-shadow: 0 20px 60px -15px rgba(251,191,36,0.6); opacity: 0; }
#small { margin-top: 34px; font-weight: 500; font-size: 36px; color: #9fb0d4; letter-spacing: 0.04em; opacity: 0; }
#flash { position: absolute; inset: 0; background: #fff; opacity: 0; mix-blend-mode: overlay; }
#vig { position: absolute; inset: 0; background: radial-gradient(75% 60% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%); pointer-events: none; }
#grain { position: absolute; inset: -100px; opacity: 0.07; pointer-events: none; mix-blend-mode: overlay; }
</style></head><body><div id="stage">
<div id="bg"></div>
<img id="full" class="full">
<div id="intro"></div>
<div id="copy"><div id="kicker"><b></b><span></span></div><div id="head"></div></div>
<div id="phone"><div class="body"></div><div class="screen"><div class="status"><span>9:41</span><svg width="96" height="22" viewBox="0 0 96 22" fill="#fff"><rect x="0" y="13" width="5" height="8" rx="1.5"/><rect x="8" y="9" width="5" height="12" rx="1.5"/><rect x="16" y="5" width="5" height="16" rx="1.5"/><rect x="24" y="1" width="5" height="20" rx="1.5"/><path d="M45 8a13 13 0 0 1 18 0l-2.4 2.6a9.5 9.5 0 0 0-13.2 0zM49 12.5a7.5 7.5 0 0 1 10 0L54 18z"/><rect x="68" y="3" width="24" height="15" rx="4" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="2"/><rect x="71" y="6" width="17" height="9" rx="2"/><rect x="93.5" y="8" width="2" height="5" rx="1" fill-opacity="0.5"/></svg></div><img id="screen"></div><div class="island"></div><div class="glare"><i></i></div></div>
<div id="end"><img id="logo" src="logo.png"><div id="name">GeoQuest</div><div id="free">Play free</div><div id="url">playgeoquest.app</div><div id="small">No sign-up · Right in your browser</div></div>
<div id="flash"></div><div id="vig"></div><canvas id="grain" width="640" height="1140"></canvas>
</div><script>
const PHONE = 0.74, PACE = ${CUT.pace}, INTRO = ${SCENES[0].until}; // (the phone's size: it ends above Instagram's caption)
const SCENES = ${JSON.stringify(SCENES.map(({ pieces, ...s }) => s))}, COUNTS = ${JSON.stringify(counts)}, FPS = ${FPS};
const $ = (id) => document.getElementById(id);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const expo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const inOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const back = (x) => { const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const words = (el, head, gold, cls) => {
  el.innerHTML = '<span class="line">' + head.split(' ').map((w) => '<span class="w">' + w + '</span>').join('') + '</span>' +
    (gold ? '<span class="line">' + gold.split(' ').map((w) => '<span class="w g">' + w + '</span>').join('') + '</span>' : '');
  return [...el.querySelectorAll('.w')];
};
// Grain: a fresh noise field per frame.
const gctx = $('grain').getContext('2d'), gimg = gctx.createImageData(640, 1140);
function grain(seed) { let s = seed * 9301 + 49297; const d = gimg.data; for (let i = 0; i < d.length; i += 4) { s = (s * 16807) % 2147483647; const v = s & 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } gctx.putImageData(gimg, 0, 0); }
let built = null;
const frameOf = (id, k) => 'f/' + id + '/' + String(Math.min(COUNTS[id] - 1, Math.max(0, k)) + 1).padStart(5, '0') + '.jpg';
async function setSrc(img, src) { if (img.getAttribute('src') !== src) { img.src = src; await img.decode().catch(() => null); } }

window.render = async (f) => {
  const t = f / FPS;
  const sc = SCENES.find((s) => t >= s.at && t < s.until) ?? SCENES[SCENES.length - 1];
  const local = t - sc.at, left = sc.until - t, len = sc.until - sc.at;
  const k = Math.floor(local * FPS);
  // The light drifting behind everything.
  const bg = $('bg').style;
  bg.setProperty('--gx', (30 + 12 * Math.sin(t * 0.35)) + '%'); bg.setProperty('--gy', (24 + 8 * Math.cos(t * 0.3)) + '%');
  bg.setProperty('--hx', (72 + 10 * Math.cos(t * 0.28)) + '%'); bg.setProperty('--hy', (70 + 8 * Math.sin(t * 0.4)) + '%');
  grain(f + 1); $('grain').style.transform = 'translate(' + ((f * 37) % 100 - 50) + 'px,' + ((f * 53) % 100 - 50) + 'px) scale(1.8)';

  if (built !== sc.id) {
    built = sc.id;
    $('intro').innerHTML = ''; $('head').innerHTML = '';
    if (sc.id === 'intro') words($('intro'), sc.head, sc.gold);
    else if (sc.id !== 'end') { words($('head'), sc.head, sc.gold); $('kicker').querySelector('span').textContent = sc.kicker; }
  }
  const full = $('full'), phone = $('phone');
  // ── Opening: the globe, full screen, and the line in big type ──
  if (sc.id === 'intro' || sc.id === 'end') {
    await setSrc(full, frameOf(sc.id, k));
    if (sc.id === 'intro') {
      const z = 1.22 - 0.2 * expo(clamp(local / (INTRO * 0.9))) + 0.35 * inOut(clamp((local - (INTRO - 0.45 * PACE)) / (0.45 * PACE)));
      full.style.opacity = String(clamp(local / (0.7 * PACE)) * (1 - clamp((local - (INTRO - 0.35 * PACE)) / (0.35 * PACE))));
      full.style.transform = 'scale(' + z + ')';
      full.style.filter = 'blur(' + (6 * (1 - clamp(local / 0.9)) + 10 * clamp((local - 2.9) / 0.4)) + 'px) brightness(0.8)';
      $('intro').querySelectorAll('.w').forEach((w, i) => {
        const start = i < 3 ? (0.3 + i * 0.12) * PACE : (1.4 + (i - 3) * 0.14) * PACE;
        const p = expo(clamp((t - start) / (0.55 * PACE))), out = clamp((local - (INTRO - 0.45 * PACE)) / (0.35 * PACE));
        w.style.opacity = String(p * (1 - out));
        w.style.transform = 'translateY(' + ((1 - p) * 70 - out * 40) + 'px) scale(' + (0.92 + 0.08 * p) + ')';
        w.style.filter = 'blur(' + ((1 - p) * 14 + out * 10) + 'px)';
      });
      $('intro').style.opacity = '1';
    } else {
      full.style.opacity = String(0.22 * clamp(local / 1.0)); full.style.transform = 'scale(' + (1.25 + local * 0.02) + ')'; full.style.filter = 'blur(2px) brightness(0.7)';
    }
  } else full.style.opacity = '0';
  if (sc.id !== 'intro') $('intro').style.opacity = '0';

  // ── A feature: the kicker and headline, and the phone ──
  const feature = sc.id !== 'intro' && sc.id !== 'end';
  const idx = SCENES.indexOf(sc), dir = idx % 2 ? 1 : -1; // (alternate sides, so the cuts swing)
  if (feature) {
    await setSrc($('screen'), frameOf(sc.id, k));
    const IN = 0.75 * PACE, OUT = 0.38 * PACE;
    const inP = expo(clamp(local / IN)), outP = inOut(clamp((OUT - left) / OUT));
    const first = idx === 1;
    // In: the first one rises from below the globe; the rest whip in from the side. Out: whip away.
    const x = first ? 0 : (1 - inP) * 1250 * -dir, y = first ? (1 - inP) * 1500 : 0;
    const ox = outP * 1250 * dir, ry = (first ? 0 : (1 - inP) * 35 * dir) - outP * 35 * dir;
    const floatY = Math.sin(t * 1.3) * 9, tiltY = Math.sin(t * 0.7 + idx) * 5, tiltX = 7 + Math.cos(t * 0.9) * 2;
    phone.style.opacity = '1';
    phone.style.transform = 'perspective(2600px) translate(' + (x + ox) + 'px,' + (y + floatY) + 'px) rotateX(' + (tiltX + (first ? (1 - inP) * 25 : 0)) + 'deg) rotateY(' + (tiltY + ry) + 'deg) scale(' + PHONE * (0.94 + 0.06 * inP) + ')';
    const speed = Math.abs((1 - inP) * (first ? 0 : 1)) + outP;
    phone.style.filter = 'blur(' + Math.min(14, speed * 16) + 'px)';
    $('phone').querySelector('.glare i').style.left = (-60 + 190 * inOut(clamp((local - 0.55) / 1.1))) + '%';
    // The words: up out of a blur, one after another; away as the phone leaves.
    const ws = $('head').querySelectorAll('.w');
    ws.forEach((w, i) => {
      const p = expo(clamp((local - (0.18 + i * 0.075) * PACE) / (0.6 * PACE))), o = inOut(clamp((0.34 * PACE - left) / (0.34 * PACE)));
      w.style.opacity = String(p * (1 - o));
      w.style.transform = 'translateY(' + ((1 - p) * 60 - o * 30) + 'px)';
      w.style.filter = 'blur(' + ((1 - p) * 12 + o * 8) + 'px)';
    });
    const kp = expo(clamp((local - 0.05 * PACE) / (0.5 * PACE))), ko = inOut(clamp((0.34 * PACE - left) / (0.34 * PACE)));
    $('kicker').style.opacity = String(kp * (1 - ko));
    $('kicker').querySelector('b').style.width = (70 * kp) + 'px';
    $('kicker').style.transform = 'translateX(' + ((1 - kp) * -30) + 'px)';
    $('copy').style.opacity = '1';
  } else { phone.style.opacity = '0'; $('copy').style.opacity = '0'; }

  // ── The end card ──
  const e = sc.id === 'end';
  const pop = (el, at, dist = 50) => { const p = e ? clamp((local - at) / (0.6 * PACE)) : 0; el.style.opacity = String(expo(p)); el.style.transform = 'translateY(' + ((1 - expo(p)) * dist) + 'px)'; el.style.filter = 'blur(' + ((1 - expo(p)) * 10) + 'px)'; };
  { const p = e ? clamp((local - 0.15 * PACE) / (0.7 * PACE)) : 0; $('logo').style.opacity = String(clamp(p * 2)); $('logo').style.transform = 'scale(' + (0.4 + 0.6 * back(p)) + ') rotate(' + ((1 - expo(p)) * -12) + 'deg)'; }
  pop($('name'), 0.45 * PACE, 60); pop($('free'), 1.3 * PACE); pop($('url'), 1.65 * PACE); pop($('small'), 2.3 * PACE, 30);
  // A soft flash on each cut.
  const cut = SCENES.slice(1).map((s) => Math.abs(t - s.at)).reduce((a, b) => Math.min(a, b), 9);
  $('flash').style.opacity = String((PACE < 1 ? 0.5 : 0.35) * clamp(1 - cut / 0.16));
  // (The fast cut: a small zoom punch on each cut, the whole frame.)
  $('stage').style.transform = PACE < 1 ? 'scale(' + (1 + 0.035 * clamp(1 - cut / 0.22)) + ')' : '';
};
</script></body></html>`;

// ── Draw it ──
mkdirSync(BUILD, { recursive: true });
execFileSync('cp', [resolve('server/assets/og-icon.png'), join(BUILD, 'logo.png')]);
const preview = opt('preview');
const counts = preview && existsSync(join(BUILD, 'counts.json')) ? JSON.parse(execFileSync('cat', [join(BUILD, 'counts.json')]).toString()) : extract();
writeFileSync(join(BUILD, 'counts.json'), JSON.stringify(counts));
writeFileSync(join(BUILD, 'ad.html'), page(counts));
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await p.goto(pathToFileURL(join(BUILD, 'ad.html')).href);
await p.evaluate(() => document.fonts.ready);
if (preview) {
  await p.evaluate((f) => (window as unknown as { render: (f: number) => Promise<void> }).render(f), Math.round(Number(preview) * FPS));
  await p.screenshot({ path: join(BUILD, `preview-${preview}.png`) });
  console.log(join(BUILD, `preview-${preview}.png`));
  await browser.close();
  process.exit(0);
}
const frames = join(BUILD, 'frames');
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });
const total = LENGTH * FPS, t0 = Date.now();
for (let f = 0; f < total; f++) {
  await p.evaluate((n) => (window as unknown as { render: (f: number) => Promise<void> }).render(n), f);
  await p.screenshot({ path: join(frames, `${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94 });
  if (f % 150 === 0) console.log(`frame ${f}/${total} (${Math.round((Date.now() - t0) / 1000)} s)`);
}
await browser.close();

// ── The sound: the score, ducked under George's lines; mastered to Reels loudness ──
const vo = join(AD, 'audio', `${opt('vo') ?? 'vo-warm'}.mp3`), music = join(AD, 'audio', `${opt('music') ?? 'music-a'}.mp3`);
const voParts = LINES.map(([a, b, at], i) => `[2:a]atrim=start=${a}:end=${b},asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st=${(b - a - 0.06).toFixed(2)}:d=0.06,adelay=${Math.round(at * 1000)}:all=1[l${i}]`).join(';');
const filter = `${voParts};${LINES.map((_, i) => `[l${i}]`).join('')}amix=inputs=${LINES.length}:normalize=0,volume=1.6,apad=whole_dur=${LENGTH}[vo];[vo]asplit=2[vo1][vo2];` +
  `[1:a]atrim=start=${CUT.musicFrom},asetpts=PTS-STARTPTS,${CUT.musicFrom ? 'afade=t=in:d=0.15,' : ''}volume=0.62,apad=whole_dur=${LENGTH}[m];[m][vo1]sidechaincompress=threshold=0.04:ratio=5:attack=25:release=350:makeup=1[md];` +
  `[md][vo2]amix=inputs=2:normalize=0,atrim=duration=${LENGTH},afade=t=out:st=${LENGTH - 0.9}:d=0.9,loudnorm=I=-14:TP=-1.2:LRA=9,aresample=48000[a]`;
const out = join(AD, CUT.out);
ff(['-framerate', String(FPS), '-i', join(frames, '%05d.jpg'), '-i', music, '-i', vo, '-filter_complex', filter,
  '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', String(LENGTH), out]);
console.log(out);
