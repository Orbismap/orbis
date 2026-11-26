import * as THREE from 'three';
import type { Map as MlMap } from 'maplibre-gl';
import type { PowerGridSample } from '../../ext/types';
import type { GeoFrame } from '../world3d/frame';
import { GeoInstances } from '../world3d/instances';
import type { Stage, StagePart } from '../world3d/stage';
import { towerGeometries, towerMaterial } from './models';
import { buildNetwork, spanWires, type Network } from './network';
import { WireMesh, type DrawWire } from './wires';
import { idleThrottle } from '../world3d/terrain';

// 3D power grid: a model at every tower position (design from the tags and the voltage, real or typical height, standing
// on the terrain, turned along the line) and, between the towers, wires that start and end at the insulators of the
// models. The base layer publishes the loaded tiles' towers and lines from zoom 14; the network is worked out once per
// publish (network.ts) and drawn from there.

/** A tower this far outside of the screen (share of the view) is left out. */
const VIEW_MARGIN = 0.35;
/** the terrain under a tower counts as changed from this much (m) */
const TERRAIN_STEP_M = 0.5;
const EARTH_RGB: [number, number, number] = (() => {
  const c = new THREE.Color(0x8d969f);
  return [c.r, c.g, c.b];
})();

export class StromnetzPart implements StagePart {
  readonly object = new THREE.Group();
  private network: Network = { towers: [], spans: [] };
  /** terrain height under each tower (m) */
  private ground: number[] = [];
  private models = new GeoInstances(towerGeometries(), towerMaterial());
  private wires = new WireMesh();
  private active = false;
  private drawn = 0;
  private matrix = new THREE.Matrix4();

  constructor(private map: MlMap, private stage: Stage) {
    this.object.add(this.models.object, this.wires.object);
    this.object.visible = false;
  }

  /** Towers of the last publish. */
  get count() {
    return this.network.towers.length;
  }

  /** The 3D presentation is on (the layer published towers): the part draws; off: it hides. */
  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    this.object.visible = on;
    if (on) this.map.on('idle', this.onIdle);
    else {
      this.map.off('idle', this.onIdle);
      this.drawn = 0;
    }
    this.stage.wake();
  }

  /** A new list from the channel (towers and lines of the loaded tiles). */
  feed(items: readonly PowerGridSample[]) {
    this.network = buildNetwork(items);
    this.ground = this.network.towers.map((t) => this.terrainAt(t.lng, t.lat));
    this.buildWires();
    this.stage.wake();
  }

  stats() {
    return { powerTowers: this.network.towers.length, powerSpans: this.network.spans.length, powerWires: this.wires.segments, powerDrawn: this.drawn };
  }

  /** Terrain height at a place (m); 0 without 3D terrain or before its tile has arrived. */
  private terrainAt(lng: number, lat: number): number {
    const h = this.map.queryTerrainElevation({ lng, lat });
    return typeof h === 'number' && Number.isFinite(h) ? h : 0;
  }

  /** Terrain tiles arrive after the towers: when the ground under them changed, they and their wires move with it. */
  private onIdle = idleThrottle(() => this.stage.wake(), () => {
    let changed = false;
    this.network.towers.forEach((t, i) => {
      const h = this.terrainAt(t.lng, t.lat);
      if (Math.abs(h - (this.ground[i] ?? 0)) > TERRAIN_STEP_M) changed = true;
      this.ground[i] = h;
    });
    if (!changed) return;
    this.buildWires();
    this.stage.wake();
  });

  private buildWires() {
    const { towers, spans } = this.network;
    const known = new Map<string, [number, number, number]>();
    const colour = new THREE.Color();
    const rgbOf = (hex: string): [number, number, number] => {
      let rgb = known.get(hex);
      if (!rgb) {
        colour.set(hex);
        rgb = [colour.r, colour.g, colour.b];
        known.set(hex, rgb);
      }
      return rgb;
    };
    const out: DrawWire[] = [];
    for (const s of spans) {
      const [a, b] = [towers[s.a]!, towers[s.b]!];
      for (const w of spanWires(a, b, s, this.ground[s.a] ?? 0, this.ground[s.b] ?? 0)) out.push({ points: w.points, rgb: w.earth ? EARTH_RGB : rgbOf(w.color) });
    }
    this.wires.setWires(out);
  }

  update(frame: GeoFrame): boolean {
    if (!this.active) return false;
    const b = this.map.getBounds();
    const centre = this.map.getCenter();
    const padLon = (b.getEast() - b.getWest()) * VIEW_MARGIN;
    const padLat = (b.getNorth() - b.getSouth()) * VIEW_MARGIN;
    const { towers } = this.network;
    this.models.start(frame, towers.length);
    let drawn = 0;
    for (let i = 0; i < towers.length; i++) {
      const t = towers[i]!;
      const lon = t.lng + 360 * Math.round((centre.lng - t.lng) / 360);
      if (lon < b.getWest() - padLon || lon > b.getEast() + padLon || t.lat < b.getSouth() - padLat || t.lat > b.getNorth() + padLat) continue;
      const ground = this.ground[i] ?? 0;
      if (frame.occluded(lon, t.lat, ground)) continue;
      frame.place(this.matrix, lon, t.lat, ground, t.heading, t.scale);
      this.models.add(t.design, this.matrix, 0xffffff);
      drawn++;
    }
    this.models.finish();
    this.models.update(frame);
    this.wires.update(frame);
    this.drawn = drawn;
    return false;
  }

  dispose() {
    this.map.off('idle', this.onIdle);
    this.models.dispose();
    this.wires.dispose();
    this.network = { towers: [], spans: [] };
  }
}
