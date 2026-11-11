// SondeHub `/sondes?last=<s>`: latest telemetry per radiosonde -> tracks (position, drift, altitude).
import type { TrackObject } from '../../render/tracks';

export type SondeProps = {
  serial: string; type: string; subtype: string; manufacturer: string;
  /** metres */
  alt: number;
  temp: number | undefined; humidity: number | undefined; pressure: number | undefined;
  /** vertical speed, m/s */
  vv: number;
  /** 1 rising, -1 falling, 0 landed / stationary */
  phase: number;
  freq: number | undefined; uploader: string; burst: number | undefined; batt: number | undefined;
};

const n = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function sondes(raw: unknown): TrackObject[] {
  if (typeof raw !== 'object' || raw === undefined) return [];
  const out: TrackObject[] = [];
  for (const s of Object.values(raw as Record<string, Record<string, unknown>>)) {
    const lat = n(s.lat);
    const lng = n(s.lon);
    if (lat === undefined || lng === undefined || typeof s.serial !== 'string') continue;
    const vv = n(s.vel_v) ?? 0;
    const alt = n(s.alt) ?? 0;
    const vh = n(s.vel_h);
    const t = Date.parse(String(s.datetime));
    const burst = n(s.burst_timer);
    out.push({
      id: s.serial,
      lng,
      lat,
      heading: n(s.heading),
      speed: vh ?? undefined,
      t: Number.isFinite(t) ? t : Date.now(),
      props: {
        serial: s.serial,
        type: String(s.type ?? ''),
        subtype: String(s.subtype ?? ''),
        manufacturer: String(s.manufacturer ?? ''),
        alt: Math.round(alt),
        temp: n(s.temp),
        humidity: n(s.humidity),
        pressure: n(s.pressure),
        vv,
        phase: vv > 0.5 ? 1 : vv < -0.5 ? -1 : 0,
        freq: n(s.frequency),
        uploader: String(s.uploader_callsign ?? ''),
        burst: burst !== undefined && burst < 60000 ? burst : undefined,
        batt: n(s.batt),
      } satisfies SondeProps,
    });
  }
  return out;
}
