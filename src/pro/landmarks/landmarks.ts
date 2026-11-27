import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { Map as MlMap } from 'maplibre-gl';
import type { ReadonlySignal } from '@preact/signals';
import type { LandmarkSample } from '../../ext/types';
import type { GeoFrame } from '../world3d/frame';
import type { Stage, StagePart } from '../world3d/stage';
import { exaggeration, idleThrottle, loadedGroundAt, MIN_READ } from '../world3d/terrain';
import { LandmarkBadges } from './badges';
import { contactsOf, standOn, type Contact } from './ground';

// 3D landmarks: the low-poly GLB models of the Landmarks dataset (CC0), each standing where its OpenStreetMap building is. The base
// finds the landmarks near the view and hides the buildings they replace (features/landmarks/source.ts); this part loads the models
// on demand and draws them. Always drawn, whatever the buildings layer or the roof data say: the model has priority.
// The files are metres, X east / Y up / Z south, y = 0 at the lowest ground under the footprint; the part turns them into the
// stage's convention (x east, y north, z up) and stands them on the terrain, whole (ground.ts).

/** GLB (x east, y up, z south) → stage (x east, y north, z up): a rotation, the winding stays */
const TO_STAGE = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
/** models loading at the same time */
const MAX_LOADING = 4;
/** parsed models kept (the ones in view are never dropped) */
const MAX_CACHED = 48;
/** a model moves when the ground under it changed by this much (m) */
const TERRAIN_STEP_M = 0.1;
/** a model standing on the lowest ground is pushed this far in (m): the terrain is read at points and drawn as a mesh, which may dip between them */
const SINK_M = 0.3;
/** a model is never flatter than this many metres (the 2.5D buildings keep 3 m as well) */
const MIN_HEIGHT_M = 3;
/** a model this far outside of the screen (share of the view) is not drawn */
const VIEW_MARGIN = 0.25;
/** the ground of the flat map without terrain, in render space (z up, the map's surface at 0): what lies below it is cut off */
const FLAT_GROUND = [new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)];

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LNG = 111_320;

/**
 * The lights of a model at night, by the material's name like in the dataset (tools/render.ts there): `window*` and `entrance` glow warm,
 * `lamp*` pale, `neon*` in their own colour. The glow is emissive, so the stage's light does not change it; the base colour goes dark.
 */
const GLOW: [RegExp, (base: THREE.Color) => THREE.Color][] = [
  [/^(window|entrance)/, () => new THREE.Color().setRGB(1, 0.72, 0.4, THREE.LinearSRGBColorSpace)],
  [/^lamp/, () => new THREE.Color().setRGB(1, 0.8, 0.55, THREE.LinearSRGBColorSpace)],
  [/^neon/, (c) => new THREE.Color().setRGB(Math.min(1, c.r * 1.3 + 0.04), Math.min(1, c.g * 1.3 + 0.04), Math.min(1, c.b * 1.3 + 0.04), THREE.LinearSRGBColorSpace)],
];
function setNight(m: THREE.Material, on: boolean) {
  const lambert = m as THREE.MeshLambertMaterial;
  const glow = GLOW.find(([re]) => re.test(m.name))?.[1];
  if (!glow || !lambert.emissive) return;
  const saved = (m.userData.day ??= { color: lambert.color.clone(), emissive: lambert.emissive.clone(), intensity: lambert.emissiveIntensity }) as { color: THREE.Color; emissive: THREE.Color; intensity: number };
  if (on) {
    lambert.emissive.copy(glow(saved.color));
    lambert.emissiveIntensity = 1;
    lambert.color.copy(saved.color).multiplyScalar(0.25);
  } else {
    lambert.emissive.copy(saved.emissive);
    lambert.emissiveIntensity = saved.intensity;
    lambert.color.copy(saved.color);
  }
  lambert.needsUpdate = true;
}

interface Model {
  object: THREE.Object3D;
  materials: THREE.Material[];
  /** where it could touch the ground (ground.ts) */
  contacts: Contact[];
  /** the file's own movements (a turning wheel, a swinging ship) */
  animations: THREE.AnimationClip[];
}

interface Entry {
  sample: LandmarkSample;
  root: THREE.Group;
  /** the model in the root, once loaded, and the file it came from (the coarse or the finer one) */
  model?: Model;
  url?: string;
  /** plays the model's animations */
  mixer?: THREE.AnimationMixer;
  /** where the model stands: the real terrain height its y = 0 goes on, and whether its feet set it; undefined until the terrain under it is known */
  stand?: { base: number; byFeet: boolean };
  /** the terrain under it is to be read again */
  stale: boolean;
}

/** The stage lights models with Lambert materials: the file's PBR materials (palette colours, no textures) become plain ones. */
function toLambert(model: THREE.Object3D) {
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // the part culls by footprint itself: the stage's camera holds the map's composed matrix, which three's own test cannot use
    mesh.frustumCulled = false;
    const convert = (m: THREE.Material): THREE.Material => {
      const s = m as THREE.MeshStandardMaterial;
      const out = new THREE.MeshLambertMaterial({
        name: s.name,
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

function materialsOf(model: THREE.Object3D): THREE.Material[] {
  const out: THREE.Material[] = [];
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) out.push(...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
  });
  return out;
}

function disposeModel(model: THREE.Object3D) {
  model.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
  for (const m of materialsOf(model)) {
    (m as THREE.MeshLambertMaterial).map?.dispose();
    m.dispose();
  }
}

export class LandmarksPart implements StagePart {
  readonly object = new THREE.Group();
  private entries = new Map<string, Entry>();
  /** parsed models by URL (oldest first); null: could not be loaded, not asked again */
  private models = new Map<string, Model | null>();
  private loading = new Set<string>();
  private active = false;
  private drawn = 0;
  private matrix = new THREE.Matrix4();
  private squash = new THREE.Matrix4();
  /** the basemap is dark: the windows are lit */
  private night = false;
  /** the time of the frame before (ms), for the animations */
  private last = 0;
  /** no animations for whoever asks for less motion */
  private still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  private stopDark?: () => void;
  private badges: LandmarkBadges;

  constructor(private map: MlMap, private stage: Stage, private heightFactor: () => number = () => 1, dark?: ReadonlySignal<boolean>, labelsVisible?: ReadonlySignal<boolean>, tierLimit?: ReadonlySignal<unknown>) {
    this.object.visible = false;
    this.badges = new LandmarkBadges(map, heightFactor, labelsVisible, tierLimit);
    this.stopDark = dark?.subscribe((on) => {
      this.night = on;
      for (const model of this.models.values()) if (model) for (const m of model.materials) setNight(m, on);
      this.stage.wake();
    });
  }

  get count() {
    return this.entries.size;
  }

  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    this.object.visible = on;
    if (on) this.listen();
    else this.unlisten();
    this.stage.wake();
  }

  /** A new list from the channel: models that are no longer listed leave, new ones start loading. */
  feed(items: readonly LandmarkSample[]) {
    const next = new Map<string, Entry>();
    for (const sample of items) {
      const had = this.entries.get(sample.id);
      if (had && had.sample.url === sample.url && had.sample.detail?.url === sample.detail?.url) { had.sample = sample; next.set(sample.id, had); continue; }
      const root = new THREE.Group();
      root.matrixAutoUpdate = false;
      root.visible = false;
      next.set(sample.id, { sample, root, stale: true });
      this.object.add(root);
    }
    for (const [id, e] of this.entries) if (next.get(id) !== e) this.object.remove(e.root);
    this.entries = next;
    this.badges.setItems(items);
    this.fill();
    this.stage.wake();
  }

  stats() {
    return { landmarks: this.entries.size, landmarksDrawn: this.drawn };
  }

  private listen() {
    this.map.on('idle', this.onIdle);
    this.map.on('moveend', this.onGround);
    this.map.on('terrain', this.onGround);
    this.map.on('sourcedata', this.onSource);
    this.map.on('zoomend', this.onZoom);
    this.onGround();
    this.fill();
  }

  private unlisten() {
    this.map.off('idle', this.onIdle);
    this.map.off('moveend', this.onGround);
    this.map.off('terrain', this.onGround);
    this.map.off('sourcedata', this.onSource);
    this.map.off('zoomend', this.onZoom);
  }

  /** Coming close brings the finer models. */
  private onZoom = () => this.fill();

  /** The file a landmark is shown with at the zoom of the moment. */
  private wanted(s: LandmarkSample): string {
    // a finer file that failed to load leaves the coarse one
    return s.detail && this.map.getZoom() >= s.detail.minZoom && this.models.get(s.detail.url) !== null ? s.detail.url : s.url;
  }

  /** The drawn terrain may differ now (another view, another terrain, new tiles): every model's ground is read again when the map rests. */
  private onGround = () => {
    for (const e of this.entries.values()) e.stale = true;
  };

  private onSource = (e: { sourceId?: string; tile?: unknown }) => {
    if (e.tile && e.sourceId === this.map.getTerrain()?.source) this.onGround();
  };

  /**
   * Reads the terrain under a model and says where it stands. Returns true when it moved. Heights that are not known (their tiles are
   * not loaded) are left out; without any, the model stays where it was.
   */
  private readGround(e: Entry): boolean {
    const model = e.model;
    // while the terrain is off or almost flat a height says nothing: read it once it is up
    if (!model || exaggeration(this.map) < MIN_READ) return false;
    e.stale = false;
    const { lng, lat } = e.sample;
    const kx = M_PER_DEG_LNG * Math.cos((lat * Math.PI) / 180);
    const ground = model.contacts.map(([x, , z]) => loadedGroundAt(this.map, lng + x / kx, lat - z / M_PER_DEG_LAT) ?? NaN);
    const stand = standOn(model.contacts, ground, e.sample.overTerrain);
    if (!stand) return false;
    const moved = !e.stand || e.stand.byFeet !== stand.byFeet || Math.abs(e.stand.base - stand.base) > TERRAIN_STEP_M;
    if (moved) e.stand = stand;
    return moved;
  }

  /** Terrain tiles arrive after the models: when the ground under one changed, it moves with it. */
  private onIdle = idleThrottle(() => this.stage.wake(), () => {
    const b = this.map.getBounds();
    let changed = false;
    for (const e of this.entries.values()) {
      const [w, so, ea, n] = e.sample.bounds;
      // only what is in view: the others are read when the view comes to them (moveend)
      if (e.stale && ea >= b.getWest() && w <= b.getEast() && n >= b.getSouth() && so <= b.getNorth() && this.readGround(e)) changed = true;
    }
    if (changed) this.stage.wake();
  });

  /** Starts the loads that are due and puts loaded models into their places; the model shown stays until the next one is there. */
  private fill() {
    for (const e of this.entries.values()) {
      const url = this.wanted(e.sample);
      if (e.url === url) continue;
      const model = this.models.get(url);
      if (model) {
        this.show(e, url, model);
        // a model that is drawn is the newest of the cache
        this.models.delete(url);
        this.models.set(url, model);
      } else if (model === undefined && !this.loading.has(url) && this.loading.size < MAX_LOADING) {
        this.load(url);
      }
    }
  }

  private show(e: Entry, url: string, model: Model) {
    this.badges.modelReady(e.sample, model.object);
    const copy = model.object.clone();
    e.mixer?.stopAllAction();
    e.mixer = undefined;
    e.root.clear();
    e.root.add(copy);
    e.model = model;
    e.url = url;
    if (model.animations.length && !this.still) {
      // a track names its node by name or, without one, by id: the copy takes over the ids
      const ids: string[] = [];
      model.object.traverse((o) => ids.push(o.uuid));
      let i = 0;
      copy.traverse((o) => { o.uuid = ids[i++]!; });
      e.mixer = new THREE.AnimationMixer(copy);
      for (const clip of model.animations) e.mixer.clipAction(clip).play();
    }
    e.stale = true;
    this.readGround(e);
  }

  private load(url: string) {
    this.loading.add(url);
    loader.loadAsync(url).then(
      (gltf) => {
        toLambert(gltf.scene);
        const materials = materialsOf(gltf.scene);
        for (const m of materials) setNight(m, this.night);
        // the nodes the file's animations move: they are no feet to stand on
        const moving = new Set(gltf.animations.flatMap((clip) => clip.tracks.map((t) => t.name.split('.')[0]!)));
        this.models.set(url, { object: gltf.scene, materials, contacts: contactsOf(gltf.scene, moving), animations: gltf.animations });
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
    const used = new Set([...this.entries.values()].flatMap((e) => [e.url, this.wanted(e.sample)]));
    for (const [url, model] of this.models) {
      if (this.models.size <= MAX_CACHED) break;
      if (used.has(url)) continue;
      this.models.delete(url);
      if (model) disposeModel(model.object);
    }
  }

  update(frame: GeoFrame, now: number): boolean {
    if (!this.active) return false;
    const seconds = this.last ? Math.min(0.1, Math.max(0, now - this.last) / 1000) : 0;
    this.last = now;
    let moving = false;
    const b = this.map.getBounds();
    const centre = this.map.getCenter();
    const padLon = (b.getEast() - b.getWest()) * VIEW_MARGIN;
    const padLat = (b.getNorth() - b.getSouth()) * VIEW_MARGIN;
    let drawn = 0;
    const flat = this.heightFactor();
    const ex = exaggeration(this.map);
    for (const e of this.entries.values()) {
      const s = e.sample;
      const lon = s.lng + 360 * Math.round((centre.lng - s.lng) / 360);
      // the whole footprint counts, not its middle: a long bridge is in view when only one end is
      const shift = lon - s.lng;
      const [bw, bs, be, bn] = s.bounds;
      const out = be + shift < b.getWest() - padLon || bw + shift > b.getEast() + padLon || bn < b.getSouth() - padLat || bs > b.getNorth() + padLat;
      // on terrain a model waits until the ground under it is known: placed at a guess it would sit under the hill or in the air
      const waits = !e.stand && ex >= MIN_READ;
      // real heights are kept, the exaggeration of the moment multiplies them: the model moves with the terrain every frame
      const ground = (e.stand?.base ?? 0) * ex - (ex > 0 && e.stand && !e.stand.byFeet ? SINK_M : 0);
      if (out || !e.model || waits || frame.occluded(lon, s.lat, ground)) { e.root.visible = false; continue; }
      // the file has its bearing and scale baked in: placed unturned, at true size
      // flattened, the model is lifted by up to MIN_HEIGHT_M, like the 2.5D buildings (their height is MIN_HEIGHT_M + the share): the map's
      // terrain is only a metre or two exact, and under a model a few decimetres high it would cover the feet of it
      // seen from above the model is flatter, like the 2.5D buildings: one factor on its height (steps keep their proportions),
      // but never below MIN_HEIGHT_M. The file's y is up.
      const up = s.heightM > 0 ? Math.max(flat, Math.min(1, MIN_HEIGHT_M / s.heightM)) : flat;
      // the dataset's elevation moves the whole model: up onto what the map does not draw (a pier), or down for a stadium's dug bowl,
      // whose lower part the ground hides, like on the dataset's own map. Without terrain nothing hides it, so it is cut off.
      frame.place(this.matrix, lon, s.lat, ground + s.elevationM * up + MIN_HEIGHT_M * (1 - flat));
      if (s.elevationM < 0) {
        const cut = ex === 0 && !frame.globe ? FLAT_GROUND : null;
        for (const m of e.model.materials) m.clippingPlanes = cut;
      }
      e.root.matrix.multiplyMatrices(this.matrix, TO_STAGE).multiply(this.squash.makeScale(1, up, 1));
      e.root.matrixWorldNeedsUpdate = true;
      e.root.visible = true;
      drawn++;
      if (e.mixer) { e.mixer.update(seconds); moving = true; }
    }
    this.drawn = drawn;
    return moving;
  }

  dispose() {
    this.stopDark?.();
    this.badges.dispose();
    this.unlisten();
    for (const m of this.models.values()) if (m) disposeModel(m.object);
    this.models.clear();
    this.entries.clear();
  }
}
