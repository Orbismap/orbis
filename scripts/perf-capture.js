// Bildvergleich der Basiskarte vor/nach einem Umbau der Layer (Zusammenlegen, Ausdrücke ändern).
// Benutzung (Seite mit ?smoke): Datei in die Konsole kopieren, dann
//   await __cap('before')    // vor dem Umbau, speichert 9 Ansichten in IndexedDB (überlebt das Neuladen)
//   await __cap('after')     // nach dem Umbau
//   await __cmp('before', 'after')   // Tabelle: Anteil abweichender Pixel je Ansicht
// Es werden nur die Layer der Basiskarte gezeichnet (alles andere ist ausgeblendet), Neigung 0.
(() => {
  const VIEWS = [[13.4076, 52.5201, 16.5], [13.4076, 52.5201, 13], [13.4, 52.52, 10], [11.4, 47.27, 9], [10.3, 51.1, 6], [-73.9751, 40.7552, 15], [10.0, 53.55, 12], [-122.42, 37.77, 11], [2.35, 48.86, 14]];
  const db = () => new Promise((res, rej) => { const q = indexedDB.open('perfcap', 1); q.onupgradeneeded = () => q.result.createObjectStore('s'); q.onsuccess = () => res(q.result); q.onerror = rej; });
  const put = async (k, v) => { const d = await db(); await new Promise((res, rej) => { const tx = d.transaction('s', 'readwrite'); tx.objectStore('s').put(v, k); tx.oncomplete = res; tx.onerror = rej; }); };
  const get = async (k) => { const d = await db(); return new Promise((res, rej) => { const r = d.transaction('s').objectStore('s').get(k); r.onsuccess = () => res(r.result); r.onerror = rej; }); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__cap = async (tag) => {
    const ml = window.__orbis.engine.ml;
    for (const l of ml.getStyle().layers) if (!l.id.startsWith('bm-orbis-karte')) ml.setLayoutProperty(l.id, 'visibility', 'none');
    const out = {};
    for (const [i, [lng, lat, z]] of VIEWS.entries()) {
      ml.jumpTo({ center: [lng, lat], zoom: z, pitch: 0, bearing: 0 });
      await sleep(800);
      for (let k = 0; k < 60 && !ml.areTilesLoaded(); k++) await sleep(250);
      await sleep(800);
      out[i] = await new Promise((res) => { ml.once('render', () => res(ml.getCanvas().toDataURL('image/png'))); ml.triggerRepaint(); });
    }
    await put(tag, out);
    return Object.keys(out).length + ' Ansichten gespeichert';
  };
  const img = (u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = u; });
  const px = async (u) => { const i = await img(u); const c = new OffscreenCanvas(i.width, i.height); const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height).data; };
  window.__cmp = async (a, b) => {
    const [A, B] = [await get(a), await get(b)];
    const rows = [];
    for (const i of Object.keys(A)) {
      const [p, q] = [await px(A[i]), await px(B[i])];
      let diff = 0, big = 0, max = 0;
      for (let k = 0; k < p.length; k += 4) {
        const d = Math.max(Math.abs(p[k] - q[k]), Math.abs(p[k + 1] - q[k + 1]), Math.abs(p[k + 2] - q[k + 2]));
        if (d > 3) diff++; if (d > 24) big++; if (d > max) max = d;
      }
      const n = p.length / 4;
      rows.push({ Ansicht: +i, 'Pixel >3 (%)': +(100 * diff / n).toFixed(2), 'Pixel >24 (%)': +(100 * big / n).toFixed(2), 'max Abweichung': max });
    }
    console.table(rows);
    return rows;
  };
})();
