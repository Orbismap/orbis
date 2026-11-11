// `orbis-clean://<encoded tile url>`: fetches a raster tile and makes the decorations of a WMS default style
// transparent (semi-transparent grey domain fill and the magenta domain outline of the DWD radar composite),
// so that only the measured precipitation stays. Used by layers/wetter/radar-de.
import * as maplibregl from 'maplibre-gl';

let registered = false;

/** Clears partly transparent grey and magenta-ish pixels (data pixels of the radar scale are fully opaque). */
export function cleanPixels(d: Uint8ClampedArray): void {
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!, a = d[i + 3]!;
    if (a === 0 || a === 255) continue;
    const grey = Math.abs(r - g) < 14 && Math.abs(g - b) < 14;
    const magenta = r > 140 && b > 140 && g < Math.min(r, b) - 50;
    if (grey || magenta) d[i + 3] = 0;
  }
}

export function ensureCleanRasterProtocol(): void {
  if (registered) return;
  registered = true;
  maplibregl.addProtocol('orbis-clean', async (params, abort) => {
    const url = decodeURIComponent(params.url.slice('orbis-clean://'.length));
    const res = await fetch(url, { signal: abort.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bmp = await createImageBitmap(await res.blob());
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const c = cv.getContext('2d')!;
    c.drawImage(bmp, 0, 0);
    const img = c.getImageData(0, 0, bmp.width, bmp.height);
    cleanPixels(img.data);
    c.putImageData(img, 0, 0);
    const blob = await cv.convertToBlob({ type: 'image/png' });
    return { data: await blob.arrayBuffer() };
  });
}
