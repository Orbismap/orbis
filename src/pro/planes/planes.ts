import * as THREE from 'three';
import type { Map as MlMap } from 'maplibre-gl';
import type { TrackSample } from '../../ext/types';
import type { GeoFrame } from '../world3d/frame';
import { GeoInstances } from '../world3d/instances';
import type { Stage, StagePart } from '../world3d/stage';
import { planeGeometries } from './models';
import { PlaneTracker, type PlaneState } from './smoothing';
import { TrailRig, TRAIL_FADE_MS } from './trail';

// 3D aircraft: a part of the stage. Models at the real altitude, moved smoothly between reports (smoothing.ts), around
// each one its trail at the real altitude, a faint wall from the trail down to the ground, a thin line from the
// aircraft to the ground and its shadow. Ported from the old app's PlanesLayer; new here: models, shadows and drop
// lines are instanced / batched (one draw call each for all aircraft), and only a limited number of trails is
// built (the selected aircraft's and those nearest to the middle of the view).

const YELLOW = 0xf2c94c;
const RED = 0xff2d55;
const MILITARY = 0xff4fb8;
const SELECTED = 0x6cb4ff;
/** models keep a readable size when zoomed out: about this many CSS pixels long (see `boost`) */
const MODEL_MIN_PX_SHARE = 0.65;
/** at most this many trails (plus the selected one); they cost two draw calls each */
const MAX_TRAILS = 60;
/** how often the set of aircraft with a trail is chosen anew (ms) */
const TRAIL_SET_MS = 1000;
/** an aircraft this far outside of the screen (share of the view) is left out */
const VIEW_MARGIN = 0.5;
/** how close to a model / a trail (CSS px) a click or the cursor still hits */
const PICK_MODEL_PX = 18;
const PICK_TRAIL_PX = 6;

const FLATTEN = new THREE.Matrix4().makeScale(1, 1, 0.002);

export class PlanesPart implements StagePart {
  readonly object = new THREE.Group();
  readonly tracker = new PlaneTracker();
  /** the aircraft with the highlighted trail and model */
  selected: string | null = null;
  /** the camera follows this aircraft: its label stays visible */
  followed: string | null = null;
  private hovered: string | null = null;
  private active = false;
  private models = new GeoInstances(planeGeometries());
  private shadows: GeoInstances;
  private dropMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
  private drops = new THREE.LineSegments(new THREE.BufferGeometry(), this.dropMat);
  private dropCapacity = 0;
  private rigs = new Map<string, TrailRig>();
  private lastTrailSet = 0;
  private label = document.createElement('div');
  private labelBox = document.createElement('div');
  private hits: { id: string; x: number; y: number }[] = [];
  private matrix = new THREE.Matrix4();
  private drawn = 0;

  constructor(
    private map: MlMap,
    private stage: Stage,
    private onClick: (id: string) => void,
  ) {
    this.shadows = new GeoInstances(
      planeGeometries(),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.shadows.object.renderOrder = 1;
    this.drops.frustumCulled = false;
    this.drops.renderOrder = 2;
    this.object.add(this.models.object, this.shadows.object, this.drops);
    this.object.visible = false;
    this.labelBox.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1';
    this.label.style.cssText =
      'display:none;position:absolute;left:0;top:0;white-space:pre;text-align:center;font:600 12px/1.2 system-ui,sans-serif;color:#fff;' +
      'text-shadow:0 0 3px rgba(10,12,16,.95),0 0 3px rgba(10,12,16,.95),0 0 2px rgba(10,12,16,.95);will-change:transform';
    this.labelBox.append(this.label);
    map.getCanvasContainer().appendChild(this.labelBox);
  }

  /** The 3D presentation is on (zoomed in far enough): the part draws; off: it hides and frees its trails. */
  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    this.object.visible = on;
    if (!on) {
      this.hits = [];
      this.hideLabel();
      this.dropRigs(() => true);
    }
    this.stage.wake();
  }

  /** A new list of reports (the channel publishes the whole filtered list). */
  feed(items: readonly TrackSample[]) {
    if (!items.length) this.tracker.clear(); // the layer is off or has nothing: no grace time
    else this.tracker.feed(items, performance.now(), Date.now());
    this.stage.wake();
  }

  /** Advances the displayed state to `now`; the follow camera does it before reading `positionOf`, the stage then draws the same instant. */
  step(now: number) {
    this.tracker.step(now);
  }

  /** Where the aircraft is now (displayed state) [lon, lat, altitude m]; null: unknown. */
  positionOf(id: string): [number, number, number] | null {
    const p = this.tracker.planes.get(id);
    return p ? [p.dLon, p.dLat, p.ground ? 0.2 : p.dAlt] : null;
  }

  stats() {
    return { aircraft: this.tracker.planes.size, drawn: this.drawn, trails: this.rigs.size };
  }

  update(frame: GeoFrame, now: number): boolean {
    if (!this.active) return false;
    this.tracker.step(now);
    const b = this.map.getBounds();
    const padLon = (b.getEast() - b.getWest()) * VIEW_MARGIN;
    const padLat = (b.getNorth() - b.getSouth()) * VIEW_MARGIN;
    const centre = this.map.getCenter();

    const visible: PlaneState[] = [];
    this.hits = [];
    this.models.start(frame, this.tracker.planes.size);
    this.shadows.start(frame, this.tracker.planes.size);
    const dropPos: number[] = [];
    for (const p of this.tracker.planes.values()) {
      const lon = p.dLon + 360 * Math.round((centre.lng - p.dLon) / 360);
      if (lon < b.getWest() - padLon || lon > b.getEast() + padLon || p.dLat < b.getSouth() - padLat || p.dLat > b.getNorth() + padLat) continue;
      const alt = p.ground ? 0.2 : p.dAlt;
      if (frame.occluded(p.dLon, p.dLat, alt)) continue;
      visible.push(p);
      const air = !p.ground && p.dAlt > 3;
      // metres per screen pixel: the models keep a readable size when zoomed out
      const boost = Math.max(1, MODEL_MIN_PX_SHARE * frame.metresPerPixel(p.dLon, p.dLat, alt));
      const color = p.id === this.selected ? SELECTED : p.emergency ? RED : p.military ? MILITARY : YELLOW;
      frame.place(this.matrix, p.dLon, p.dLat, alt, p.dTrack, boost);
      this.models.add(p.model, this.matrix, color);
      if (air) {
        frame.place(this.matrix, p.dLon, p.dLat, 0.1, p.dTrack, boost).multiply(FLATTEN);
        this.shadows.add(p.model, this.matrix, 0x000000);
        const foot = frame.position(p.dLon, p.dLat, 0.1);
        const top = frame.position(p.dLon, p.dLat, alt);
        dropPos.push(foot[0], foot[1], foot[2], top[0], top[1], top[2]);
      }
      const s = frame.toScreen(p.dLon, p.dLat, alt);
      if (s) this.hits.push({ id: p.id, x: s[0], y: s[1] });
    }
    this.models.finish();
    this.shadows.finish();
    this.models.update(frame);
    this.shadows.update(frame);
    this.setDrops(dropPos);
    this.drawn = visible.length;

    // trails: the selected aircraft's and those nearest to the middle of the view
    if (now - this.lastTrailSet > TRAIL_SET_MS || (this.selected && !this.rigs.has(this.selected) && this.tracker.planes.has(this.selected))) {
      this.lastTrailSet = now;
      this.chooseTrails(visible, centre);
    }
    const visibleIds = new Set(visible.map((p) => p.id));
    for (const [id, rig] of this.rigs) {
      const p = this.tracker.planes.get(id);
      if (!p || !visibleIds.has(id)) {
        rig.hide();
        continue;
      }
      rig.sync(p, id === this.selected, frame, now);
    }
    this.syncLabel(frame);
    return visible.length > 0;
  }

  private chooseTrails(visible: PlaneState[], centre: { lng: number; lat: number }) {
    const want = new Set<string>();
    if (this.selected && this.tracker.planes.has(this.selected)) want.add(this.selected);
    const cosLat = Math.cos((centre.lat * Math.PI) / 180);
    const byDistance = visible
      .filter((p) => p.trail.length > 1)
      .map((p) => ({ p, d: Math.hypot((p.dLon - centre.lng) * cosLat, p.dLat - centre.lat) }))
      .sort((a, c) => a.d - c.d);
    for (const { p } of byDistance) {
      if (want.size >= MAX_TRAILS + (this.selected ? 1 : 0)) break;
      want.add(p.id);
    }
    this.dropRigs((id) => !want.has(id));
    for (const id of want) {
      if (this.rigs.has(id)) continue;
      const rig = new TrailRig();
      this.rigs.set(id, rig);
      this.object.add(rig.line.object, rig.wall.object);
    }
  }

  private dropRigs(which: (id: string) => boolean) {
    for (const [id, rig] of this.rigs) {
      if (!which(id) && this.tracker.planes.has(id)) continue;
      this.object.remove(rig.line.object, rig.wall.object);
      rig.dispose();
      this.rigs.delete(id);
    }
  }

  private setDrops(pos: number[]) {
    const g = this.drops.geometry;
    if (pos.length > this.dropCapacity * 3) {
      g.dispose();
      this.dropCapacity = Math.ceil(pos.length / 3 * 1.5) + 64;
      this.drops.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.dropCapacity * 3), 3).setUsage(THREE.DynamicDrawUsage));
    }
    const attr = this.drops.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!attr) return;
    (attr.array as Float32Array).set(pos);
    attr.needsUpdate = true;
    this.drops.geometry.setDrawRange(0, pos.length / 3);
  }

  /** Callsign above the hovered, selected or followed aircraft; moved every frame so it never trails behind while zooming. */
  private syncLabel(frame: GeoFrame) {
    const id = this.hovered ?? this.followed ?? this.selected;
    const p = id ? this.tracker.planes.get(id) : undefined;
    const pos = p && frame.toScreen(p.dLon, p.dLat, p.ground ? 0.2 : p.dAlt);
    if (!p || !pos) return this.hideLabel();
    const zoom = this.map.getZoom();
    // distance above the model: grows with the zoom (the models get bigger)
    const lift = 17 + Math.min(1, Math.max(0, (zoom - 15) / 3.5)) * 24;
    if (this.label.textContent !== p.label) this.label.textContent = p.label;
    this.label.style.display = '';
    this.label.style.transform = `translate(${pos[0].toFixed(1)}px,${(pos[1] - lift).toFixed(1)}px) translate(-50%,-100%)`;
  }

  private hideLabel() {
    this.label.style.display = 'none';
  }

  /** The aircraft at a screen point (CSS px): its model, or its trail line. */
  pick(frame: GeoFrame, x: number, y: number): string | null {
    if (!this.active) return null;
    let best: string | null = null;
    let bestD = PICK_MODEL_PX;
    for (const h of this.hits) {
      const d = Math.hypot(x - h.x, y - h.y);
      if (d < bestD) {
        bestD = d;
        best = h.id;
      }
    }
    if (best) return best;
    const now = performance.now();
    bestD = PICK_TRAIL_PX;
    for (const [id, rig] of this.rigs) {
      const p = this.tracker.planes.get(id);
      if (!p || !rig.line.object.visible) continue;
      const selected = id === this.selected;
      // faded-out parts of a trail cannot be picked: only the newest part of the others
      if (!selected && !p.trail.some((t) => now - t[3] < TRAIL_FADE_MS)) continue;
      const d = rig.line.distanceTo(frame, x, y);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  click(id: string) {
    this.onClick(id);
  }

  hover(id: string | null) {
    if (id === this.hovered) return;
    this.hovered = id;
    this.stage.wake();
  }

  dispose() {
    this.dropRigs(() => true);
    this.models.dispose();
    this.shadows.dispose();
    this.drops.geometry.dispose();
    this.dropMat.dispose();
    this.labelBox.remove();
    this.tracker.clear();
  }
}
