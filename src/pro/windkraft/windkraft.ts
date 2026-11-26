import * as THREE from 'three';
import type { Map as MlMap } from 'maplibre-gl';
import type { WindTurbineSample } from '../../ext/types';
import { unit } from '../baeume/baeume';
import type { GeoFrame } from '../world3d/frame';
import { segmentDistance } from '../world3d/hit';
import { GeoInstances } from '../world3d/instances';
import type { Stage, StagePart } from '../world3d/stage';
import { exaggeration, groundAt, idleThrottle } from '../world3d/terrain';
import { angleBetween, hubWind, rotorRpm, turnTowards } from './motion';
import { NACELLE_DROP, NACELLE_ROTOR_M, ROTOR_Y, nacelleGeometry, rotorGeometry, towerGeometry, turbineMaterial, turbineSize } from './models';

// 3D wind turbines: tower, nacelle and rotor at every turbine position of the channel (size from the rated power, standing on
// the terrain). Each faces into its wind and turns as fast as that wind drives it (motion.ts); both change gently when the
// wind does. The base layer publishes the turbines of the loaded tiles from zoom 12; a click on one opens its card.

/** A turbine this far outside of the screen (share of the view) is left out. */
const VIEW_MARGIN = 0.35;
/** the terrain under a turbine counts as changed from this much (m) */
const TERRAIN_STEP_M = 0.5;
/** without wind data: the usual west-south-west wind, here as it is at hub height */
const DEFAULT_FROM = 250;
const DEFAULT_HUB_MS = 8;
/** time constant of the turn towards a new wind (ms) */
const EASE_MS = 700;
/** longest step of one frame (ms): after a pause nothing jumps */
const MAX_STEP_MS = 100;
/** The map is only kept repainting for rotors at least this wide on screen (px). */
const SPIN_MIN_PX = 6;
/** pointer tolerance around tower and hub (px) */
const PICK_PX = 7;
/** closer than this (degrees, rad per ms) counts as arrived */
const YAW_REST = 0.2;
const SPEED_REST = 1e-6;
const TINT = 0xffffff;
const TINT_HOVER = 0xc4f2dd;
const TINT_SELECTED = 0x63d9a6;

interface Placed {
  hubM: number;
  rotorM: number;
  /** where the nose points (degrees from north) and where it is turning to */
  yaw: number;
  yawTo: number;
  /** rotor speed (rad per ms) and the one it is changing to */
  speed: number;
  speedTo: number;
  /** rotor angle (rad); starts at random, so that the turbines of a park are not in step */
  angle: number;
}

export class WindkraftPart implements StagePart {
  readonly object = new THREE.Group();
  /** the turbine whose card is shown */
  selected: string | null = null;
  private hovered: string | null = null;
  private turbines: readonly WindTurbineSample[] = [];
  private placed: Placed[] = [];
  /** terrain height under each turbine (m) */
  private ground: number[] = [];
  /** what the last frame drew: index and the height it stood at */
  private shown: { i: number; ground: number }[] = [];
  private models = new GeoInstances({ turm: towerGeometry(), gondel: nacelleGeometry(), rotor: rotorGeometry() }, turbineMaterial());
  private active = false;
  private base = new THREE.Matrix4();
  private matrix = new THREE.Matrix4();
  private part = new THREE.Matrix4();
  /** time of the last frame (ms) */
  private last = 0;

  constructor(private map: MlMap, private stage: Stage, private onClick: (id: string) => void, private reducedMotion: () => boolean) {
    this.object.add(this.models.object);
    this.object.visible = false;
  }

  /** Turbines of the last publish. */
  get count() {
    return this.turbines.length;
  }

  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    this.object.visible = on;
    if (on) this.map.on('idle', this.onIdle);
    else {
      this.map.off('idle', this.onIdle);
      this.shown = [];
    }
    this.stage.wake();
  }

  /** A new list from the channel (new tiles, or another wind): turbines already there keep their motion. */
  feed(items: readonly WindTurbineSample[]) {
    const before = new Map(this.turbines.map((t, i) => [t.id, { placed: this.placed[i]!, ground: this.ground[i]! }]));
    this.turbines = items;
    this.shown = [];
    this.placed = items.map((t) => {
      const size = turbineSize(t.outputMw);
      const hubMs = t.wind ? hubWind(t.wind.speedMs, size.hubM) : DEFAULT_HUB_MS;
      const yawTo = t.wind?.fromDeg ?? DEFAULT_FROM;
      const speedTo = (rotorRpm(size.rotorM, hubMs) * Math.PI * 2) / 60_000;
      const old = before.get(t.id)?.placed;
      return {
        ...size, yawTo, speedTo,
        yaw: old?.yaw ?? yawTo,
        speed: old?.speed ?? speedTo,
        angle: old?.angle ?? unit(t.id) * Math.PI * 2,
      };
    });
    this.ground = items.map((t) => before.get(t.id)?.ground ?? groundAt(this.map, t.lng, t.lat));
    this.stage.wake();
  }

  stats() {
    return { windTurbines: this.turbines.length, windDrawn: this.shown.length };
  }

  /** Terrain tiles arrive after the turbines: when the ground under them changed, they move with it. */
  private onIdle = idleThrottle(() => this.stage.wake(), () => {
    let changed = false;
    this.turbines.forEach((t, i) => {
      const h = groundAt(this.map, t.lng, t.lat);
      if (Math.abs(h - (this.ground[i] ?? 0)) > TERRAIN_STEP_M) changed = true;
      this.ground[i] = h;
    });
    if (changed) this.stage.wake();
  });

  update(frame: GeoFrame, now: number): boolean {
    if (!this.active) return false;
    const b = this.map.getBounds();
    const centre = this.map.getCenter();
    const padLon = (b.getEast() - b.getWest()) * VIEW_MARGIN;
    const padLat = (b.getNorth() - b.getSouth()) * VIEW_MARGIN;
    const ex = exaggeration(this.map);
    const still = this.reducedMotion();
    const dt = Math.min(MAX_STEP_MS, Math.max(0, now - this.last));
    this.last = now;
    const ease = 1 - Math.exp(-dt / EASE_MS);
    this.models.start(frame, this.turbines.length);
    this.shown = [];
    let moving = false;
    for (let i = 0; i < this.turbines.length; i++) {
      const t = this.turbines[i]!;
      const lon = t.lng + 360 * Math.round((centre.lng - t.lng) / 360);
      if (lon < b.getWest() - padLon || lon > b.getEast() + padLon || t.lat < b.getSouth() - padLat || t.lat > b.getNorth() + padLat) continue;
      const ground = (this.ground[i] ?? 0) * ex;
      if (frame.occluded(lon, t.lat, ground)) continue;
      const p = this.placed[i]!;
      const k = p.rotorM / NACELLE_ROTOR_M;
      const tint = t.id === this.selected ? TINT_SELECTED : t.id === this.hovered ? TINT_HOVER : TINT;
      // only a rotor large enough to be seen keeps the map repainting; the others take their new wind at once
      const seen = !still && p.rotorM >= SPIN_MIN_PX * frame.metresPerPixel(lon, t.lat, ground);
      p.yaw = seen ? turnTowards(p.yaw, p.yawTo, ease) : p.yawTo;
      p.speed = seen ? p.speed + (p.speedTo - p.speed) * ease : p.speedTo;
      // rotor: clockwise seen from where the wind comes from
      if (!still) p.angle -= p.speed * dt;
      if (seen && (p.speedTo > 0 || p.speed > SPEED_REST || angleBetween(p.yaw, p.yawTo) > YAW_REST)) moving = true;
      frame.place(this.base, lon, t.lat, ground, p.yaw);
      // tower: up to just below the hub axis
      const radius = Math.max(0.3, p.rotorM * 0.027);
      this.matrix.copy(this.base).multiply(this.part.makeScale(radius, radius, p.hubM - NACELLE_DROP * k));
      this.models.add('turm', this.matrix, tint);
      this.matrix.copy(this.base).multiply(this.part.makeTranslation(0, 0, p.hubM)).multiply(this.part.makeScale(k, k, k));
      this.models.add('gondel', this.matrix, tint);
      this.matrix.copy(this.base)
        .multiply(this.part.makeTranslation(0, ROTOR_Y * k, p.hubM))
        .multiply(this.part.makeRotationY(p.angle))
        .multiply(this.part.makeScale(p.rotorM, p.rotorM, p.rotorM));
      this.models.add('rotor', this.matrix, tint);
      this.shown.push({ i, ground });
    }
    this.models.finish();
    this.models.update(frame);
    return moving;
  }

  /** The turbine at a screen point (CSS px): on its tower or within its rotor, the closest one first. */
  pick(frame: GeoFrame, x: number, y: number): string | null {
    if (!this.active) return null;
    let best: string | null = null;
    let bestScore = 0;
    for (const { i, ground } of this.shown) {
      const t = this.turbines[i]!;
      const p = this.placed[i]!;
      const foot = frame.toScreen(t.lng, t.lat, ground);
      const hub = frame.toScreen(t.lng, t.lat, ground + p.hubM);
      if (!foot || !hub) continue;
      const disc = Math.max(PICK_PX, (p.rotorM * 0.4) / frame.metresPerPixel(t.lng, t.lat, ground + p.hubM));
      const score = Math.min(segmentDistance(x, y, foot, hub) - PICK_PX, Math.hypot(x - hub[0], y - hub[1]) - disc);
      if (score < bestScore) {
        bestScore = score;
        best = t.id;
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
    this.map.off('idle', this.onIdle);
    this.models.dispose();
    this.turbines = [];
    this.placed = [];
    this.shown = [];
  }
}
