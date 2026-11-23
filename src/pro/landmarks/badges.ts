import * as THREE from 'three';
import type { Map as MlMap } from 'maplibre-gl';
import { effect, type ReadonlySignal } from '@preact/signals';
import type { LandmarkSample } from '../../ext/types';

// The badges of the 3D landmarks on the map, like the pictures of famous buildings in Apple Maps: a big round marker with the building in
// it. The picture is rendered from the landmark's own model (a 3/4 view on a night-sky disc), once per landmark, as soon as the model is
// loaded; only landmarks with a picture get a marker. The plain place of the same building is left out by the base (map/poi.ts).

const SIZE = 144;
/** The marker floats this far above the top of its model (m): it should not sit in the roof. */
const ROOF_M = 3;
const LAYER = 'landmark-badges';
const SOURCE = 'landmark-badges';
const imageId = (id: string) => `lm:${id}`;

let renderer: THREE.WebGLRenderer | undefined;
let scene: THREE.Scene | undefined;
let camera: THREE.PerspectiveCamera | undefined;
let sheet: HTMLCanvasElement | undefined;

/** The shared offscreen renderer: one extra WebGL context, created with the first picture. */
function setup() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.3));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.position.set(-1, 1.6, 0.8);
  scene.add(sun);
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20000);
  sheet = document.createElement('canvas');
  sheet.width = sheet.height = SIZE;
}

/** The round picture of a model; the model stays the caller's (it is only shown, never changed). */
function picture(model: THREE.Object3D): ImageData | undefined {
  setup();
  const g = sheet!.getContext('2d', { willReadFrequently: true })!;
  const copy = model.clone();
  scene!.add(copy);
  try {
    const box = new THREE.Box3().setFromObject(copy);
    if (box.isEmpty()) return undefined;
    const centre = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2 * 0.78;
    const dist = radius / Math.sin((camera!.fov * Math.PI) / 360);
    // the file is x east, y up, z south: seen from the south-east and a little above
    camera!.position.copy(centre).add(new THREE.Vector3(0.75, 0.5, 1).normalize().multiplyScalar(dist));
    camera!.lookAt(centre);
    camera!.updateProjectionMatrix();
    renderer!.render(scene!, camera!);
    const r = SIZE / 2 - 4;
    g.clearRect(0, 0, SIZE, SIZE);
    g.save();
    g.beginPath();
    g.arc(SIZE / 2, SIZE / 2, r, 0, Math.PI * 2);
    g.clip();
    const sky = g.createLinearGradient(0, 0, 0, SIZE);
    sky.addColorStop(0, '#4a5f93');
    sky.addColorStop(1, '#1e2a4a');
    g.fillStyle = sky;
    g.fillRect(0, 0, SIZE, SIZE);
    g.drawImage(renderer!.domElement, 0, 0, SIZE, SIZE);
    g.restore();
    g.beginPath();
    g.arc(SIZE / 2, SIZE / 2, r, 0, Math.PI * 2);
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    g.stroke();
    return g.getImageData(0, 0, SIZE, SIZE);
  } finally {
    scene!.remove(copy);
  }
}

/** How big a landmark is (m): the larger of its height and the diagonal of its footprint. */
const tierOf = (sizeM: number): number => (sizeM >= 200 ? 1 : sizeM >= 100 ? 2 : sizeM >= 60 ? 3 : sizeM >= 30 ? 4 : 5);
const size = (l: LandmarkSample): number => {
  const [w, s, e, n] = l.bounds;
  const dx = (e - w) * 111_320 * Math.cos(((s + n) / 2) * Math.PI / 180);
  return Math.max(l.heightM, Math.hypot(dx, (n - s) * 111_320));
};

export class LandmarkBadges {
  private items: readonly LandmarkSample[] = [];
  private done = new Set<string>();
  private stopLabels?: () => void;
  private stopTier?: () => void;

  /** the share of its height the model is drawn at (flatter seen from above, like the 2.5D buildings) */
  private lastShare = -1;

  constructor(private map: MlMap, private heightFactor: () => number = () => 1, labelsVisible?: ReadonlySignal<boolean>, tierLimit?: ReadonlySignal<unknown>) {
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: LAYER, type: 'symbol', source: SOURCE, minzoom: 12,
      layout: {
        'icon-image': ['get', 'img'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.55, 16, 0.72, 19, 0.9],
        'icon-padding': 4,
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 18, 13],
        'text-anchor': 'top',
        'text-offset': [0, 2.1],
        'text-max-width': 7,
        'text-optional': true,
        'symbol-sort-key': ['get', 'order'],
        // the marker floats at the top of its model, in metres (true 3D placement)
        'symbol-height-offset': ['+', ROOF_M, ['*', ['get', 'h'], 1]],
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(10, 15, 24, 0.95)', 'text-halo-width': 1.6 },
    }, 'slot:top'); // above the places (slot labels): a landmark wins a collision against a café
    // a badge is a place label: on the bare "Daten" map with only the buildings layer it has no business being there
    if (labelsVisible) this.stopLabels = effect(() => {
      const show = labelsVisible.value;
      if (map.getLayer(LAYER)) map.setLayoutProperty(LAYER, 'visibility', show ? 'visible' : 'none');
    });
    // like the places: the bigger the model, the earlier its badge (a tilted view counts as more zoom)
    if (tierLimit) this.stopTier = effect(() => {
      if (map.getLayer(LAYER)) map.setFilter(LAYER, ['<=', ['get', 'tier'], tierLimit.value] as never);
    });
    map.on('pitch', this.follow);
    this.follow();
  }

  /** The model's height follows the tilt (the base draws the buildings flatter from above): the marker goes with it. Re-laid out only on a visible change. */
  private follow = () => {
    const share = Math.round(this.heightFactor() * 50) / 50;
    if (share === this.lastShare || !this.map.getLayer(LAYER)) return;
    this.lastShare = share;
    this.map.setLayoutProperty(LAYER, 'symbol-height-offset', ['+', ROOF_M, ['*', ['get', 'h'], share]]);
  };

  /** The landmarks in view (their models load elsewhere). */
  setItems(items: readonly LandmarkSample[]) {
    this.items = items;
    this.sync();
  }

  /** The model of a landmark is there: its picture is made (once) and its marker appears. */
  modelReady(sample: LandmarkSample, model: THREE.Object3D) {
    if (this.done.has(sample.id) || this.map.hasImage(imageId(sample.id))) { this.done.add(sample.id); return; }
    this.done.add(sample.id);
    const img = picture(model);
    if (!img) return;
    this.map.addImage(imageId(sample.id), img, { pixelRatio: 2 });
    this.sync();
  }

  private sync() {
    const src = this.map.getSource(SOURCE) as { setData(d: unknown): void } | undefined;
    src?.setData({
      type: 'FeatureCollection',
      features: this.items.filter((l) => this.map.hasImage(imageId(l.id))).map((l) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [l.lng, l.lat] },
        // the biggest first: they win the room, and they show from the lowest zoom
        properties: { id: l.id, name: l.name, img: imageId(l.id), order: -size(l), h: l.heightM, tier: tierOf(size(l)) },
      })),
    });
  }

  dispose() {
    this.stopLabels?.();
    this.stopTier?.();
    this.map.off('pitch', this.follow);
    if (this.map.getLayer(LAYER)) this.map.removeLayer(LAYER);
    if (this.map.getSource(SOURCE)) this.map.removeSource(SOURCE);
    for (const l of this.items) if (this.map.hasImage(imageId(l.id))) this.map.removeImage(imageId(l.id));
  }
}
