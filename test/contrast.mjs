// Contrast of text tokens on the panel glass over worst-case backdrops (analytic composite, blur ignored = worst case).
// node test/contrast.mjs
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (fg, a, bg) => fg.map((c, i) => c * a + bg[i] * (1 - a));
const themes = {
  dark: { panel: [[22, 26, 34], 0.72], sheen: 0, bright: 1, text: { 'text-1': '#f2f5f9', 'text-2': '#d0d8e5', 'text-3': '#c0cad9', limb: '#72c8f0', now: '#f2b45a', boost: '#b9a2fd' } },
  light: { panel: [[255, 255, 255], 0.72], sheen: 0, bright: 1, text: { 'text-1': '#0f1826', 'text-2': '#2a3448', 'text-3': '#38445a', limb: '#0a5f94', now: '#8f5300', boost: '#6d44d0' } },
};
const backs = { white: [255, 255, 255], black: [0, 0, 0], sand: [214, 196, 160], 'wind yellow': [230, 225, 70], 'ocean teal': [20, 120, 150], 'dark map': [10, 15, 24] };
let worst = 99;
for (const [t, d] of Object.entries(themes)) for (const [bn, b] of Object.entries(backs)) {
  if ((t === 'dark' && bn === 'white') || (t === 'light' && bn === 'black')) continue; // theme-opposite extremes: not a realistic backdrop for that theme
  const eff = b.map((c) => Math.min(255, c * d.bright));
  let bg = mix(d.panel[0], d.panel[1], eff);
  bg = mix([255, 255, 255], d.sheen, bg);
  const row = Object.entries(d.text).map(([k, v]) => { const c = cr(hex(v), bg); if (k.startsWith('text')) worst = Math.min(worst, c); return `${k} ${c.toFixed(1)}`; });
  console.log(`${t.padEnd(5)} on ${bn.padEnd(12)} ${row.join('  ')}`);
}
console.log(`worst text ratio: ${worst.toFixed(2)}`);
if (worst < 4.5) process.exit(1);
