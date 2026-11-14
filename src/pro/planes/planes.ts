import * as THREE from 'three';
import type { Map as MlMap } from 'maplibre-gl';
import type { TrackSample } from '../../ext/types';
import type { GeoFrame } from '../world3d/frame';
import { inQuad, segmentDistance, type Point } from '../world3d/hit';
import { GeoInstances } from '../world3d/instances';
import type { Stage, StagePart } from '../world3d/stage';
import { hullGeometries, planeGeometries } from './models';
import { PlaneTracker, type PlaneState } from './smoothing';
import { growScale, sizeScale, stepGrow } from './size';
import { TrailRig, TRAIL_FADE_MS, WALL_MAX_M } from './trail';

// 3D aircraft: a part of the stage. Models at the real altitude, moved smoothly between reports (smoothing.ts), around
// each one its trail at the real altitude, a faint wall from the trail down to the ground, a thin line from the
// aircraft to the ground and its shadow. Ported from the old app's PlanesLayer; new here: models, shadows and drop
// lines are instanced / batched (one draw call each for all aircraft), and only a limited number of trails is
// built (the selected aircraft's and those nearest to the middle of the view).

/** the selected aircraft keeps its colour and gets a white outline of about this many CSS px */
const OUTLINE_PX = 1.25;
const OUTLINE_COLOR = 0xffffff;
/** models keep a readable size when zoomed out: this many CSS pixels per metre of model (see `boost`), less far out (size.ts) */
const MODEL_MIN_PX_SHARE = 0.65;
/** at most this many trails (plus the selected one); they cost two draw calls each */
const MAX_TRAILS = 60;
/** how often the set of aircraft with a trail is chosen anew (ms) */
const TRAIL_SET_MS = 1000;
/** an aircraft this far outside of the screen (share of the view) is left out */
const VIEW_MARGIN = 0.5;
/** how close to a model / its shadow / a line (CSS px) a click or the cursor still hits */
const PICK_MODEL_PX = 18;
const PICK_SHADOW_PX = 18;
/** the model's and shadow's reach shrink with the models, but stay at least this big */
const PICK_MIN_PX = 8;
const PICK_LINE_PX = 6;

const FLATTEN = new THREE.Matrix4().makeScale(1, 1, 0.002);

export class PlanesPart implements StagePart {
  readonly object = new THREE.Group();
  readonly tracker = new PlaneTracker();
  /** the aircraft with the highlighted trail and model */
  selected: string | null = null;
  /** the camera follows this aircraft: its label stays visible */
  private followed: string | null = null;
  private hovered: string | null = null;
  private active = false;
  private models = new GeoInstances(planeGeometries());
  private shadows: GeoInstances;
  /** inverted hull of the selected aircraft: the model's back faces, pushed out along their normals */
  private outline: GeoInstances;
  private outlineWidth = { value: 0 };
  private dropMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
  private drops = new THREE.LineSegments(new THREE.BufferGeometry(), this.dropMat);
  private dropCapacity = 0;
  private rigs = new Map<string, TrailRig>();
  private lastTrailSet = 0;
  private label = document.createElement('div');
  private labelBox = document.createElement('div');
  /** screen positions of the models and the shadows below them, and the drop lines, from the last frame (for picking) */
  private hits: { id: string; x: number; y: number; k: number }[] = [];
  /** growth progress (size.ts) of the selected aircraft and of those that are shrinking back */
  private grow = new Map<string, number>();
  private lastNow = 0;
  private shadowHits: { id: string; x: number; y: number }[] = [];
  private dropHits: { id: string; a: Point; b: Point }[] = [];
  private matrix = new THREE.Matrix4();
  private drawn = 0;

  constructor(
    private map: MlMap,
    private stage: Stage,
    private onClick: (id: string) => void,
    private reducedMotion: () => boolean = () => false,
  ) {
    this.shadows = new GeoInstances(
      planeGeometries(),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.shadows.object.renderOrder = 1;
    const hullMat = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
    hullMat.onBeforeCompile = (shader) => {
      shader.uniforms.uOutline = this.outlineWidth;
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'uniform float uOutline;\nvoid main() {')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normal * uOutline;');
    };
    this.outline = new GeoInstances(hullGeometries(), hullMat);
    // after the models: opaque, depth-tested against them, so it only shows around them
    this.outline.object.renderOrder = 1;
    this.drops.frustumCulled = false;
    this.drops.renderOrder = 2;
    this.object.add(this.models.object, this.outline.object, this.shadows.object, this.drops);
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
      this.shadowHits = [];
      this.dropHits = [];
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

  setFollowed(id: string | null) {
    this.followed = id;
    this.stage.wake();
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
    const zoom = this.map.getZoom();
    const share = MODEL_MIN_PX_SHARE * sizeScale(zoom);

    // the selected aircraft grows, the one deselected shrinks back (200 ms; a jump with reduced motion)
    const dt = this.reducedMotion() ? Infinity : this.lastNow ? Math.min(100, now - this.lastNow) : 0;
    this.lastNow = now;
    let growing = false;
    if (this.selected && !this.grow.has(this.selected)) this.grow.set(this.selected, 0);
    for (const [id, g] of this.grow) {
      const sel = id === this.selected;
      const next = stepGrow(g, sel, dt);
      if (next === 0 && !sel) this.grow.delete(id);
      else this.grow.set(id, next);
      if (next !== (sel ? 1 : 0)) growing = true;
    }

    const visible: PlaneState[] = []
    this.hits = [];
    this.shadowHits = [];
    this.dropHits = [];
    this.models.start(frame, this.tracker.planes.size);
    this.shadows.start(frame, this.tracker.planes.size);
    this.outline.start(frame, 1);
    const dropPos: number[] = [];
    for (const p of this.tracker.planes.values()) {
      const lon = p.dLon + 360 * Math.round((centre.lng - p.dLon) / 360);
      if (lon < b.getWest() - padLon || lon > b.getEast() + padLon || p.dLat < b.getSouth() - padLat || p.dLat > b.getNorth() + padLat) continue;
      const alt = p.ground ? 0.2 : p.dAlt;
      if (frame.occluded(p.dLon, p.dLat, alt)) continue;
      visible.push(p);
      const air = !p.ground && p.dAlt > 3;
      // metres per screen pixel: the models keep a readable size when zoomed out
      const k = growScale(zoom, this.grow.get(p.id) ?? 0);
      const boost = Math.max(1, share * frame.metresPerPixel(p.dLon, p.dLat, alt)) * k;
      const color = p.color;
      frame.place(this.matrix, p.dLon, p.dLat, alt, p.dTrack, boost);
      this.models.add(p.model, this.matrix, color);
      if (p.id === this.selected) {
        // constant in screen pixels: the offset is in model units, which the instance matrix scales by `boost`
        this.outlineWidth.value = (OUTLINE_PX * frame.metresPerPixel(p.dLon, p.dLat, alt)) / boost;
        this.outline.add(p.model, this.matrix, OUTLINE_COLOR);
      }
      if (air) {
        frame.place(this.matrix, p.dLon, p.dLat, 0.1, p.dTrack, boost).multiply(FLATTEN);
        this.shadows.add(p.model, this.matrix, 0x000000);
        const foot = frame.position(p.dLon, p.dLat, 0.1);
        const top = frame.position(p.dLon, p.dLat, alt);
        dropPos.push(foot[0], foot[1], foot[2], top[0], top[1], top[2]);
      }
      const s = frame.toScreen(p.dLon, p.dLat, alt);
      if (!s) continue;
      this.hits.push({ id: p.id, x: s[0], y: s[1], k });
      const ground = air ? frame.toScreen(p.dLon, p.dLat, 0.1) : null;
      if (ground) {
        this.shadowHits.push({ id: p.id, x: ground[0], y: ground[1] });
        this.dropHits.push({ id: p.id, a: ground, b: s });
      }
    }
    this.models.finish();
    this.shadows.finish();
    this.outline.finish();
    this.models.update(frame);
    this.outline.update(frame);
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
    return visible.length > 0 || growing;
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

  /**
   * The aircraft at a screen point (CSS px): its model, else the nearest of its shadow, drop line, trail line and the
   * wall between a low trail and the ground. A hit is scored by how far inside its reach the point is.
   */
  pick(frame: GeoFrame, x: number, y: number): string | null {
    if (!this.active) return null;
    const reach = (px: number) => Math.max(PICK_MIN_PX, px * sizeScale(this.map.getZoom()));
    let best: string | null = null;
    let bestScore = 0;
    // the model's reach grows with the model: scored by how far inside the reach the point is, like the rest
    for (const h of this.hits) {
      const score = Math.hypot(x - h.x, y - h.y) - reach(PICK_MODEL_PX) * h.k;
      if (score < bestScore) {
        bestScore = score;
        best = h.id;
      }
    }
    if (best) return best;
    const consider = (id: string, score: number) => {
      if (score < bestScore) {
        bestScore = score;
        best = id;
      }
    };
    for (const h of this.shadowHits) consider(h.id, Math.hypot(x - h.x, y - h.y) - reach(PICK_SHADOW_PX));
    for (const h of this.dropHits) consider(h.id, segmentDistance(x, y, h.a, h.b) - PICK_LINE_PX);
    const now = performance.now();
    for (const [id, rig] of this.rigs) {
      const p = this.tracker.planes.get(id);
      if (!p || !rig.line.object.visible) continue;
      const selected = id === this.selected;
      // faded-out parts of a trail cannot be picked: only the newest part of the others
      if (selected || p.trail.some((t) => now - t[3] < TRAIL_FADE_MS)) consider(id, rig.line.distanceTo(frame, x, y) - PICK_LINE_PX);
      // the wall exists where it is drawn: low and in the air; a point inside it scores just above a line hit
      if (rig.wall.object.visible && this.inWall(frame, rig, selected, now, x, y)) consider(id, -0.001);
    }
    return best;
  }

  private inWall(frame: GeoFrame, rig: TrailRig, selected: boolean, now: number, x: number, y: number): boolean {
    let prevTop: Point | null = null;
    let prevBot: Point | null = null;
    let prevAlt = Infinity;
    let prevFresh = false;
    for (let i = 0; i < rig.points.length; i++) {
      const [lon, lat, alt] = rig.points[i]!;
      const t = rig.times[i]!;
      const top = frame.toScreen(lon, lat, alt);
      const bot = frame.toScreen(lon, lat, 0);
      // t < 0: the head, always fresh; the faded-out part of a trail has no wall to pick
      const fresh = selected || t < 0 || now - t < TRAIL_FADE_MS;
      if (top && bot && prevTop && prevBot && fresh && prevFresh && alt < WALL_MAX_M && prevAlt < WALL_MAX_M && inQuad(x, y, prevTop, top, bot, prevBot)) return true;
      prevTop = top;
      prevBot = bot;
      prevAlt = alt;
      prevFresh = fresh;
    }
    return false;
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
    this.outline.dispose();
    this.drops.geometry.dispose();
    this.dropMat.dispose();
    this.labelBox.remove();
    this.tracker.clear();
  }
}
