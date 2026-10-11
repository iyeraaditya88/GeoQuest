// Share pictures: the image a chat app shows for a shared Daily result — the day, the score in big
// figures and the five squares. Rendered on demand (and cached by the CDN: same input, same picture).
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createElement as h, type ReactNode } from 'react';
import { DAILY_N, MAX_POINTS, total } from '../src/lib/daily.js';

const require = createRequire(import.meta.url);
let fonts: Promise<{ name: string; data: Buffer; weight: 500 | 700; style: 'normal' }[]> | null = null;
const loadFonts = () => (fonts ??= Promise.all(([500, 700] as const).map(async (weight) => ({
  name: 'Space Grotesk', weight, style: 'normal' as const,
  data: await readFile(require.resolve(`@fontsource/space-grotesk/files/space-grotesk-latin-${weight}-normal.woff`)),
}))));

// The app icon (a copy kept beside the server code, so the function can read it).
let icon: Promise<string> | null = null;
const loadIcon = () => (icon ??= readFile(new URL('./assets/og-icon.png', import.meta.url))
  .catch(() => readFile(`${process.cwd()}/server/assets/og-icon.png`))
  .then((b) => `data:image/png;base64,${b.toString('base64')}`));

const COLOR = ['#475569', '#fb923c', '#facc15', '#34d399']; // 0 revealed … 3 first try
const MAX = DAILY_N * MAX_POINTS;

/** Points from a share link ("33231"), or null if they don't make sense. */
export function parsePoints(r: unknown) {
  return typeof r === 'string' && new RegExp(`^[0-${MAX_POINTS}]{${DAILY_N}}$`).test(r) ? [...r].map(Number) : null;
}

const div = (style: Record<string, unknown>, ...children: ReactNode[]) => h('div', { style: { display: 'flex', ...style } }, ...children);

/** 1200×630 PNG: "GeoQuest Daily #42", "13/15" and the squares. */
export async function dailyCard(no: number, points: number[]) {
  const [{ default: satori }, { Resvg }] = await Promise.all([import('satori'), import('@resvg/resvg-js')]);
  const score = total(points);
  const logo = await loadIcon();
  const tree = div(
    { width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'Space Grotesk', color: '#e8eefc',
      backgroundImage: 'radial-gradient(circle at 50% 0%, #1b2f5e 0%, #0a1226 55%, #050913 100%)' },
    // A little globe in the corner, and the name.
    div({ position: 'absolute', top: 44, left: 56, alignItems: 'center', gap: 18 },
      h('img', { src: logo, width: 64, height: 64, style: { borderRadius: 16 } }),
      div({ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }, 'GeoQuest')),
    div({ position: 'absolute', top: 54, right: 60, fontSize: 28, fontWeight: 500, color: '#94a3c4' }, 'playgeoquest.app'),
    div({ fontSize: 44, fontWeight: 500, color: '#fde68a', marginTop: 40 }, `Daily #${no}`),
    div({ alignItems: 'baseline', marginTop: 4 },
      div({ fontSize: 210, fontWeight: 700, lineHeight: 1, color: '#fbbf24', letterSpacing: -6 }, String(score)),
      div({ fontSize: 96, fontWeight: 500, color: '#7b88a8', marginLeft: 10 }, `/${MAX}`)),
    div({ gap: 22, marginTop: 34 }, ...points.map((p, i) => h('div', { key: i, style: { width: 92, height: 92, borderRadius: 20, backgroundColor: COLOR[p] } }))),
    div({ fontSize: 36, fontWeight: 500, color: '#c7d2ea', marginTop: 44 }, 'Can you beat it? Find today’s 5 countries'),
  );
  const svg = await satori(tree, { width: 1200, height: 630, fonts: await loadFonts() });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng());
}
