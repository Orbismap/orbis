// Messung: was kostet auf der Erkunden-Karte wie viel Bildrate?
//
// Benutzung: die Karte mit `?smoke` vor dem `#` öffnen (damit `window.__orbis` existiert), zum gewünschten Ausschnitt
// fliegen (z. B. Fernsehturm, Neigung 60°, Zoom 16,5), dann den ganzen Inhalt dieser Datei in die Browser-Konsole kopieren:
//   https://maps.maltee.dev/?smoke#/@52.5201,13.4076,16.48z,55b,60p?b=orbis-karte&g=1&s=0
//
// Jeder Lauf fährt dieselbe Tour (die Kamera bewegt sich wirklich, sie kreist nicht um einen Punkt):
//   1 Straße      : ca. 700 m durch die Stadt gleiten, leicht drehen
//   2 Rauszoomen  : von Straßenzoom auf ganz Deutschland
//   (Stillstand)  : Kamera steht, es wird gemessen, wie lange die Karte braucht, bis alle Kacheln da sind
//   3 Deutschland : über das Land schwenken (Berlin -> München), Zoom ca. 5,5
//   4 Reinzoomen  : bei München bis Straßenzoom hinein
//   (Stillstand)  : wieder Ruhe, wieder Ladezeit
// Pro Gruppe ein Lauf "ohne" (alles an außer dieser Gruppe); verglichen wird mit der Ausgangslage. Gemessen wird die Zeit
// zwischen zwei requestAnimationFrame-Aufrufen (durch den Monitor gedeckelt). Der Stillstand zählt nicht in die Bildzeiten.
(async () => {
  const STILL_MS = 1500;  // Ruhe zwischen den Abschnitten
  const SETTLE_MAX = 6000; // so lange warten wir höchstens auf "alle Kacheln geladen"
  const o = window.__orbis;
  if (!o) return console.error('window.__orbis fehlt: Seite mit ?smoke vor dem # öffnen und neu laden.');
  const ml = o.engine.ml;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const layers = () => ml.getStyle().layers;
  const layerIds = (pred) => layers().filter(pred).map((l) => l.id);

  const groups = {
    'Gebäude 2.5D (fill-extrusion)': () => layerIds((l) => l.type === 'fill-extrusion'),
    'Straßenmarkierungen (Ebene)': () => layerIds((l) => l.id.startsWith('strassenmarkierungen.')),
    'Bäume (2D-Punkte)': () => layerIds((l) => l.id.startsWith('baeume')),
    'POI-Symbole': () => layerIds((l) => l.id.startsWith('bm-poi')),
    'Beschriftungen (Orte, Straßen)': () => layerIds((l) => l.type === 'symbol' && !l.id.startsWith('bm-poi') && !l.id.startsWith('strassenmarkierungen.') && !l.id.startsWith('baeume')),
    'Hillshade (Relief)': () => layerIds((l) => l.type === 'hillshade'),
    'Basiskarte Flächen/Linien (Landcover, Straßen, Wasser)': () => layerIds((l) => (l.type === 'fill' || l.type === 'line' || l.type === 'background' || l.type === 'color-relief') && l.id.startsWith('bm-')),
  };
  const customLayers = layerIds((l) => l.type === 'custom'); // z. B. 'orbis-stage' = 3D-Modelle und 3D-Bäume von Orbis Pro

  const vis = new Map();
  for (const l of layers()) vis.set(l.id, ml.getLayoutProperty(l.id, 'visibility') ?? 'visible');
  const terrain0 = ml.getTerrain();
  const ratio0 = ml.getPixelRatio?.() ?? window.devicePixelRatio;
  const c0 = ml.getCenter();
  const cam0 = { b: ml.getBearing(), p: ml.getPitch(), zoom: ml.getZoom(), lng: c0.lng, lat: c0.lat };
  const Z_STREET = cam0.zoom, Z_COUNTRY = 5.5;
  // Zielpunkte: Berlin (Start) -> Mitte Deutschlands -> München
  const BERLIN = [cam0.lng, cam0.lat], DE = [10.3, 51.1], MUC = [11.5755, 48.1374];

  const setGroup = (ids, on) => { for (const id of ids) if (ml.getLayer(id) && vis.get(id) !== 'none') ml.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
  const restore = () => {
    for (const [id, v] of vis) if (ml.getLayer(id)) ml.setLayoutProperty(id, 'visibility', v);
    if (terrain0) ml.setTerrain(terrain0); else ml.setTerrain(null);
    ml.setPixelRatio?.(ratio0);
    ml.jumpTo({ bearing: cam0.b, pitch: cam0.p, zoom: cam0.zoom, center: BERLIN });
  };

  // CPU- und GPU-Zeit je gezeichnetem Frame, unabhängig von der Monitor-Frequenz: ml._render (Stil, Platzierung, Draw-Calls) wird
  // gemessen, danach gl.finish() (wartet, bis die Grafikkarte fertig ist). Beides in ms, Mittel pro Lauf.
  const gl = ml.painter?.context?.gl;
  const acc = { n: 0, cpu: 0, gpu: 0 };
  const origRender = ml._render.bind(ml);
  ml._render = (t) => { const a = performance.now(); const r = origRender(t); const b = performance.now(); gl?.finish(); const c = performance.now(); acc.n++; acc.cpu += b - a; acc.gpu += c - b; return r; };
  const takeAcc = () => { const r = { cpu: +(acc.cpu / Math.max(1, acc.n)).toFixed(1), gpu: +(acc.gpu / Math.max(1, acc.n)).toFixed(1) }; acc.n = acc.cpu = acc.gpu = 0; return r; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);
  // Rundflug statt Tour: `window.PERF_ORBIT = true` vor dem Start setzen. Dreht 360° um den aktuellen Ausschnitt, schiebt ihn
  // leicht hin und her (ca. 300 m) und zoomt zwei Wellen zwischen etwa -2 und +1 Stufen (kleinere und größere Kacheln werden geladen), ohne Stillstand.
  const orbit = [{ name: 'Rundflug', ms: 10000, at: (t) => ({
    c: [cam0.lng + 0.003 * Math.sin(t * Math.PI * 4), cam0.lat + 0.002 * Math.sin(t * Math.PI * 6)],
    z: cam0.zoom - 0.5 + 1.5 * Math.sin(t * Math.PI * 4), b: cam0.b + 360 * t,
  }) }];
  const tourPhases = [
    { name: 'Straße', ms: 3500, at: (t) => ({ c: [lerp(BERLIN[0], BERLIN[0] + 0.011, t), lerp(BERLIN[1], BERLIN[1] - 0.005, t)], z: Z_STREET, b: cam0.b + 40 * t }) },
    { name: 'Rauszoomen', ms: 3500, at: (t) => ({ c: [lerp(BERLIN[0] + 0.011, DE[0] + 3.2, ease(t)), lerp(BERLIN[1] - 0.005, DE[1] + 0.5, ease(t))], z: lerp(Z_STREET, Z_COUNTRY, ease(t)), b: cam0.b + 40 - 40 * ease(t) }), still: true },
    { name: 'Deutschland', ms: 3500, at: (t) => ({ c: [lerp(DE[0] + 3.2, MUC[0], ease(t)), lerp(DE[1] + 0.5, MUC[1] + 1.2, ease(t))], z: Z_COUNTRY, b: 25 * Math.sin(t * Math.PI) }) },
    { name: 'Reinzoomen', ms: 3500, at: (t) => ({ c: [lerp(MUC[0], MUC[0] + 0.004, t), lerp(MUC[1] + 1.2, MUC[1], ease(t))], z: lerp(Z_COUNTRY, Z_STREET, ease(t)), b: 0 }), still: true },
  ];
  const phases = window.PERF_ORBIT ? orbit : tourPhases;

  const frames = (ms, at, dts) => new Promise((resolve) => {
    let last = performance.now(); const start = last;
    const tick = (now) => {
      dts.push(now - last); last = now;
      const t = Math.min(1, (now - start) / ms);
      const s = at(t);
      ml.jumpTo({ center: s.c, zoom: s.z, bearing: s.b, pitch: cam0.p });
      if (t < 1) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  });
  const settle = async () => {
    const t0 = performance.now();
    await sleep(STILL_MS);
    while (!ml.areTilesLoaded() && performance.now() - t0 < SETTLE_MAX) await sleep(100);
    return Math.round(performance.now() - t0 - STILL_MS);
  };
  const stats = (dts) => {
    const d = dts.slice(1), s = [...d].sort((a, c) => a - c), avg = d.reduce((x, v) => x + v, 0) / d.length;
    return { ms: +avg.toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(0), langsam: d.filter((v) => v > 33).length };
  };

  const tour = async (measureIt = true) => {
    ml.jumpTo({ center: BERLIN, zoom: Z_STREET, bearing: cam0.b, pitch: cam0.p });
    await sleep(STILL_MS);
    const all = [], per = {}, wait = [], cg = {};
    takeAcc();
    for (const ph of phases) {
      const d = [];
      takeAcc();
      await frames(ph.ms, ph.at, d);
      cg[ph.name] = takeAcc();
      all.push(...d);
      per[ph.name] = stats(d).ms;
      if (ph.still) wait.push(await settle());
    }
    const sum = (k) => +(Object.values(cg).reduce((a, v) => a + v[k], 0) / phases.length).toFixed(1);
    return measureIt ? { cpu: sum('cpu'), gpu: sum('gpu'), ...(window.PERF_ORBIT ? {} : { 'gpu Straße': cg['Straße'].gpu, 'gpu Deutschland': cg['Deutschland'].gpu }), gesamt: stats(all).ms, p95: stats(all).p95, langsam: stats(all).langsam, ...per, 'Ladezeit still (s)': +(wait.reduce((a, b) => a + b, 0) / 1000).toFixed(1) } : undefined;
  };

  const rows = [];
  const run = async (name, apply) => { apply(); const r = await tour(); rows.push({ Gruppe: name, ...r }); restore(); console.log(name, r); };

  console.log('Aufwärmen (Kacheln laden, nicht gemessen) …');
  await tour(false);
  const n = Object.keys(groups).length + 4;
  console.log(`Messung läuft (~${Math.round(n * 22 / 60)} Min), Tab nicht wechseln …`);
  rows.push({ Gruppe: 'ALLES AN (Ausgangslage)', ...(await tour()) });
  const all = Object.fromEntries(Object.entries(groups).map(([k, f]) => [k, f()]));
  for (const [name, ids] of Object.entries(all)) {
    if (!ids.length) { console.log('übersprungen (keine Layer):', name); continue; }
    await run(name + ' AUS', () => setGroup(ids, false));
  }
  await run('Gelände (3D-Terrain) AUS', () => ml.setTerrain(null));
  if (customLayers.length) await run(`Orbis Pro Bühne AUS (${customLayers.join(', ')})`, () => customLayers.forEach((id) => ml.setLayoutProperty(id, 'visibility', 'none')));
  await run('Alles aus (nur Hintergrund + Terrain)', () => { for (const ids of Object.values(all)) setGroup(ids, false); });
  rows.push({ Gruppe: 'ALLES AN (Wiederholung, Streuung)', ...(await tour()) });

  ml._render = origRender;
  restore();
  console.table(rows);
  console.log('Schichten je Gruppe:', Object.fromEntries(Object.entries(all).map(([k, ids]) => [k, ids.length])), 'Custom-Layer:', customLayers, 'Stage:', o.ext?.stage?.());
  window.__perfRows = rows;
  return rows;
})();
