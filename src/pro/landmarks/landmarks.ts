import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { Map as MlMap } from 'maplibre-gl';
import type { LandmarkSample } from '../../ext/types';
import type { GeoFrame } from '../world3d/frame';
import type { Stage, StagePart } from '../world3d/stage';

// 3D landmarks: the low-poly GLB models of the Landmarks dataset (CC0), each standing where its OpenStreetMap building is. The base
// finds the landmarks near the view and hides the buildings they replace (features/landmarks/source.ts); this part loads the models
// on demand and draws them. Always drawn, whatever the buildings layer or the roof data say: the model has priority.
// The files are metres, X east / Y up / Z south, y = 0 at the lowest ground under the footprint; the part turns them into the
// stage's convention (x east, y north, z up) and stands them on the terrain.

/** GLB (x east, y up, z south) → stage (x east, y north, z up): a rotation, the winding stays */
const TO_STAGE = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
/** models loading at the same time */
const MAX_LOADING = 4;
/** parsed models kept (the ones in view are never dropped) */
const MAX_CACHED = 48;
/** the terrain under a model counts as changed from this much (m) */
const TERRAIN_STEP_M = 0.5;
/** a model this far outside of the screen (share of the view) is not drawn */
const VIEW_MARGIN = 0.25;

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

interface Entry {
  sample: LandmarkSample;
  root: THREE.Group;
  /** lowest terrain under the footprint (m) */
  ground: number;
  filled: boolean;
}

/** The stage lights models with Lambert materials: the file's PBR materials (palette colours, no textures) become plain ones. */
function toLambert(model: THREE.Object3D) {
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const convert = (m: THREE.Material): THREE.Material => {
      const s = m as THREE.MeshStandardMaterial;
      const out = new THREE.MeshLambertMaterial({
        color: s.color ?? 0xffffff,
        map: s.map ?? null,
        vertexColors: !!mesh.geometry.getAttribute('color'),
        transparent: s.transparent,
        opacity: s.opacity,
        side: THREE.DoubleSide,
      });
      if (s.emissive && s.emissiveIntensity > 0 && s.emissive.getHex() !== 0) {
        out.emissive = s.emissive.clone();
        out.emissiveIntensity = Math.min(1, s.emissiveIntensity);
      }
      s.dispose();
      return out;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
  });
}

function disposeModel(model: THREE.Object3D) {
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      (m as THREE.MeshLambertMaterial).map?.dispose();
      m.dispose();
    }
  });
}

export class LandmarksPart implements StagePart {
  readonly object = new THREE.Group();
  private entries = new Map<string, Entry>();
  /** parsed models by URL (oldest first); null: could not be loaded, not asked again */
  private models = new Map<string, THREE.Object3D | null>();
  private loading = new Set<string>();
  private active = false;
  private drawn = 0;
  private matrix = new THREE.Matrix4();

  constructor(private map: MlMap, private stage: Stage) {
    this.object.visible = false;
  }

  get count() {
    return this.entries.size;
  }

  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    this.object.visible = on;
    if (on) this.map.on('idle', this.onIdle);
    else this.map.off('idle', this.onIdle);
    this.stage.wake();
  }

  /** A new list from the channel: models that are no longer listed leave, new ones start loading. */
  feed(items: readonly LandmarkSample[]) {
    const next = new Map<string, Entry>();
    for (const sample of items) {
      const had = this.entries.get(sample.id);
      if (had && had.sample.url === sample.url) { had.sample = sample; next.set(sample.id, had); continue; }
      const root = new THREE.Group();
      root.matrixAutoUpdate = false;
      root.visible = false;
      next.set(sample.id, { sample, root, ground: this.groundOf(sample), filled: false });
      this.object.add(root);
    }
    for (const [id, e] of this.entries) if (next.get(id) !== e) this.object.remove(e.root);
    this.entries = next;
    this.fill();
    this.stage.wake();
  }

  stats() {
    return { landmarks: this.entries.size, landmarksDrawn: this.drawn };
  }

  /** Lowest terrain under the footprint: the corners of its box and the anchor. */
  private groundOf(s: LandmarkSample): number {
    const [w, so, e, n] = s.bounds;
    let low = Infinity;
    for (const [lng, lat] of [[s.lng, s.lat], [w, so], [e, so], [w, n], [e, n]] as const) {
      const h = this.map.queryTerrainElevation({ lng, lat });
      if (typeof h === 'number' && Number.isFinite(h)) low = Math.min(low, h);
    }
    return Number.isFinite(low) ? low : 0;
  }

  /** Terrain tiles arrive after the models: when the ground under one changed, it moves with it. */
  private onIdle = () => {
    let changed = false;
    for (const e of this.entries.values()) {
      const h = this.groundOf(e.sample);
      if (Math.abs(h - e.ground) > TERRAIN_STEP_M) changed = true;
      e.ground = h;
    }
    if (changed) this.stage.wake();
  };

  /** Starts the loads that are due and puts loaded models into their places. */
  private fill() {
    for (const e of this.entries.values()) {
      if (e.filled) continue;
      const url = e.sample.url;
      const model = this.models.get(url);
      if (model) {
        e.root.add(model.clone());
        e.filled = true;
        // a model that is drawn is the newest of the cache
        this.models.delete(url);
        this.models.set(url, model);
      } else if (model === undefined && !this.loading.has(url) && this.loading.size < MAX_LOADING) {
        this.load(url);
      }
    }
  }

  private load(url: string) {
    this.loading.add(url);
    loader.loadAsync(url).then(
      (gltf) => {
        toLambert(gltf.scene);
        this.models.set(url, gltf.scene);
        this.evict();
      },
      () => { this.models.set(url, null); },
    ).finally(() => {
      this.loading.delete(url);
      this.fill();
      this.stage.wake();
    });
  }

  private evict() {
    const used = new Set([...this.entries.values()].map((e) => e.sample.url));
    for (const [url, model] of this.models) {
      if (this.models.size <= MAX_CACHED) break;
      if (used.has(url)) continue;
      this.models.delete(url);
      if (model) disposeModel(model);
    }
  }

  update(frame: GeoFrame): boolean {
    if (!this.active) return false;
    const b = this.map.getBounds();
    const centre = this.map.getCenter();
    const padLon = (b.getEast() - b.getWest()) * VIEW_MARGIN;
    const padLat = (b.getNorth() - b.getSouth()) * VIEW_MARGIN;
    let drawn = 0;
    for (const e of this.entries.values()) {
      const s = e.sample;
      const lon = s.lng + 360 * Math.round((centre.lng - s.lng) / 360);
      const out = lon < b.getWest() - padLon || lon > b.getEast() + padLon || s.lat < b.getSouth() - padLat || s.lat > b.getNorth() + padLat;
      if (out || !e.filled || frame.occluded(lon, s.lat, e.ground)) { e.root.visible = false; continue; }
      // the file has its bearing and scale baked in: placed unturned, at true size
      frame.place(this.matrix, lon, s.lat, e.ground + s.elevationM);
      e.root.matrix.multiplyMatrices(this.matrix, TO_STAGE);
      e.root.matrixWorldNeedsUpdate = true;
      e.root.visible = true;
      drawn++;
    }
    this.drawn = drawn;
    return false;
  }

  dispose() {
    this.map.off('idle', this.onIdle);
    for (const m of this.models.values()) if (m) disposeModel(m);
    this.models.clear();
    this.entries.clear();
  }
}
