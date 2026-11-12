// Radar tiles off the main thread: RainViewer PNG -> value bytes, and the motion field between two steps.
import { computeFlow, pixelsToBytes } from '../../render/gl/radar-values';

/** PNG bytes of a RainViewer tile -> rain-rate bytes (see render/gl/radar-values.ts). */
export async function radarTile(png: ArrayBuffer): Promise<{ bytes: Uint8Array; size: number }> {
  const bmp = await createImageBitmap(new Blob([png], { type: 'image/png' }));
  const size = bmp.width;
  const c = new OffscreenCanvas(size, bmp.height);
  const cx = c.getContext('2d', { willReadFrequently: true })!;
  cx.drawImage(bmp, 0, 0);
  bmp.close();
  return { bytes: pixelsToBytes(cx.getImageData(0, 0, size, bmp.height).data, size), size };
}

export interface RadarFlowArgs { a: Uint8Array; sa: number; b: Uint8Array; sb: number }

/** Motion field of the rain from step `a` to step `b` of one tile. */
export function radarFlow(args: RadarFlowArgs): Float32Array {
  return computeFlow(args.a, args.sa, args.b, args.sb);
}
