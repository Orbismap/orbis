import * as THREE from 'three';
import type { Map as MlMap } from 'maplibre-gl';
import type { ShipSample } from '../../ext/types';
import type { GeoFrame } from '../world3d/frame';
import { GeoInstances } from '../world3d/instances';
import { outlineMaterial } from '../world3d/outline';
import { growScale, sizeScale, stepGrow } from '../world3d/size';
import type { Stage, StagePart } from '../world3d/stage';
import { shortestDelta } from '../planes/smoothing';
import { lengthScale, REF_LEN, shipGeometries, shipHullGeometries, shipMaterial } from './models';
import { ShipTracker } from './smoothing';

// 3D ships: a part of the stage, modelled on the aircraft part but simpler. Models sit on the water line, bow along the
// displayed rotation, at their real length (reported by AIS, else a typical one of the class) but never smaller on
// screen than a readable minimum (shrinking gently when zoomed out). Moved smoothly between reports (smoothing.ts).
// No shadows, drop lines or 3D trails: the base draws the selected ship's trail as a map line.

/** a ship is never drawn shorter than this many CSS px at full size (zoom 9 and nearer; size.ts shrinks it further out) */
const MIN_LENGTH_PX = 22;
/** the selected ship keeps its colour and gets a white outline of about this many CSS px */
const OUTLINE_PX = 1.25;
const OUTLINE_COLOR = 0xffffff;
/** the models float this far above the map (m): no z-fighting with anything flat that is drawn at the water line */
const WATER_ALT_M = 0.3;
/** a ship this far outside of the screen (share of the view) is left out */
const VIEW_MARGIN = 0.5;
/** how close to a model (CSS px, beyond its half length) a click or the cursor still hits */
const PICK_SLACK_PX = 6;
const PICK_MIN_PX = 9;
const PICK_MAX_PX = 60;

export class ShipsPart implements StagePart {
  readonly object = new THREE.Group();
  readonly tracker = new ShipTracker();
  /** the ship with the highlighted model */
  selected: string | null = null;
  /** the camera follows this ship: its name stays visible */
  private followed: string | null = null;
  private hovered: string | null = null;
  private active = false;
  private models = new GeoInstances(shipGeometries(), shipMaterial());
  /** inverted hull of the selected ship: the model's back faces, pushed out along their normals */
  private outline: GeoInstances;
  private outlineWidth = { value: 0 };
  private label = document.createElement('div');
  private labelBox = document.createElement('div');
  /** screen position, reach (CSS px) and on-screen length of the models drawn last frame (for picking and the label) */
  private hits: { id: string; x: number; y: number; r: number; len: number }[] = [];
  /** growth progress (world3d/size.ts) of the selected ship and of those that are shrinking back */
  private grow = new Map<string, number>();
  private lastNow = 0;
  private matrix = new THREE.Matrix4();
  private drawn = 0;

  constructor(
    private map: MlMap,
    private stage: Stage,
    private onClick: (id: string) => void,
    private reducedMotion: () => boolean = () => false,
  ) {
    this.outline = new GeoInstances(shipHullGeometries(), outlineMaterial(this.outlineWidth, OUTLINE_COLOR));
    // after the models: opaque, depth-tested against them, so it only shows around them
    this.outline.object.renderOrder = 1;
    this.object.add(this.models.object, this.outline.object);
    this.object.visible = false;
    this.labelBox.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1';
    this.label.style.cssText =
      'display:none;position:absolute;left:0;top:0;white-space:pre;text-align:center;font:600 12px/1.2 system-ui,sans-serif;color:#fff;' +
      'text-shadow:0 0 3px rgba(10,12,16,.95),0 0 3px rgba(10,12,16,.95),0 0 2px rgba(10,12,16,.95);will-change:transform';
    this.labelBox.append(this.label);
    map.getCanvasContainer().appendChild(this.labelBox);
  }

  /** The 3D presentation is on (there are ships to show): the part draws; off: it hides. */
  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    this.object.visible = on;
    if (!on) {
      this.hits = [];
      this.hideLabel();
    }
    this.stage.wake();
  }

  /** A new list of reports (the channel publishes the whole filtered list). */
  feed(items: readonly ShipSample[]) {
    if (!items.length) this.tracker.clear(); // the layer is off or has nothing: no grace time
    else this.tracker.feed(items, performance.now(), Date.now());
    this.stage.wake();
  }

  /** Advances the displayed state to `now`; the follow camera does it before reading `positionOf`, the stage then draws the same instant. */
  step(now: number) {
    this.tracker.step(now);
  }

  /** Where the ship is now (displayed state) [lon, lat, altitude m: 0]; null: unknown. */
  positionOf(id: string): [number, number, number] | null {
    const p = this.tracker.ships.get(id);
    return p ? [p.dLon, p.dLat, 0] : null;
  }

  setFollowed(id: string | null) {
    this.followed = id;
    this.stage.wake();
  }

  stats() {
    return { ships: this.tracker.ships.size, shipsDrawn: this.drawn };
  }

  update(frame: GeoFrame, now: number): boolean {
    if (!this.active) return false;
    this.tracker.step(now);
    const b = this.map.getBounds();
    const padLon = (b.getEast() - b.getWest()) * VIEW_MARGIN;
    const padLat = (b.getNorth() - b.getSouth()) * VIEW_MARGIN;
    const centre = this.map.getCenter();
    const zoom = this.map.getZoom();
    const minLength = MIN_LENGTH_PX * sizeScale(zoom);

    // the selected ship grows, the one deselected shrinks back (200 ms; a jump with reduced motion)
    const dt = this.reducedMotion() ? Infinity : this.lastNow ? Math.min(100, now - this.lastNow) : 0;
    this.lastNow = now;
    let animating = false;
    if (this.selected && !this.grow.has(this.selected)) this.grow.set(this.selected, 0);
    for (const [id, g] of this.grow) {
      const sel = id === this.selected;
      const next = stepGrow(g, sel, dt);
      if (next === 0 && !sel) this.grow.delete(id);
      else this.grow.set(id, next);
      if (next !== (sel ? 1 : 0)) animating = true;
    }

    this.hits = [];
    this.models.start(frame, this.tracker.ships.size);
    this.outline.start(frame, 1);
    let drawn = 0;
    for (const p of this.tracker.ships.values()) {
      const lon = p.dLon + 360 * Math.round((centre.lng - p.dLon) / 360);
      if (lon < b.getWest() - padLon || lon > b.getEast() + padLon || p.dLat < b.getSouth() - padLat || p.dLat > b.getNorth() + padLat) continue;
      if (frame.occluded(p.dLon, p.dLat, WATER_ALT_M)) continue;
      drawn++;
      // a ship under way, or one still turning or settling onto its position, keeps the map repainting
      if (p.moving || Math.abs(shortestDelta(p.dRot, p.rot)) > 0.2) animating = true;
      // metres per screen pixel: the real length, but never shorter on screen than the readable minimum
      const mpp = frame.metresPerPixel(p.dLon, p.dLat, WATER_ALT_M);
      const k = growScale(zoom, this.grow.get(p.id) ?? 0);
      const scale = Math.max(lengthScale(p.model, p.lenM), (minLength * mpp) / REF_LEN[p.model]) * k;
      frame.place(this.matrix, p.dLon, p.dLat, WATER_ALT_M, p.dRot, scale);
      this.models.add(p.model, this.matrix, p.color);
      if (p.id === this.selected) {
        // constant in screen pixels: the offset is in model units, which the instance matrix scales
        this.outlineWidth.value = (OUTLINE_PX * mpp) / scale;
        this.outline.add(p.model, this.matrix, OUTLINE_COLOR);
      }
      const s = frame.toScreen(p.dLon, p.dLat, WATER_ALT_M);
      if (!s) continue;
      const len = (REF_LEN[p.model] * scale) / mpp;
      this.hits.push({ id: p.id, x: s[0], y: s[1], r: Math.min(PICK_MAX_PX, Math.max(PICK_MIN_PX, len / 2 + PICK_SLACK_PX)), len });
    }
    this.models.finish();
    this.outline.finish();
    this.models.update(frame);
    this.outline.update(frame);
    this.drawn = drawn;
    this.syncLabel(frame);
    return drawn > 0 && animating;
  }

  /** Name above the hovered, selected or followed ship; moved every frame so it never trails behind while zooming. */
  private syncLabel(frame: GeoFrame) {
    const id = this.hovered ?? this.followed ?? this.selected;
    const p = id ? this.tracker.ships.get(id) : undefined;
    const pos = p && frame.toScreen(p.dLon, p.dLat, WATER_ALT_M);
    if (!p || !pos) return this.hideLabel();
    const len = this.hits.find((h) => h.id === p.id)?.len ?? 0;
    // above the model: further up the longer it is on screen
    const lift = 14 + Math.min(18, len * 0.2);
    if (this.label.textContent !== p.label) this.label.textContent = p.label;
    this.label.style.display = '';
    this.label.style.transform = `translate(${pos[0].toFixed(1)}px,${(pos[1] - lift).toFixed(1)}px) translate(-50%,-100%)`;
  }

  private hideLabel() {
    this.label.style.display = 'none';
  }

  /** The ship at a screen point (CSS px): the nearest model, scored by how far inside its reach (which grows with its length) the point is. */
  pick(_frame: GeoFrame, x: number, y: number): string | null {
    if (!this.active) return null;
    let best: string | null = null;
    let bestScore = 0;
    for (const h of this.hits) {
      const score = Math.hypot(x - h.x, y - h.y) - h.r;
      if (score < bestScore) {
        bestScore = score;
        best = h.id;
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
    this.models.dispose();
    this.outline.dispose();
    this.labelBox.remove();
    this.tracker.clear();
  }
}
