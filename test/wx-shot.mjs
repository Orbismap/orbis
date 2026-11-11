// Throwaway visual check for the weather renderer (not part of the smoke test).
//   node test/wx-shot.mjs <plan.json> [--url http://localhost:5173]
// plan: [{ name, layers: [{id, visible?, opacity?, options?}], basemap?, labels?, terminator?, projection?, center?, zoom?,
//          pitch?, bearing?, t? (ms or "+6h" relative to now), wait?, width?, height?, evalJs? }]
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'test', 'out');
mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2);
const plan = JSON.parse(readFileSync(argv[0], 'utf8'));
const urlIdx = argv.indexOf('--url');
const base = urlIdx >= 0 ? argv[urlIdx + 1] : 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ARGS = [
  ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'],
  ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
];
let browser;
for (const args of ARGS) {
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args });
    const p = await browser.newPage();
    const ok = await p.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
    await p.close();
    if (ok) { console.log('gl args', args[0]); break; }
    await browser.close(); browser = undefined;
  } catch (e) { console.log('launch failed', e.message); }
}
if (!browser) throw new Error('no webgl2');

const first = plan[0] ?? {};
const ctx = await browser.newContext({ viewport: { width: first.width ?? 1280, height: first.height ?? 800 }, deviceScaleFactor: 1, locale: 'de-DE' });
const page = await ctx.newPage();
const logs = [];
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /\[particles\]|\[field\]|Shader|shader/.test(t)) logs.push(`${m.type()}: ${t.slice(0, 1500)}`); });
await page.goto(`${base}/?smoke`, { waitUntil: 'load' });
await page.evaluate(async () => {
  const t0 = performance.now();
  while (!window.__orbis?.engine) { if (performance.now() - t0 > 30000) throw new Error('no engine'); await new Promise((r) => setTimeout(r, 100)); }
  await window.__orbis.engine.ready;
});

for (const s of plan) {
  if (s.width && s.height) await page.setViewportSize({ width: s.width, height: s.height });
  await page.evaluate(async (s) => {
    const o = window.__orbis;
    const timeMod = await import('/src/state/time.ts');
    const id = 'wxtest';
    if (!window.__wxid) {
      const nid = o.karten.saveAs('gefahren', 'wxtest');
      window.__wxid = nid;
    }
    const kid = window.__wxid;
    o.karten.editKarte(kid, (k) => ({
      ...k,
      layers: (s.layers ?? []).map((l) => ({ id: l.id, visible: l.visible ?? true, opacity: l.opacity ?? 1, options: l.options })),
      basemap: s.basemap ?? 'orbis-dark',
      labels: s.labels ?? true,
      terminator: s.terminator ?? false,
    }));
    o.session.setActiveKarte(kid);
    o.view.setProjection(s.projection ?? 'globe');
    const ml = o.engine.ml;
    ml.jumpTo({ center: s.center ?? [10, 30], zoom: s.zoom ?? 1.8, pitch: s.pitch ?? 0, bearing: s.bearing ?? 0 });
    if (s.t !== undefined) {
      const t = typeof s.t === 'string' ? Date.now() + Number(s.t.replace('h', '')) * 3600_000 : s.t;
      timeMod.setTime(t);
    } else timeMod.goLive();
    if (s.evalJs) await (0, eval)(`(async()=>{${s.evalJs}})()`);
  }, s);
  await sleep(s.wait ?? 6000);
  const info = await page.evaluate(() => {
    const o = window.__orbis;
    return { status: o.session.layerStatus.peek(), zoom: o.engine.ml.getZoom(), proj: o.engine.ml.getProjection()?.type };
  });
  console.log(s.name, JSON.stringify(info));
  await page.screenshot({ path: join(OUT, `wx-${s.name}.png`) });
}
for (const l of logs) console.log(l);
await browser.close();
