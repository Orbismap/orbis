/** Google encoded polyline -> flat [lng, lat, …]. */
export function decodePolyline(str: string, precision = 5): number[] {
  const f = 10 ** precision;
  const out: number[] = [];
  let i = 0, lat = 0, lon = 0;
  while (i < str.length) {
    for (let which = 0; which < 2; which++) {
      let shift = 0, result = 0, b: number;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && i < str.length);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d;
      else lon += d;
    }
    out.push(lon / f, lat / f);
  }
  return out;
}
