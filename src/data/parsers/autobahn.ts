// Autobahn GmbH traffic API (verkehr.autobahn.de, CORS "*", ETag): per road and service a list of warnings (jams and
// other reports), closures and roadworks. `autobahnItems` turns one answer into point features plus the stretch as line.
import type { Feature, LineString, Point } from 'geojson';
import { haversine } from '../../core/geo';

export type AutobahnKind = 'jam' | 'warning' | 'closure' | 'roadworks';
export type AutobahnService = 'warning' | 'closure' | 'roadworks';

export const AUTOBAHN_KINDS: Record<AutobahnKind, { label: string; color: string }> = {
  jam: { label: 'Stau', color: '#ff4d4d' },
  closure: { label: 'Sperrung', color: '#c45bff' },
  roadworks: { label: 'Baustelle', color: '#ffb020' },
  warning: { label: 'Verkehrsmeldung', color: '#ffe14d' },
};

export type AutobahnProps = {
  id: string; kind: AutobahnKind; sev: number; road: string; title: string; dir: string; delay: number; kmh: number; km: number;
  start: number; end: string; future: boolean; blocked: boolean; desc: string; color: string;
};

interface Item {
  identifier: string;
  title?: string;
  subtitle?: string;
  description?: string[];
  coordinate?: { lat: string | number; long: string | number };
  geometry?: { type: string; coordinates: number[][] };
  startTimestamp?: string;
  delayTimeValue?: string;
  abnormalTrafficType?: string;
  averageSpeed?: string;
  isBlocked?: string | boolean;
  future?: boolean | string;
  display_type?: string;
}

const lengthKm = (c: number[][]): number => {
  let km = 0;
  for (let i = 1; i < c.length; i++) km += haversine([c[i - 1]![0]!, c[i - 1]![1]!], [c[i]![0]!, c[i]![1]!]);
  return km;
};

export function autobahnItems(raw: unknown, service: AutobahnService, road = ''): { points: Feature<Point, AutobahnProps>[]; lines: Feature<LineString, AutobahnProps>[] } {
  const items = ((raw as Record<string, Item[]> | null)?.[service] ?? []) as Item[];
  const points: Feature<Point, AutobahnProps>[] = [];
  const lines: Feature<LineString, AutobahnProps>[] = [];
  for (const it of items) {
    const lat = Number(it.coordinate?.lat), lng = Number(it.coordinate?.long);
    if (!it.identifier || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const delay = Number(it.delayTimeValue);
    const type = it.abnormalTrafficType ?? '';
    const blocked = it.isBlocked === true || it.isBlocked === 'true';
    const kind: AutobahnKind = service === 'closure' ? 'closure' : service === 'roadworks' ? 'roadworks' : type ? 'jam' : 'warning';
    let sev = 1;
    if (kind === 'jam') sev = type === 'STATIONARY_TRAFFIC' || delay >= 15 ? 3 : type === 'QUEUING_TRAFFIC' || delay >= 5 ? 2 : 1;
    else if (kind === 'closure' || blocked) sev = 3;
    const desc = (it.description ?? []).filter((l) => l !== undefined);
    const end = desc.find((l) => /^Ende:/i.test(l))?.replace(/^Ende:\s*/i, '') ?? '';
    const coords = it.geometry?.type === 'LineString' && it.geometry.coordinates.length > 1 ? it.geometry.coordinates : undefined;
    const props: AutobahnProps = {
      id: it.identifier, kind, sev, road: road || (it.title ?? '').split('|')[0]!.trim(),
      title: (it.title ?? '').replace(/^\s*[A-Z]?\d+[a-z]?\s*\|\s*/, ''), dir: (it.subtitle ?? '').trim(),
      delay: Number.isFinite(delay) ? delay : -1, kmh: Number.isFinite(Number(it.averageSpeed)) && it.averageSpeed ? Number(it.averageSpeed) : -1,
      km: coords ? Math.round(lengthKm(coords) * 10) / 10 : -1, start: Date.parse(it.startTimestamp ?? '') || 0, end,
      future: it.future === true || it.future === 'true', blocked, desc: desc.join('\n').replace(/\n{3,}/g, '\n\n').trim(), color: AUTOBAHN_KINDS[kind].color,
    };
    points.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: props });
    if (coords) lines.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: props });
  }
  return { points, lines };
}
