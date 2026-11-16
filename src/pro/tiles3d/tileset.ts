import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { TilesRenderer } from '3d-tiles-renderer/three';
import { GLTFExtensionsPlugin } from '3d-tiles-renderer/plugins';
import type { Map as MlMap } from 'maplibre-gl';
import type { TilesetSample } from '../../ext/types';
import type { GeoFrame } from '../world3d/frame';
import type { StagePart } from '../world3d/stage';
import { ecefToEnu, proxyCamera } from './mapping';

// Streamed 3D city models (3D Tiles) as a part of the stage. One TilesRenderer per tileset, created when the map looks at its
// box. The tileset's ECEF frame is turned into the local tangent frame at its anchor once (`ecefToEnu`) and that frame is
// placed with `frame.place` like every other object, so globe, flat map and the blend between them all work. The detail
// (LOD) is chosen by the tile renderer from a proxy camera that sees what the map sees (mapping.ts).

/** below this zoom nothing is loaded (a city does not show from afar) */
const MIN_ZOOM = 10;
/** a tileset counts as in view when its box is this much (degrees) around the visible area */
const MARGIN_DEG = 0.01;
const EARTH_R = 6371008.8;

interface Entry {
  sample: TilesetSample;
  tiles: TilesRenderer;
  /** render space ← tangent frame at the anchor (set every frame) */
  root: THREE.Group;
  /** a tile of this tileset has loaded */
  loadedAny: boolean;
  failed: number;
}

/** Curvature correction: the Earth bends away from the flat tangent frame, the flat map does not (see mapping.curvatureLift). */
const SAG = { value: 1 };
function bendToFlat(mat: THREE.Material, mesh: THREE.Mesh, rootInverse: () => THREE.Matrix4) {
  const m = mat as THREE.Material & { userData: Record<string, unknown> };
  if (m.userData.flatBend) return;
  m.userData.flatBend = true;
  // the map's space is mirrored (y points south), which turns the winding of every triangle around
  m.side = THREE.DoubleSide;
  const toEnu = { value: new THREE.Matrix4() };
  const up = { value: new THREE.Vector3() };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSag = SAG;
    shader.uniforms.uToEnu = toEnu;
    shader.uniforms.uUpLocal = up;
    shader.vertexShader = `uniform float uSag;\nuniform mat4 uToEnu;\nuniform vec3 uUpLocal;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        vec3 enu = (uToEnu * vec4(transformed, 1.0)).xyz;
        transformed += uUpLocal * (uSag * dot(enu.xy, enu.xy) * ${(0.5 / EARTH_R).toExponential(8)});
      }`,
    );
  };
  mat.customProgramCacheKey = () => 'orbis-tiles-flat';
  const before = mesh.onBeforeRender;
  mesh.onBeforeRender = function (...args) {
    // tile local space → tangent frame, in double precision; the GPU only gets metres
    toEnu.value.multiplyMatrices(rootInverse(), mesh.matrixWorld);
    const e = toEnu.value.elements;
    const s2 = e[2]! * e[2]! + e[6]! * e[6]! + e[10]! * e[10]!;
    up.value.set(e[2]! / s2, e[6]! / s2, e[10]! / s2);
    before.apply(this, args);
  };
}

export class TilesetPart implements StagePart {
  readonly object = new THREE.Group();
  private entries = new Map<string, Entry>();
  private samples: readonly TilesetSample[] = [];
  private camera = new THREE.PerspectiveCamera();
  private draco: DRACOLoader | null = null;
  private model = new THREE.Matrix4();
  private loading = 0;
  private visibleTiles = 0;

  constructor(private map: MlMap, private onChange: (state: { names: string[]; loading: boolean; error?: string }) => void = () => {}) {
    this.object.visible = false;
    this.object.matrixAutoUpdate = false;
  }

  /** The tilesets the layer offers (a new list replaces the old one). */
  feed(items: readonly TilesetSample[]) {
    this.samples = items;
    const ids = new Set(items.map((i) => i.id));
    for (const [id, e] of this.entries) if (!ids.has(id)) this.drop(id, e);
    this.map.triggerRepaint();
  }

  private drop(id: string, e: Entry) {
    this.object.remove(e.root);
    e.tiles.dispose();
    this.entries.delete(id);
  }

  private create(sample: TilesetSample): Entry {
    this.draco ??= new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
    const tiles = new TilesRenderer(sample.url);
    tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: this.draco, metadata: false, autoDispose: false }));
    // the host is slow (0.2-2 s per tile of 250-770 kB): a little coarser than the default 16 px spares a good share of the tiles
    tiles.errorTarget = 24;
    const root = new THREE.Group();
    root.matrixAutoUpdate = false;
    const [lng, lat] = sample.center;
    const toEnu = ecefToEnu(lng, lat, 0);
    tiles.group.matrixAutoUpdate = false;
    tiles.group.matrix.copy(toEnu);
    root.add(tiles.group);
    this.object.add(root);
    const entry: Entry = { sample, tiles, root, loadedAny: false, failed: 0 };
    const rootInverse = () => root.matrixWorld.clone().invert();
    tiles.addEventListener('load-model', (e) => {
      entry.loadedAny = true;
      (e.scene as THREE.Object3D).traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) bendToFlat(m, mesh, rootInverse);
      });
      this.map.triggerRepaint();
    });
    tiles.addEventListener('needs-update', () => this.map.triggerRepaint());
    tiles.addEventListener('load-error', (e) => {
      entry.failed++;
      console.warn('[tiles3d]', sample.id, e.error);
      this.map.triggerRepaint();
    });
    this.entries.set(sample.id, entry);
    return entry;
  }

  update(frame: GeoFrame): boolean {
    const wanted = this.map.getZoom() >= MIN_ZOOM ? this.inView() : [];
    const names = new Set<string>();
    let failed: string | undefined;
    let busy = false;
    let tileCount = 0;
    for (const s of this.samples) {
      let e = this.entries.get(s.id);
      const on = wanted.includes(s.id);
      if (!e && !on) continue;
      e ??= this.create(s);
      e.root.visible = on;
      if (!on) continue;
      names.add(s.name);
      const [lng, lat] = s.center;
      frame.place(this.model, lng, lat, s.heightOffsetM ?? 0);
      e.root.matrix.copy(this.model);
      e.root.updateMatrixWorld(true);
      const metre = Math.hypot(...frame.basis(lng, lat).east);
      proxyCamera(this.camera, frame.proj, 2 * Math.atan(frame.height / 2 / frame.pxDistance), frame.width, frame.height, metre);
      if (!e.tiles.hasCamera(this.camera)) e.tiles.setCamera(this.camera);
      e.tiles.setResolution(this.camera, frame.width, frame.height);
      e.tiles.update();
      tileCount += e.tiles.visibleTiles.size;
      if (e.failed > 0 && !e.loadedAny) failed = `${s.name}: Kacheln nicht ladbar (Server antwortet nicht oder blockiert)`;
      if (e.tiles.loadProgress < 1) busy = true;
    }
    SAG.value = 1 - frame.t;
    this.object.visible = names.size > 0;
    this.visibleTiles = tileCount;
    this.loading = busy ? 1 : 0;
    this.onChange({ names: [...names], loading: busy, error: failed });
    return busy;
  }

  /** Ids of the tilesets whose box is in or near the visible area. */
  private inView(): string[] {
    const b = this.map.getBounds();
    const [w, s, e, n] = [b.getWest() - MARGIN_DEG, b.getSouth() - MARGIN_DEG, b.getEast() + MARGIN_DEG, b.getNorth() + MARGIN_DEG];
    return this.samples.filter((t) => t.bbox[0] <= e && t.bbox[2] >= w && t.bbox[1] <= n && t.bbox[3] >= s).map((t) => t.id);
  }

  stats() {
    return { tilesets: this.entries.size, tilesVisible: this.visibleTiles, tilesLoading: this.loading };
  }

  dispose() {
    for (const [id, e] of [...this.entries]) this.drop(id, e);
    this.draco?.dispose();
    this.draco = null;
  }
}
