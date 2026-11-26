// Pure part of the wind turbine channel: what the layer `kraftwerke` has seen of the single turbines in the OpenInfraMap
// tiles (power_generator, source=wind). No map, no three.js; sizes and models are the extension's job.
import { lngNear } from '../../core/geo';
import type { WindTurbineSample } from '../../ext/types';
import { num } from '../openinframap';

/** A turbine as the vector tiles give it. */
export interface RawWindTurbine {
  id: string;
  lng: number;
  lat: number;
  props: Record<string, unknown>;
}

/**
 * The loaded tiles change with every move, so a scan only ever adds: a turbine does not vanish at a tile edge while it is
 * still on screen. When there are too many, what lies farthest from the view goes first.
 */
export class WindTurbineStore {
  private turbines = new Map<string, RawWindTurbine>();

  constructor(private max = 6000) {}

  get size() {
    return this.turbines.size;
  }

  get(id: string): RawWindTurbine | undefined {
    return this.turbines.get(id);
  }

  add(turbines: readonly RawWindTurbine[]) {
    for (const t of turbines) this.turbines.set(t.id, t);
  }

  /** Drops the entries farthest from (lng, lat) beyond the limit. */
  prune(lng: number, lat: number) {
    if (this.turbines.size <= this.max) return;
    const far = (t: RawWindTurbine) => Math.hypot((lngNear(t.lng, lng) - lng) * Math.cos((lat * Math.PI) / 180), t.lat - lat);
    const ranked = [...this.turbines.values()].map((t) => [t.id, far(t)] as const).sort((a, b) => b[1] - a[1]);
    for (const [id] of ranked.slice(0, this.turbines.size - this.max)) this.turbines.delete(id);
  }

  clear() {
    this.turbines.clear();
  }

  /** The samples of everything kept, longitudes next to `centerLng`. */
  samples(centerLng: number): WindTurbineSample[] {
    return [...this.turbines.values()].map((t) => {
      const mw = num(t.props.output);
      return { id: t.id, lng: lngNear(t.lng, centerLng), lat: t.lat, ...(mw !== undefined && mw > 0 ? { outputMw: mw } : {}) };
    });
  }
}
