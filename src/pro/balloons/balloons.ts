import * as THREE from 'three';
import type { Map as MlMap } from 'maplibre-gl';
import type { BalloonSample } from '../../ext/types';
import { DropLines } from '../world3d/drops';
import type { GeoFrame, Vec3 } from '../world3d/frame';
import { segmentDistance, type Point } from '../world3d/hit';
import { GeoInstances } from '../world3d/instances';
import { sizeScale } from '../world3d/size';
import type { Stage, StagePart } from '../world3d/stage';
import { exaggeration, groundAt } from '../world3d/terrain';
import { ENVELOPE_Z, MODEL_H, chuteGeometry, envelopeGeometry, markGeometry, sondeGeometry, stringGeometry } from './models';
import { BalloonTracker, type BalloonState } from './motion';

// 3D weather balloons: every radiosonde at its real altitude, as a balloon while it rises (the envelope swells with the
// height, as the real one does), on a parachute while it falls, as a box with its parachute on the ground once landed. A
// thin line and a mark show the place on the ground below. The models keep a readable size on screen at every zoom.

/** height of a model on screen (CSS px) from zoom 9 up; smaller farther out (size.ts) */
const MODEL_PX = 34;
const SELECTED_SCALE = 1.5;
/** the envelope has this many times its first size from this altitude on */
const SWELL = 1.9;
const SWELL_FULL_M = 30_000;
/** radius of the ground mark on screen (px) */
const MARK_PX = 3.5;
/** The map is kept repainting while a balloon moves at least this fast on screen (px per s), or is this far from its place (px). */
const MOVING_PX_S = 0.3;
const SETTLING_PX = 0.5;
const PICK_PX = 9;
const SONDE_COLOR = 0xd9dde2;
const STRING_COLOR = 0xffffff;

export class BalloonsPart implements StagePart {
  readonly object = new THREE.Group();
  readonly tracker = new BalloonTracker();
  selected: string | null = null;
  private hovered: string | null = null;
  private active = false;
  private models = new GeoInstances({ sonde: sondeGeometry(), schnur: stringGeometry(), huelle: envelopeGeometry(), schirm: chuteGeometry() });
  private marks = new GeoInstances({ fleck: markGeometry() }, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  private drops = new DropLines();
  private matrix = new THREE.Matrix4();
  private part = new THREE.Matrix4();
  private colour = new THREE.Color();
  /** screen positions of the last frame, for picking */
  private hits: { id: string; at: Point | null; r: number; foot: Point | null }[] = [];
  private drawn = 0;

  constructor(private map: MlMap, private stage: Stage, private onClick: (id: string) => void) {
    this.object.add(this.models.object, this.marks.object, this.drops.object);
    this.object.visible = false;
  }

  get count() {
    return this.tracker.balloons.size;
  }

  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    this.object.visible = on;
    if (!on) this.hits = [];
    this.stage.wake();
  }

  feed(items: readonly BalloonSample[]) {
    if (!items.length) this.tracker.clear();
    else this.tracker.feed(items, performance.now(), Date.now());
    this.stage.wake();
  }

  step(now: number) {
    this.tracker.step(now);
  }

  /** Where the balloon is now (displayed state) [lon, lat, altitude m]; null: unknown. */
  positionOf(id: string): Vec3 | null {
    const b = this.tracker.balloons.get(id);
    return b ? [b.lon, b.lat, this.heights(b).altM] : null;
  }

  stats() {
    return { balloons: this.tracker.balloons.size, balloonsDrawn: this.drawn };
  }

  /** Where it is drawn: never below the terrain as it stands now, and a landed one on it. */
  private heights(b: BalloonState): { altM: number; groundM: number } {
    const groundM = groundAt(this.map, b.lon, b.lat) * exaggeration(this.map);
    return { groundM, altM: b.sample.state === 'landed' ? groundM : Math.max(b.altM, groundM) };
  }

  update(frame: GeoFrame, now: number): boolean {
    if (!this.active) return false;
    this.tracker.step(now);
    const zoom = this.map.getZoom();
    const px = MODEL_PX * sizeScale(zoom);
    const n = this.tracker.balloons.size;
    this.models.start(frame, n);
    this.marks.start(frame, n);
    this.hits = [];
    const lines: number[] = [];
    let drawn = 0;
    let moving = false;
    for (const b of this.tracker.balloons.values()) {
      const { altM, groundM } = this.heights(b);
      if (frame.occluded(b.lon, b.lat, altM)) continue;
      drawn++;
      const s = b.sample;
      const mpp = frame.metresPerPixel(b.lon, b.lat, altM);
      if (b.offM > SETTLING_PX * mpp || (s.state !== 'landed' && Math.hypot(s.speedMs, s.climbMs) >= MOVING_PX_S * mpp)) moving = true;
      const grown = s.id === this.selected ? SELECTED_SCALE : s.id === this.hovered ? 1.25 : 1;
      const scale = Math.max(1, (px * mpp) / MODEL_H) * grown;
      const colour = this.colour.set(s.color).getHex();
      frame.place(this.matrix, b.lon, b.lat, altM, 0, scale);
      this.models.add('sonde', this.matrix, SONDE_COLOR);
      if (s.state === 'balloon') {
        this.models.add('schnur', this.matrix, STRING_COLOR);
        const swell = 1 + (SWELL - 1) * Math.min(1, Math.max(0, altM / SWELL_FULL_M));
        this.matrix.multiply(this.part.makeTranslation(0, 0, ENVELOPE_Z)).multiply(this.part.makeScale(swell, swell, swell));
        this.models.add('huelle', this.matrix, colour);
      } else {
        // on the ground the parachute lies flat beside the sonde
        if (s.state === 'landed') this.matrix.multiply(this.part.makeTranslation(7, 0, -1.2)).multiply(this.part.makeScale(1, 1, 0.1));
        this.models.add('schirm', this.matrix, colour);
      }
      const at = frame.toScreen(b.lon, b.lat, altM + (MODEL_H / 2) * scale);
      const foot = frame.toScreen(b.lon, b.lat, groundM);
      if (s.state !== 'landed') {
        const from = frame.position(b.lon, b.lat, groundM);
        const to = frame.position(b.lon, b.lat, altM);
        lines.push(from[0], from[1], from[2], to[0], to[1], to[2]);
        frame.place(this.matrix, b.lon, b.lat, groundM, 0, MARK_PX * frame.metresPerPixel(b.lon, b.lat, groundM) * grown);
        this.marks.add('fleck', this.matrix, colour);
      }
      this.hits.push({ id: s.id, at, r: (px * grown) / 2 + 4, foot });
    }
    this.models.finish();
    this.marks.finish();
    this.models.update(frame);
    this.marks.update(frame);
    this.drops.set(lines);
    this.drawn = drawn;
    return moving;
  }

  /** The balloon at a screen point (CSS px): its model first, else its mark or line on the way to the ground. Close up, a high one is out of view and only those are left. */
  pick(_frame: GeoFrame, x: number, y: number): string | null {
    if (!this.active) return null;
    let best: string | null = null;
    let bestScore = 0;
    const consider = (id: string, score: number) => {
      if (score < bestScore) {
        bestScore = score;
        best = id;
      }
    };
    for (const h of this.hits) if (h.at) consider(h.id, Math.hypot(x - h.at[0], y - h.at[1]) - h.r);
    if (best) return best;
    for (const h of this.hits) if (h.foot) consider(h.id, (h.at ? segmentDistance(x, y, h.foot, h.at) : Math.hypot(x - h.foot[0], y - h.foot[1])) - PICK_PX);
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
    this.marks.dispose();
    this.drops.dispose();
    this.tracker.clear();
  }
}
