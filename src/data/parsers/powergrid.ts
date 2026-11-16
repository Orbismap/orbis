// Pure part of the power-grid layer: turns the OpenInfraMap tile features (power_tower points, power_line ways) into the
// samples of the power channel. No map, no three.js. It only cleans up (disused, buried, duplicates from overlapping tiles,
// longitudes next to the viewport); which model a tower gets and how the lines connect is the extension's job.
import { num, str, voltageColorOf } from '../openinframap';
import type { PowerGridSample, PowerLineSample, PowerTowerSample } from '../../ext/types';

/** A tower as the vector tiles give it. */
export interface RawPowerTower {
  id: string;
  lng: number;
  lat: number;
  props: Record<string, unknown>;
}

/** A line (or the part of it in one tile) as the vector tiles give it. */
export interface RawPowerLine {
  id: string;
  points: [number, number][];
  props: Record<string, unknown>;
}

const used = (p: Record<string, unknown>) => p.construction !== true && p.disused !== true;
const buried = (p: Record<string, unknown>) =>
  ['underground', 'underwater', 'indoor'].includes(str(p.location)) || ['cable', 'minor_cable'].includes(str(p.type)) || ['bay', 'busbar'].includes(str(p.line));

/** Puts a longitude into the copy of the world next to `centerLng`. */
const near = (lon: number, centerLng: number) => lon + 360 * Math.round((centerLng - lon) / 360);

/** Towers and overhead lines for the channel. `centerLng` keeps all longitudes in the same world copy. */
export function buildPowerSamples(rawTowers: readonly RawPowerTower[], rawLines: readonly RawPowerLine[], centerLng = 0): PowerGridSample[] {
  const out: PowerGridSample[] = [];
  const seenTower = new Set<string>();
  for (const t of rawTowers) {
    if (!used(t.props) || seenTower.has(t.id)) continue;
    seenTower.add(t.id);
    const tower: PowerTowerSample = { kind: 'tower', id: t.id, lng: near(t.lng, centerLng), lat: t.lat, tags: t.props };
    out.push(tower);
  }
  const seenLine = new Set<string>();
  for (const l of rawLines) {
    if (!used(l.props) || buried(l.props) || l.points.length < 2) continue;
    const points = l.points.map(([lng, lat]) => [near(lng, centerLng), lat] as [number, number]);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]!;
      const p = points[i]!;
      while (p[0] - prev[0] > 180) p[0] -= 360;
      while (p[0] - prev[0] < -180) p[0] += 360;
    }
    // the same way comes once per tile that holds it (with a buffer, so also several times per place)
    const key = `${l.id}:${points.length}:${points[0]!.join(',')}:${points[points.length - 1]!.join(',')}`;
    if (seenLine.has(key)) continue;
    seenLine.add(key);
    const circuits = num(l.props.circuits);
    const line: PowerLineSample = { kind: 'line', id: l.id, points, voltageKv: num(l.props.voltage) ?? 0, color: voltageColorOf(num(l.props.voltage) ?? 0), ...(circuits !== undefined && circuits >= 1 ? { circuits: Math.min(6, Math.round(circuits)) } : {}) };
    out.push(line);
  }
  return out;
}

/**
 * What the layer has seen of the grid. The loaded tiles change with every move (tiles around the view are dropped, a
 * tower or a line piece on the far side of a tile edge is gone), so a scan only ever adds: a wire does not vanish while
 * both of its towers are still on screen. When there is too much, what lies farthest from the view goes first.
 */
export class PowerGridStore {
  private towers = new Map<string, RawPowerTower>();
  private lines = new Map<string, RawPowerLine>();

  constructor(private maxTowers = 8000, private maxLines = 6000) {}

  get size() {
    return this.towers.size + this.lines.size;
  }

  add(towers: readonly RawPowerTower[], lines: readonly RawPowerLine[]) {
    for (const t of towers) this.towers.set(t.id, t);
    for (const l of lines) {
      const [a, z] = [l.points[0], l.points[l.points.length - 1]];
      if (a && z) this.lines.set(`${l.id}:${l.points.length}:${a.join(',')}:${z.join(',')}`, l);
    }
  }

  /** Drops the entries farthest from (lng, lat) beyond the limits. */
  prune(lng: number, lat: number) {
    const far = (x: number, y: number) => Math.hypot((x - lng) * Math.cos((lat * Math.PI) / 180), y - lat);
    const trim = <T,>(map: Map<string, T>, max: number, at: (v: T) => [number, number]) => {
      if (map.size <= max) return;
      const ranked = [...map].map(([k, v]) => [k, far(...at(v))] as const).sort((a, b) => b[1] - a[1]);
      for (const [k] of ranked.slice(0, map.size - max)) map.delete(k);
    };
    trim(this.towers, this.maxTowers, (t) => [near(t.lng, lng), t.lat]);
    trim(this.lines, this.maxLines, (l) => {
      const p = l.points[Math.floor(l.points.length / 2)]!;
      return [near(p[0], lng), p[1]];
    });
  }

  clear() {
    this.towers.clear();
    this.lines.clear();
  }

  /** The samples of everything kept, longitudes next to `centerLng`. */
  samples(centerLng: number): PowerGridSample[] {
    return buildPowerSamples([...this.towers.values()], [...this.lines.values()], centerLng);
  }
}
