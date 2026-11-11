// Launch Library 2 `launches/upcoming` (mirror: live bucket `space/launches/upcoming.json`) -> launches and launch pads.
export type Launch = {
  id: string;
  name: string;
  /** no earlier than, ms since epoch */
  net: number;
  /** status abbreviation (Go, TBC, TBD, Hold …) */
  status: string;
  statusName: string;
  provider: string;
  rocket: string;
  mission: string;
  missionType: string;
  orbit: string;
  padId: number;
  pad: string;
  location: string;
  country: string;
  lng: number;
  lat: number;
  webcast: string;
  webcastLive: boolean;
  info: string;
  windowStart?: number;
  windowEnd?: number;
  precision: string;
};

export type LaunchPad = { id: number; name: string; location: string; country: string; lng: number; lat: number; launches: Launch[] };

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function pickVideo(l: Any): string {
  const vids = (Array.isArray(l.vid_urls) ? l.vid_urls : []) as Any[];
  const sorted = [...vids].filter((v) => typeof v.url === 'string').sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  const yt = sorted.find((v) => /youtube|youtu\.be/.test(v.url));
  return (yt ?? sorted[0])?.url ?? '';
}

export function launchesParse(raw: unknown): Launch[] {
  const list = (raw as { results?: Any[] } | null)?.results;
  if (!Array.isArray(list)) return [];
  const out: Launch[] = [];
  for (const l of list) {
    const pad = l.pad as Any | undefined;
    const net = Date.parse(String(l.net));
    const lat = Number(pad?.latitude);
    const lng = Number(pad?.longitude);
    if (!pad || !Number.isFinite(net) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const info = ((l.info_urls ?? []) as Any[]).find((i) => typeof i.url === 'string')?.url ?? '';
    out.push({
      id: String(l.id),
      name: String(l.name ?? ''),
      net,
      status: String(l.status?.abbrev ?? ''),
      statusName: String(l.status?.name ?? ''),
      provider: String(l.launch_service_provider?.name ?? ''),
      rocket: String(l.rocket?.configuration?.full_name ?? l.rocket?.configuration?.name ?? ''),
      mission: String(l.mission?.name ?? ''),
      missionType: String(l.mission?.type ?? ''),
      orbit: String(l.mission?.orbit?.name ?? ''),
      padId: Number(pad.id),
      pad: String(pad.name ?? ''),
      location: String(pad.location?.name ?? ''),
      country: String(pad.country?.name ?? pad.location?.country?.name ?? ''),
      lng,
      lat,
      webcast: pickVideo(l),
      webcastLive: l.webcast_live === true,
      info,
      windowStart: Date.parse(String(l.window_start)) || undefined,
      windowEnd: Date.parse(String(l.window_end)) || undefined,
      precision: String(l.net_precision?.name ?? ''),
    });
  }
  return out.sort((a, b) => a.net - b.net);
}

/** Groups launches by pad, launches sorted ascending; pads sorted by their next launch. */
export function groupByPad(launches: Launch[]): LaunchPad[] {
  const pads = new Map<number, LaunchPad>();
  for (const l of launches) {
    let p = pads.get(l.padId);
    if (!p) pads.set(l.padId, (p = { id: l.padId, name: l.pad, location: l.location, country: l.country, lng: l.lng, lat: l.lat, launches: [] }));
    p.launches.push(l);
  }
  return [...pads.values()].sort((a, b) => a.launches[0]!.net - b.launches[0]!.net);
}
