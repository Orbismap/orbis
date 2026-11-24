// Messung: wohin geht die Hauptthread-Zeit AUSSERHALB des Zeichnens (Kachel-Abfragen, Quellen-Updates, Timer)?
//
// Benutzung wie perf-karte.js: Seite mit `?smoke` vor dem `#` öffnen, Kamera einstellen, Datei in die Konsole kopieren.
// Es läuft: 5 s Stillstand (Hintergrundarbeit ohne Bewegung), dann 10 s Rundflug (drehen, schieben, ±1,5 Zoomstufen).
// Gemessen wird in den Funktionen der Karte selbst (läuft in Safari und Chrome):
//   - querySourceFeatures / queryRenderedFeatures: Zeit, Aufrufe, gelieferte Features, aufgerufen von welcher Datei
//   - GeoJSON-Quellen setData: Zeit auf dem Hauptthread und Aufrufe (die schwere Arbeit liegt im Worker, das sieht man hier nicht)
//   - ml._render: Zeit pro gezeichnetem Frame (CPU), zum Vergleich
//   - Nachrichten an Worker (postMessage): Zahl pro Sekunde (Kachel-Parsen, Straßennetz, ...)
//   - Long Tasks (>50 ms), wo der Browser sie meldet (Chrome)
// Ergebnis: console.table mit "ms/s Hauptthread" je Verursacher, getrennt nach Stillstand und Bewegung.
(async () => {
  const o = window.__orbis;
  if (!o) return console.error('window.__orbis fehlt: Seite mit ?smoke vor dem # öffnen und neu laden.');
  const ml = o.engine.ml;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const STILL_S = 5, MOVE_S = 10;
  let bucket = 'still';
  const stat = { still: new Map(), move: new Map() };
  const add = (key, ms, n = 0) => {
    const m = stat[bucket];
    const e = m.get(key) ?? { ms: 0, calls: 0, features: 0 };
    e.ms += ms; e.calls++; e.features += n;
    m.set(key, e);
  };
  const caller = () => {
    const lines = (new Error().stack ?? '').split('\n').slice(3);
    for (const l of lines) {
      const m = l.match(/\/(src\/[^?:)\s]+|[A-Za-z0-9._-]+\.(?:ts|tsx|js))(?:\?[^:]*)?:(\d+)/);
      if (m && !/maplibre/.test(l)) return m[1].split('/').slice(-2).join('/') + ':' + m[2];
    }
    return '?';
  };

  const undo = [];
  const wrap = (obj, name, fn) => { const orig = obj[name]; obj[name] = fn(orig); undo.push(() => { obj[name] = orig; }); };

  for (const name of ['querySourceFeatures', 'queryRenderedFeatures']) {
    wrap(ml, name, (orig) => function (...a) {
      const t = performance.now();
      const r = orig.apply(this, a);
      const where = caller();
      const what = name === 'querySourceFeatures' ? `${a[0]}/${a[1]?.sourceLayer ?? ''}` : 'rendered';
      add(`${name === 'querySourceFeatures' ? 'querySource' : 'queryRendered'} ${what}  <- ${where}`, performance.now() - t, Array.isArray(r) ? r.length : 0);
      return r;
    });
  }
  for (const [id, spec] of Object.entries(ml.getStyle().sources)) {
    if (spec.type !== 'geojson') continue;
    const src = ml.getSource(id);
    if (!src?.setData) continue;
    const orig = src.setData;
    src.setData = function (d, ...r) {
      const t = performance.now();
      const res = orig.call(this, d, ...r);
      add(`setData ${id}`, performance.now() - t, d?.features?.length ?? 0);
      return res;
    };
    undo.push(() => { src.setData = orig; });
  }
  const origRender = ml._render.bind(ml);
  ml._render = (t) => { const a = performance.now(); const r = origRender(t); add('ZEICHNEN (ml._render)', performance.now() - a); return r; };
  undo.push(() => { ml._render = origRender; });
  wrap(Worker.prototype, 'postMessage', (orig) => function (...a) { add('Worker.postMessage (Anzahl)', 0); return orig.apply(this, a); });

  let longMs = { still: 0, move: 0 }, longN = { still: 0, move: 0 };
  let po;
  try {
    po = new PerformanceObserver((l) => { for (const e of l.getEntries()) { longMs[bucket] += e.duration; longN[bucket]++; } });
    po.observe({ entryTypes: ['longtask'] });
  } catch { po = undefined; }

  const c = ml.getCenter();
  const cam0 = { lng: c.lng, lat: c.lat, zoom: ml.getZoom(), b: ml.getBearing(), p: ml.getPitch() };
  console.log(`Stillstand ${STILL_S} s, dann Rundflug ${MOVE_S} s …`);
  await sleep(STILL_S * 1000);
  bucket = 'move';
  await new Promise((resolve) => {
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / (MOVE_S * 1000));
      ml.jumpTo({
        center: [cam0.lng + 0.003 * Math.sin(t * Math.PI * 4), cam0.lat + 0.002 * Math.sin(t * Math.PI * 6)],
        zoom: cam0.zoom - 0.5 + 1.5 * Math.sin(t * Math.PI * 4), bearing: cam0.b + 360 * t, pitch: cam0.p,
      });
      if (t < 1) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  });
  ml.jumpTo({ center: [cam0.lng, cam0.lat], zoom: cam0.zoom, bearing: cam0.b, pitch: cam0.p });
  for (const u of undo.reverse()) u();
  po?.disconnect();

  const rows = [];
  const secs = { still: STILL_S, move: MOVE_S };
  for (const phase of ['still', 'move']) {
    for (const [k, e] of stat[phase]) rows.push({ Phase: phase === 'still' ? 'Stillstand' : 'Bewegung', Verursacher: k, 'ms pro s': +(e.ms / secs[phase]).toFixed(1), 'Aufrufe pro s': +(e.calls / secs[phase]).toFixed(1), 'ms pro Aufruf': +(e.ms / e.calls).toFixed(2), 'Features pro Aufruf': Math.round(e.features / e.calls) });
    rows.push({ Phase: phase === 'still' ? 'Stillstand' : 'Bewegung', Verursacher: 'Long Tasks >50 ms (nur Chrome)', 'ms pro s': +(longMs[phase] / secs[phase]).toFixed(1), 'Aufrufe pro s': +(longN[phase] / secs[phase]).toFixed(1) });
  }
  rows.sort((a, b) => a.Phase.localeCompare(b.Phase) || b['ms pro s'] - a['ms pro s']);
  console.table(rows);
  window.__mainRows = rows;
  return rows;
})();
