// Regenerates the static brand files from src/ui/brand/orbis-dots.ts (single source of geometry).
// Usage: pnpm brand   (PNGs need playwright-core + system Chrome; SVGs are written regardless)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { orbisDots } from '../src/ui/brand/orbis-dots.ts';

const pub = (f) => fileURLToPath(new URL(`../public/${f}`, import.meta.url));
const BLUE = '#4f8dff', AMBER = '#ffb547', TILE = '#0b1220';

function dotsSvg(variant, { blue = BLUE, amber = AMBER, transform = '' } = {}) {
  const c = orbisDots(variant)
    .map((d) => `<circle cx="${d.cx.toFixed(2)}" cy="${d.cy.toFixed(2)}" r="${d.r.toFixed(2)}" fill="${d.hot ? amber : blue}" fill-opacity="${d.hot ? 1 : d.opacity.toFixed(2)}"/>`)
    .join('');
  return transform ? `<g transform="${transform}">${c}</g>` : c;
}
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">${body}</svg>\n`;
const tile = (rx) => `<rect width="120" height="120" rx="${rx}" fill="${TILE}"/>`;

const files = {
  'favicon.svg': svg(tile(27) + dotsSvg('tiny')),
  'icon.svg': svg(tile(27) + dotsSvg('logo')),
  // safe zone 80 %: scale 0.8 around the centre
  'icon-maskable.svg': svg(`<rect width="120" height="120" fill="${TILE}"/>` + dotsSvg('logo', { transform: 'translate(12 12) scale(0.8)' })),
};
for (const [f, s] of Object.entries(files)) writeFileSync(pub(f), s);
console.log('SVG:', Object.keys(files).join(', '));

const pngs = [
  ['icon-192.png', 'icon.svg', 192],
  ['icon-512.png', 'icon.svg', 512],
  ['icon-maskable-512.png', 'icon-maskable.svg', 512],
  ['apple-touch-icon.png', 'icon-maskable.svg', 180], // iOS rounds the corners itself, so full-bleed
];
try {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const [out, src, px] of pngs) {
    const page = await browser.newPage({ viewport: { width: px, height: px } });
    await page.setContent(`<body style="margin:0;background:transparent">${files[src].replace('<svg ', `<svg width="${px}" height="${px}" style="display:block" `)}</body>`);
    await page.screenshot({ path: pub(out), omitBackground: true });
    await page.close();
  }
  await browser.close();
  console.log('PNG:', pngs.map((p) => p[0]).join(', '));
} catch (e) {
  console.warn('PNGs skipped:', e.message);
}
