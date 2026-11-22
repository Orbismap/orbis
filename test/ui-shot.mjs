// UI screenshots with scripted states. Needs a prior `pnpm build`.
//   node test/ui-shot.mjs <scenario> [--w 1440 --h 900] [--theme light|dark] [--mobile] [--hash '#/@50,10,3z?k=gefahren'] [--wait 3500]
// Scenarios: default expanded catalog inspector probe timeline search settings keys basemap sheet-half sheet-full
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'test', 'out');
mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2);
const scenario = argv[0] ?? 'default';
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const mobile = argv.includes('--mobile');
const W = +opt('w', mobile ? 390 : 1440), H = +opt('h', mobile ? 844 : 900);
const theme = opt('theme', 'dark');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

const port = await freePort();
const child = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
process.on('exit', () => child.kill('SIGTERM'));
const url = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) break; } catch {} await sleep(150); }

let browser;
for (const args of [['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'], ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl']]) {
  try { browser = await chromium.launch({ channel: 'chrome', headless: true, args }); break; } catch {}
}
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: +opt('dpr', 1), locale: 'de-DE', colorScheme: theme, hasTouch: mobile, isMobile: mobile, permissions: [] });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load|net::ERR|CORS|HTTP \d/.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
const hash = opt('hash', '');
if (argv.includes('--miles')) await page.addInitScript(() => localStorage.setItem('orbis-map:settings', JSON.stringify({ v: 1, d: { units: { temperature: 'c', wind: 'kmh', pressure: 'hpa', precip: 'mm', distance: 'mi' }, theme: 'dark', motion: 'auto', keys: {}, confirmedWarnings: [] } })));
await page.goto(`${url}/?smoke${hash}`, { waitUntil: 'load' });
if (theme === 'light') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
await page.waitForFunction(() => window.__orbis?.engine, null, { timeout: 20000 }).catch(() => {});
await sleep(+opt('wait', 3500));

const card = { title: 'M 5,4 – Küste von Honshu', subtitle: '38 km östlich von Ishinomaki, Japan', time: Date.now() - 12 * 60_000, color: '#F2B45A', icon: 'quake', facts: [{ label: 'Stärke', value: 'M 5,4', emphasis: true }, { label: 'Tiefe', value: '32 km', emphasis: true }, { label: 'Quelle', value: 'USGS' }, { label: 'Status', value: 'überprüft' }, { label: 'Meldungen', value: '412' }], text: 'Beben spürbar bis Tokio. Keine Tsunami-Warnung.', links: [{ label: 'Bericht bei USGS', url: 'https://earthquake.usgs.gov' }], location: [142.1, 38.3] };

const steps = {
  default: async () => {},
  expanded: async () => { await page.locator('.lrow-head').first().click(); await sleep(400); },
  catalog: async () => { await page.getByRole('button', { name: 'Ebene hinzufügen' }).last().click(); await sleep(500); },
  'catalog-search': async () => { await page.getByRole('button', { name: 'Ebene hinzufügen' }).last().click(); await sleep(300); await page.keyboard.type('wind'); await sleep(300); },
  inspector: async () => { await page.evaluate((c) => window.__orbis.selection.selectCard('erdbeben', c), card); await sleep(600); },
  probe: async () => { await page.evaluate(() => window.__orbis.selection.setProbe({ lng: 13.4, lat: 52.5 })); await sleep(900); },
  timeline: async () => { const b = await page.locator('.tband').boundingBox(); if (b) { await page.mouse.click(b.x + b.width * 0.62, b.y + b.height / 2); await sleep(400); await page.mouse.move(b.x + b.width * 0.3, b.y + 10); await sleep(200); } },
  search: async () => { await page.keyboard.press('Control+k'); await sleep(200); await page.keyboard.type('wind'); await sleep(900); },
  'search-empty': async () => { await page.keyboard.press('Control+k'); await sleep(500); },
  settings: async () => { await page.getByRole('button', { name: 'Einstellungen' }).first().click(); await sleep(500); },
  boost: async () => { await page.getByRole('button', { name: 'Einstellungen' }).first().click(); await sleep(400); await page.locator('.bkey-head').first().click(); await sleep(400); await page.evaluate(() => document.querySelector('#boost-aisstream').scrollIntoView({ block: 'center' })); await sleep(400); },
  keyrow: async () => { await page.locator('.lrow-keybtn').first().scrollIntoViewIfNeeded(); await sleep(300); },
  'catalog-key': async () => { await page.getByRole('button', { name: 'Ebene hinzufügen' }).last().click(); await sleep(300); await page.keyboard.type('schlüssel'); await sleep(300); },
  keys: async () => { await page.keyboard.press('Shift+?'); await sleep(400); },
  basemap: async () => { await page.getByRole('button', { name: 'Grundkarte' }).click(); await sleep(400); },
  attribution: async () => { await sleep(400); },
  'sheet-half': async () => { await page.getByRole('button', { name: 'Leiste vergrößern' }).click(); await sleep(900); },
  'sheet-full': async () => { const b = page.getByRole('button', { name: 'Leiste vergrößern' }); await b.click(); await sleep(700); await page.getByRole('button', { name: 'Leiste vergrößern' }).click(); await sleep(900); },
  'sheet-catalog': async () => { await page.getByRole('button', { name: 'Leiste vergrößern' }).click(); await sleep(600); await page.getByRole('button', { name: 'Hinzufügen' }).click(); await sleep(1000); },
  'karten-menu': async () => { await page.getByRole('button', { name: 'Kartenmenü' }).click(); await sleep(300); },
  'mobile-menu': async () => { await page.locator('.kswitch-btn').click(); await sleep(300); },
};
await (steps[scenario] ?? (async () => { throw new Error('unknown scenario'); }))();
const name = opt('name', `ui-${scenario}${mobile ? '-m' : ''}-${theme}${W !== 1440 && !mobile ? '-' + W : ''}`);
await page.screenshot({ path: join(OUT, `${name}.png`) });
console.log(join(OUT, `${name}.png`));
errs.slice(0, 8).forEach((e) => console.log(e));
await browser.close();
child.kill('SIGTERM');
