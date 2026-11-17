import { addProtocol } from 'maplibre-gl';

/**
 * Höhenmodell: Mapterhorn (LIDAR-Genauigkeit ab z13 in Deutschland/Europa, global z0–12 Copernicus), alles
 * auf Meereshöhe bezogen. Wo es ab z13 keine Kachel gibt (z. B. Island), wird die nächstgröbere Mapterhorn-Kachel
 * hochskaliert; andere Quellen (AWS Terrain Tiles: je Region Ellipsoidhöhen und Fehlwerte) sind bewusst nicht
 * dabei. Terrarium-Kodierung, 512 px Kacheln.
 */
const MAPTERHORN = 'https://tiles.mapterhorn.com';

/** Tile-URL für die raster-dem-Quelle */
export const DEM_TILES = 'orbis-dem://{z}/{x}/{y}';
/** letzte Zoomstufe mit echten (nativ angefragten) Kacheln – darunter wird in MapLibre überzeichnet */
export const DEM_NATIVE_ZOOM = 16;
const PROTOCOL = 'orbis-dem';
const SIZE = 512;

let registered = false;

/** registriert das Tile-Protokoll einmalig; wird vor dem ersten Kartenstart aufgerufen */
export function registerDemTiles() {
  if (registered) return;
  registered = true;
  addProtocol(PROTOCOL, async (params, abortController) => {
    const [z = 0, x = 0, y = 0] = (params.url.split(`${PROTOCOL}://`)[1] ?? '').split('/').map(Number);
    const signal = abortController.signal;
    try {
      // 1) echte Mapterhorn-Kachel (detaillierteste Lösung)
      const mh = await fetch(`${MAPTERHORN}/${z}/${x}/${y}.webp`, { signal });
      if (mh.ok) return { data: await mh.arrayBuffer() };

      // 2) keine Kachel: die nächstgröbere Mapterhorn-Kachel hochskalieren (nur der passende Quadrant kommt in die Kachel)
      for (let pz = z - 1; pz >= 0; pz--) {
        const tile = await fetchTile(MAPTERHORN, pz, x, y, z, '.webp', signal);
        if (tile) {
          const out = await upscaleQuadrant(tile, x, y, z - pz);
          tile.close();
          return { data: out };
        }
      }
    } catch (e) {
      if (aborted(signal)) throw e;
    }
    throw new Error(`DEM-Kachel ${z}/${x}/${y} nicht verfügbar`);
  });
}

const aborted = (signal?: AbortSignal | null) => signal !== null && signal !== undefined && signal.aborted;

/** Kinderkachel x/y (Zoom z) aus der Elternkachel Zoom pz herausholen; null wenn nicht ladbar */
async function fetchTile(base: string, pz: number, x: number, y: number, z: number, ext: string, signal?: AbortSignal | null): Promise<ImageBitmap | null> {
  try {
    const r = await fetch(`${base}/${pz}/${x >> (z - pz)}/${y >> (z - pz)}${ext}`, { signal });
    return r.ok ? await createImageBitmap(await r.blob()) : null;
  } catch (e) {
    if (aborted(signal)) throw e;
    return null;
  }
}

/** Catmull-Rom-Gewichte für den Bruchteil t zwischen den mittleren zwei von vier Stützstellen */
function cubic(t: number): [number, number, number, number] {
  const t2 = t * t, t3 = t2 * t;
  return [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2];
}

/**
 * Quadrat-Ausschnitt der Elternkachel auf 512 px vergrößern – bikubisch auf den dekodierten Höhen (nicht auf den Farbkanälen), damit
 * das Gelände glatt ist und keine Stufen hat. Die Stützstellen kommen auch jenseits des Quadranten aus der Elternkachel, so passen
 * die Nachbarkacheln einer Elternkachel nahtlos aneinander.
 */
async function upscaleQuadrant(bmp: ImageBitmap, x: number, y: number, levels: number): Promise<ArrayBuffer> {
  const n = 1 << levels;
  const px = x & (n - 1), py = y & (n - 1);
  const [w, h] = [bmp.width, bmp.height];
  const src = new OffscreenCanvas(w, h);
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(bmp, 0, 0);
  const px8 = sctx.getImageData(0, 0, w, h).data;
  const height = new Float32Array(w * h);
  for (let i = 0; i < height.length; i++) height[i] = px8[i * 4]! * 256 + px8[i * 4 + 1]! + px8[i * 4 + 2]! / 256 - 32768;
  const at = (i: number, j: number) => height[Math.min(h - 1, Math.max(0, j)) * w + Math.min(w - 1, Math.max(0, i))]!;

  const out = new OffscreenCanvas(SIZE, SIZE);
  const octx = out.getContext('2d')!;
  const img = octx.createImageData(SIZE, SIZE);
  const d = img.data;
  const [qw, qh] = [w / n, h / n];
  // Spalten einmal vorrechnen: Stützstelle und Gewichte je Ausgabespalte
  const cols = new Int32Array(SIZE), wx = new Float32Array(SIZE * 4);
  for (let i = 0; i < SIZE; i++) {
    const u = px * qw + ((i + 0.5) * qw) / SIZE - 0.5;
    const iu = Math.floor(u);
    cols[i] = iu;
    wx.set(cubic(u - iu), i * 4);
  }
  for (let j = 0; j < SIZE; j++) {
    const v = py * qh + ((j + 0.5) * qh) / SIZE - 0.5;
    const jv = Math.floor(v);
    const wy = cubic(v - jv);
    for (let i = 0; i < SIZE; i++) {
      let sum = 0;
      for (let b = 0; b < 4; b++) {
        let row = 0;
        for (let a = 0; a < 4; a++) row += at(cols[i]! - 1 + a, jv - 1 + b) * wx[i * 4 + a]!;
        sum += row * wy[b]!;
      }
      const e = Math.round((sum + 32768) * 256);
      const o = (j * SIZE + i) * 4;
      d[o] = (e >> 16) & 255; d[o + 1] = (e >> 8) & 255; d[o + 2] = e & 255; d[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out.convertToBlob({ type: 'image/png' }).then((b) => b.arrayBuffer());
}
