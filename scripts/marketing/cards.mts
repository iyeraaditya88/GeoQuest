// The pictures laid over a marketing video: the hook line (first seconds) and the end card.
// Rendered with satori + resvg like the share images (server/og.ts), same font and colours.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createElement as h, type ReactNode } from 'react';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const require = createRequire(import.meta.url);
const W = 1080, H = 1920;
let fonts: Promise<{ name: string; data: Buffer; weight: 500 | 700; style: 'normal' }[]> | null = null;
const loadFonts = () => (fonts ??= Promise.all(([500, 700] as const).map(async (weight) => ({
  name: 'Space Grotesk', weight, style: 'normal' as const,
  data: await readFile(require.resolve(`@fontsource/space-grotesk/files/space-grotesk-latin-${weight}-normal.woff`)),
}))));
const icon = () => readFile(new URL('../../server/assets/og-icon.png', import.meta.url)).then((b) => `data:image/png;base64,${b.toString('base64')}`);
const div = (style: Record<string, unknown>, ...children: ReactNode[]) => h('div', { style: { display: 'flex', ...style } }, ...children);
const png = async (tree: ReactNode) => Buffer.from(new Resvg(await satori(tree as never, { width: W, height: H, fonts: await loadFonts() }), { fitTo: { mode: 'width', value: W } }).render().asPng());

/** Transparent overlay: the hook line in a bold box near the top (clear of the app's top bar). */
export async function hookCard(text: string) {
  return png(div({ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 300, fontFamily: 'Space Grotesk' },
    div({ maxWidth: 920, padding: '34px 46px', borderRadius: 36, backgroundColor: 'rgba(5,9,19,0.82)', border: '3px solid rgba(251,191,36,0.85)',
      fontSize: 66, fontWeight: 700, lineHeight: 1.15, color: '#fff', textAlign: 'center', justifyContent: 'center' }, text)));
}

/** Full-screen end card: logo, "Play free", the address. */
export async function endCard(line = 'Free · no sign-up · on your phone') {
  const logo = await icon();
  return png(div({ width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 34, fontFamily: 'Space Grotesk', color: '#e8eefc',
    backgroundImage: 'radial-gradient(circle at 50% 30%, #1b2f5e 0%, #0a1226 55%, #050913 100%)' },
    h('img', { src: logo, width: 220, height: 220, style: { borderRadius: 48 } }),
    div({ fontSize: 96, fontWeight: 700, letterSpacing: -2 }, 'GeoQuest'),
    div({ fontSize: 58, fontWeight: 700, color: '#fbbf24', marginTop: 10 }, 'playgeoquest.app'),
    div({ fontSize: 40, fontWeight: 500, color: '#94a3c4' }, line)));
}

/** Square-ish cover for the pack (thumbnail / Reddit image): a still frame with the hook on it. */
export async function coverCard(frameJpeg: Buffer, text: string) {
  const bg = `data:image/jpeg;base64,${frameJpeg.toString('base64')}`;
  return png(div({ width: '100%', height: '100%', position: 'relative', fontFamily: 'Space Grotesk' },
    h('img', { src: bg, width: W, height: H, style: { position: 'absolute', left: 0, top: 0 } }),
    div({ position: 'absolute', left: 0, right: 0, bottom: 0, height: 900, backgroundImage: 'linear-gradient(transparent, rgba(5,9,19,0.95))' }),
    div({ position: 'absolute', left: 70, right: 70, bottom: 260, fontSize: 84, fontWeight: 700, lineHeight: 1.1, color: '#fff' }, text),
    div({ position: 'absolute', left: 70, bottom: 150, fontSize: 48, fontWeight: 700, color: '#fbbf24' }, 'playgeoquest.app')));
}
