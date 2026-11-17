import * as THREE from 'three';
import type { Map as MlMap } from 'maplibre-gl';
import type { TreeSample } from '../../ext/types';
import type { GeoFrame } from '../world3d/frame';
import { GeoInstances } from '../world3d/instances';
import type { Stage, StagePart } from '../world3d/stage';
import { TREE_H, modelKey, treeGeometries, treeMaterial, type TreeShape } from './models';

// 3D trees: a smooth model at every tree position of the channel (shape from the leaf type and the tree's id, height from the
// tags or a guess, standing on the terrain, turned at random). The base layer publishes the trees of the loaded tiles near the
// view from zoom 15; trees close to the camera get the smooth model, far ones the cheap one.

/** A tree this far outside of the screen (share of the view) is left out. */
const VIEW_MARGIN = 0.2;
/** the terrain under a tree counts as changed from this much (m) */
const TERRAIN_STEP_M = 0.5;
/** From this height on screen (px) a tree gets the smooth model. */
const HIGH_DETAIL_PX = 22;
const BROAD_SHAPES: readonly TreeShape[] = ['rund', 'oval', 'breit'];

/** A number in 0..1 that always comes out the same for the same id (FNV-1a). */
export function unit(id: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** The model of a genus (lower case), for the trees that have one. The rest goes by the leaf type. */
const GENUS_SHAPE: Record<string, TreeShape> = {
  quercus: 'eiche',
  betula: 'birke',
  populus: 'pappel',
  salix: 'weide',
  pinus: 'kiefer',
  picea: 'nadel', abies: 'nadel', larix: 'nadel', pseudotsuga: 'nadel', cedrus: 'nadel', tsuga: 'nadel',
  cupressus: 'zypresse', thuja: 'zypresse', juniperus: 'zypresse', taxus: 'zypresse', chamaecyparis: 'zypresse', cupressocyparis: 'zypresse',
  phoenix: 'palme', washingtonia: 'palme', trachycarpus: 'palme', cocos: 'palme', chamaerops: 'palme', butia: 'palme', livistona: 'palme', roystonea: 'palme', syagrus: 'palme',
};

/** Height of an untagged tree by its genus (m), where it differs from the 9 m broadleaf / 12 m conifer default. */
const TYPICAL_H: Partial<Record<TreeShape, number>> = { pappel: 18, palme: 9, weide: 10, zypresse: 8, kiefer: 14, eiche: 14 };

const genusShape = (genus?: string): TreeShape | undefined => (genus ? GENUS_SHAPE[genus] : undefined);

/** Height of a hedge in metres when the channel gives none (it always does), and the range a hedge is held to. */
const HEDGE_HEIGHT_M = 1.6;

/** Height of the model in metres: the tagged one, else guessed from the trunk, else a typical tree. */
export function treeHeight(t: Pick<TreeSample, 'heightM' | 'circumferenceM' | 'leafType' | 'genus' | 'hedge'>): number {
  if (t.hedge) return Math.min(6, Math.max(0.5, t.heightM ?? HEDGE_HEIGHT_M));
  const typical = TYPICAL_H[genusShape(t.genus) ?? 'rund'] ?? (t.leafType === 'needleleaved' ? 12 : 9);
  const h = t.heightM ?? (t.circumferenceM ? 4 + 5 * t.circumferenceM : typical);
  return Math.min(40, Math.max(2, h));
}

export function shapeOf(t: Pick<TreeSample, 'id' | 'leafType' | 'genus' | 'hedge'>): TreeShape {
  if (t.hedge) return 'busch';
  const byGenus = genusShape(t.genus);
  if (byGenus) return byGenus;
  if (t.leafType === 'needleleaved') return 'nadel';
  return BROAD_SHAPES[Math.floor(unit(t.id) * BROAD_SHAPES.length)]!;
}

const grey = (v: number) => {
  const c = Math.round(Math.min(1, v) * 255);
  return (c << 16) | (c << 8) | c;
};

interface Placed {
  shape: TreeShape;
  heading: number;
  /** uniform scale of the model (metres of height / nominal height) */
  scale: number;
  /** instance colour: a grey around white, so that trees differ a little in brightness */
  tint: number;
}

export class BaeumePart implements StagePart {
  readonly object = new THREE.Group();
  private trees: readonly TreeSample[] = [];
  private placed: Placed[] = [];
  /** terrain height under each tree (m) */
  private ground: number[] = [];
  private models = new GeoInstances(treeGeometries(), treeMaterial());
  private active = false;
  private drawn = 0;
  private matrix = new THREE.Matrix4();

  constructor(private map: MlMap, private stage: Stage) {
    this.object.add(this.models.object);
    this.object.visible = false;
  }

  /** Trees of the last publish. */
  get count() {
    return this.trees.length;
  }

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

  /** A new list from the channel. */
  feed(items: readonly TreeSample[]) {
    this.trees = items;
    this.placed = items.map((t) => ({
      shape: shapeOf(t),
      heading: unit(t.id, 1) * 360,
      scale: treeHeight(t) / TREE_H,
      tint: grey(0.88 + unit(t.id, 2) * 0.12),
    }));
    this.ground = items.map((t) => this.terrainAt(t.lng, t.lat));
    this.stage.wake();
  }

  stats() {
    return { trees: this.trees.length, treesDrawn: this.drawn };
  }

  /** Terrain height at a place (m); 0 without 3D terrain or before its tile has arrived. */
  private terrainAt(lng: number, lat: number): number {
    const h = this.map.queryTerrainElevation({ lng, lat });
    return typeof h === 'number' && Number.isFinite(h) ? h : 0;
  }

  /** Terrain tiles arrive after the trees: when the ground under them changed, they move with it. */
  private onIdle = () => {
    let changed = false;
    this.trees.forEach((t, i) => {
      const h = this.terrainAt(t.lng, t.lat);
      if (Math.abs(h - (this.ground[i] ?? 0)) > TERRAIN_STEP_M) changed = true;
      this.ground[i] = h;
    });
    if (changed) this.stage.wake();
  };

  update(frame: GeoFrame): boolean {
    if (!this.active) return false;
    const b = this.map.getBounds();
    const centre = this.map.getCenter();
    const padLon = (b.getEast() - b.getWest()) * VIEW_MARGIN;
    const padLat = (b.getNorth() - b.getSouth()) * VIEW_MARGIN;
    const trees = this.trees;
    this.models.start(frame, trees.length);
    let drawn = 0;
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i]!;
      const lon = t.lng + 360 * Math.round((centre.lng - t.lng) / 360);
      if (lon < b.getWest() - padLon || lon > b.getEast() + padLon || t.lat < b.getSouth() - padLat || t.lat > b.getNorth() + padLat) continue;
      const ground = this.ground[i] ?? 0;
      if (frame.occluded(lon, t.lat, ground)) continue;
      const p = this.placed[i]!;
      const detail = (TREE_H * p.scale) / frame.metresPerPixel(lon, t.lat, ground) >= HIGH_DETAIL_PX ? 'hoch' : 'niedrig';
      frame.place(this.matrix, lon, t.lat, ground, p.heading, p.scale);
      this.models.add(modelKey(p.shape, detail), this.matrix, p.tint);
      drawn++;
    }
    this.models.finish();
    this.models.update(frame);
    this.drawn = drawn;
    return false;
  }

  dispose() {
    this.map.off('idle', this.onIdle);
    this.models.dispose();
    this.trees = [];
    this.placed = [];
  }
}
