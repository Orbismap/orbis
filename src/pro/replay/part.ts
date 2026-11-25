import * as THREE from 'three';
import type { Map as MlMap } from 'maplibre-gl';
import type { Actor, ActorSample, ReplayChannel, ReplayEvent, Tower } from '../../ext/types';
import type { GeoFrame, Vec3 } from '../world3d/frame';
import { GeoLine } from '../world3d/line';
import type { StagePart } from '../world3d/stage';
import { BOOSTER_LEN, disposeGroup, makeBooster, makePlasma, makePlume, makeSatellite, makeShip, R, SAT_LEN, SHIP_LEN } from './models';

// The 3D side of the replay mode: draws the actors of the open event (booster, ship, Starlink satellites) at the playhead,
// their exhaust and re-entry plasma, the growing trails, the launch tower with its catch arms and a few labels. Everything is
// derived from `replay.t` at draw time, so the picture always matches the camera (which uses the same instant).

const RAD = Math.PI / 180;
const ramp = (x: number, a: number, b: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
const smooth = (x: number) => x * x * (3 - 2 * x);

/** the models are never smaller on screen than this many CSS px (they grow when far away) */
const MIN_PX: Record<Actor['kind'], number> = { booster: 16, ship: 20, satellite: 5 };
const LEN: Record<Actor['kind'], number> = { booster: BOOSTER_LEN, ship: SHIP_LEN, satellite: SAT_LEN };
const TRAIL_COLOR: Partial<Record<Actor['kind'], string>> = { ship: '#ffb35c', booster: '#7fd0ff' };

interface Trail {
  line: GeoLine;
  points: Vec3[];
  times: number[];
}

interface Rig {
  actor: Actor;
  model: THREE.Group;
  /** exhaust at the engine end (booster, ship) */
  plume?: { group: THREE.Group; mats: THREE.MeshBasicMaterial[]; base: number[]; length: number };
  /** re-entry plasma (ship), in a frame without tilt */
  plasma?: { group: THREE.Group; mats: THREE.MeshBasicMaterial[]; base: number[] };
  trail?: Trail;
  label?: HTMLDivElement;
  /** the last sample drawn, for the label and the longitude of the trail head */
  last: ActorSample | null;
}

/** points of an actor's whole flight: every few seconds, finer where it changes fast, longitudes continuous */
function sampleTrail(actor: Actor): Trail | undefined {
  const points: Vec3[] = [];
  const times: number[] = [];
  let lastLng = 0;
  for (let t = actor.from; t <= actor.to; ) {
    const s = actor.at(t);
    if (s) {
      lastLng = points.length ? s.lng + 360 * Math.round((lastLng - s.lng) / 360) : s.lng;
      points.push([lastLng, s.lat, s.altM]);
      times.push(t);
    }
    t += actor.kind === 'booster' ? 2 : t < 1700 ? 5 : t < 77_600 ? 30 : 5;
  }
  if (points.length < 2) return undefined;
  const color = TRAIL_COLOR[actor.kind];
  if (!color) return undefined;
  const line = new GeoLine(points, { color, width: actor.kind === 'ship' ? 2.5 : 2, opacity: 0.85 });
  line.setVisible(0);
  return { line, points, times };
}

/** number of entries of an ascending list that are <= x */
function countUpTo(list: number[], x: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]! <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const fmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
function describe(s: ActorSample): string {
  const alt = s.altM >= 1000 ? `${fmt.format(s.altM / 1000)} km` : `${fmt.format(s.altM)} m`;
  const speed = s.speedMs >= 1000 ? `${fmt1.format(s.speedMs / 1000)} km/s` : `${fmt.format(s.speedMs * 3.6)} km/h`;
  return `${alt} · ${speed}`;
}

export class ReplayPart implements StagePart {
  readonly object = new THREE.Group();
  private ev: ReplayEvent | null = null;
  private rigs: Rig[] = [];
  private tower: { group: THREE.Group; arms: THREE.Mesh[]; def: Tower } | null = null;
  private labelBox = document.createElement('div');
  private matrix = new THREE.Matrix4();
  private tilt = new THREE.Matrix4();
  private stopEvent: () => void;

  constructor(map: MlMap, private replay: ReplayChannel, private wasDrag: () => boolean = () => false) {
    this.object.visible = false;
    this.labelBox.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1';
    map.getCanvasContainer().appendChild(this.labelBox);
    this.stopEvent = replay.event.subscribe((ev) => this.load(ev));
  }

  private clear() {
    for (const r of this.rigs) {
      this.object.remove(r.model);
      disposeGroup(r.model);
      if (r.plume) { this.object.remove(r.plume.group); disposeGroup(r.plume.group); r.plume.mats.forEach((m) => m.dispose()); }
      if (r.plasma) { this.object.remove(r.plasma.group); disposeGroup(r.plasma.group); r.plasma.mats.forEach((m) => m.dispose()); }
      if (r.trail) { this.object.remove(r.trail.line.object); r.trail.line.dispose(); }
    }
    this.rigs = [];
    if (this.tower) { this.object.remove(this.tower.group); disposeGroup(this.tower.group); this.tower = null; }
    this.labelBox.replaceChildren();
  }

  private load(ev: ReplayEvent | null) {
    this.clear();
    this.ev = ev;
    this.object.visible = !!ev;
    if (!ev) return;
    // one shared model per kind would save memory, but there are few actors; satellites share geometry through clone()
    const satTemplate = makeSatellite();
    for (const actor of ev.actors) {
      const model = actor.kind === 'booster' ? makeBooster() : actor.kind === 'ship' ? makeShip() : satTemplate.clone();
      model.matrixAutoUpdate = false;
      model.visible = false;
      const rig: Rig = { actor, model, last: null };
      if (actor.kind !== 'satellite') {
        const p = makePlume();
        const length = actor.kind === 'ship' ? SHIP_LEN : BOOSTER_LEN;
        p.group.position.z = -length / 2;
        model.add(p.group);
        rig.plume = { ...p, base: p.mats.map((m) => m.opacity), length };
        rig.trail = sampleTrail(actor);
        if (rig.trail) this.object.add(rig.trail.line.object);
        rig.label = this.makeLabel();
      }
      if (actor.kind === 'ship') {
        const pl = makePlasma();
        pl.group.matrixAutoUpdate = false;
        rig.plasma = { ...pl, base: pl.mats.map((m) => m.opacity) };
        this.object.add(pl.group);
      }
      this.object.add(model);
      this.rigs.push(rig);
    }
    // Starlink satellites are many and tiny: one label for the whole string would be better, so only the booster and the ship get one
    if (ev.tower) this.tower = this.makeTower(ev.tower);
  }

  private makeLabel(): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText =
      'display:none;position:absolute;left:0;top:0;white-space:pre;text-align:left;font:600 12px/1.25 system-ui,sans-serif;color:#fff;' +
      'text-shadow:0 0 3px rgba(10,12,16,.95),0 0 3px rgba(10,12,16,.95);will-change:transform';
    this.labelBox.append(el);
    return el;
  }

  private makeTower(def: Tower) {
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    const steel = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });
    const orange = new THREE.MeshLambertMaterial({ color: 0xc86a2a });
    const body = new THREE.Mesh(new THREE.BoxGeometry(11, 11, def.heightM), steel);
    body.position.z = def.heightM / 2;
    group.add(body);
    // the catch arms: two beams that reach out from the tower, apart while the ship comes in, round it when it is held
    const arms: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(3.2, 18, 4), orange);
      arm.position.set(side * 17, 9, def.armsAltM);
      arm.userData.side = side;
      arms.push(arm);
      group.add(arm);
    }
    this.object.add(group);
    return { group, arms, def };
  }

  /** The vehicle at a screen point (CSS px): the nearest whose on-screen size (plus some slack) reaches it. */
  pick(frame: GeoFrame, x: number, y: number): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    for (const rig of this.rigs) {
      const s = rig.last;
      if (!s || !rig.model.visible) continue;
      const p = frame.toScreen(s.lng, s.lat, s.altM);
      if (!p) continue;
      const len = LEN[rig.actor.kind];
      const px = Math.max(MIN_PX[rig.actor.kind], len / frame.metresPerPixel(s.lng, s.lat, s.altM));
      const reach = px / 2 + 8;
      const d = Math.hypot(p[0] - x, p[1] - y);
      if (d <= reach && d < bestD) { best = rig.actor.id; bestD = d; }
    }
    return best;
  }

  /** A click on a vehicle takes the camera to it (a click that ended a drag of the view does not). */
  click(id: string) {
    if (this.wasDrag()) return;
    this.replay.setFocus(this.replay.focus.peek() === id ? null : id);
  }

  stats(): Record<string, number> {
    return { replayActors: this.rigs.length };
  }

  update(frame: GeoFrame): boolean {
    const ev = this.ev;
    if (!ev) return false;
    const t = this.replay.t.peek();
    for (const rig of this.rigs) this.drawRig(rig, frame, t);
    if (this.tower) this.drawTower(this.tower, frame, t);
    return this.replay.playing.peek();
  }

  private drawRig(rig: Rig, frame: GeoFrame, t: number) {
    const s = rig.actor.at(t);
    rig.last = s;
    rig.model.visible = !!s;
    if (rig.plasma) rig.plasma.group.visible = false;
    if (!s) {
      if (rig.label) rig.label.style.display = 'none';
      rig.trail?.line.setVisible(0);
      return;
    }
    const len = LEN[rig.actor.kind];
    const mpp = frame.metresPerPixel(s.lng, s.lat, s.altM);
    const scale = Math.max(1, (MIN_PX[rig.actor.kind] * mpp) / len);
    // placement: heading about the vertical, then the body axis tilts from upright by (90 - pitch) towards the nose
    frame.place(this.matrix, s.lng, s.lat, s.altM, s.heading, scale);
    this.tilt.makeRotationX(-(90 - s.pitch) * RAD);
    this.matrix.multiply(this.tilt);
    rig.model.matrix.copy(this.matrix);
    rig.model.matrixWorldNeedsUpdate = true;
    // exhaust: wider and a little shorter in the thin air up high, gone when the model is blown up for far views
    const far = 1 - ramp(scale, 6, 40);
    if (rig.plume) {
      const vac = smooth(ramp(s.altM, 25_000, 90_000));
      const flick = 0.9 + 0.1 * Math.sin(performance.now() * 0.04 + rig.actor.from);
      const on = s.burn ? flick * far : 0;
      rig.plume.group.visible = on > 0.01;
      const w = R * (1.05 + 2.4 * vac);
      const l = rig.plume.length * (1.0 - 0.25 * vac) * (rig.actor.kind === 'ship' ? 0.9 : 1.2);
      rig.plume.group.scale.set(w, w, l);
      rig.plume.mats.forEach((m, i) => (m.opacity = rig.plume!.base[i]! * on));
    }
    if (rig.plasma && s.plasma > 0.01) {
      // behind the ship along its flight path, not tilted with the body
      frame.place(this.matrix, s.lng, s.lat, s.altM, s.heading, scale);
      this.matrix.multiply(this.tilt.makeTranslation(0, -16, 0));
      rig.plasma.group.matrix.copy(this.matrix);
      rig.plasma.group.matrixWorldNeedsUpdate = true;
      rig.plasma.group.visible = true;
      const k = s.plasma * far;
      rig.plasma.mats.forEach((m, i) => (m.opacity = rig.plasma!.base[i]! * k));
    }
    if (rig.trail) this.drawTrail(rig.trail, s, frame, t);
    this.drawLabel(rig, s, frame, scale);
  }

  private drawTrail(trail: Trail, s: ActorSample, frame: GeoFrame, t: number) {
    const n = countUpTo(trail.times, t);
    if (n === 0) { trail.line.setVisible(0); return; }
    const last = trail.points[n - 1]!;
    const head: Vec3 = [s.lng + 360 * Math.round((last[0] - s.lng) / 360), s.lat, s.altM];
    trail.line.setVisible(n < trail.points.length ? n + 1 : n, n < trail.points.length ? head : undefined);
    trail.line.update(frame);
  }

  private drawLabel(rig: Rig, s: ActorSample, frame: GeoFrame, scale: number) {
    // a satellite only has a label while it is the one in focus
    if (!rig.label && this.replay.focus.peek() === rig.actor.id) rig.label = this.makeLabel();
    const el = rig.label;
    if (!el) return;
    if (rig.actor.kind === 'satellite' && this.replay.focus.peek() !== rig.actor.id) { el.style.display = 'none'; return; }
    // up close the vehicle speaks for itself; a label shows once it is only a mark
    const picked = this.replay.focus.peek() === rig.actor.id;
    const p = scale > 2.5 || picked ? frame.toScreen(s.lng, s.lat, s.altM) : null;
    if (!p) { el.style.display = 'none'; return; }
    el.textContent = `${rig.actor.label}\n${describe(s)}`;
    el.style.display = 'block';
    el.style.transform = `translate(${Math.round(p[0] + 14)}px,${Math.round(p[1] - 10)}px)`;
  }

  private drawTower(tower: NonNullable<ReplayPart['tower']>, frame: GeoFrame, t: number) {
    const { def, group, arms } = tower;
    frame.place(this.matrix, def.at[0], def.at[1], 0, def.armsHeading);
    group.matrix.copy(this.matrix);
    group.matrixWorldNeedsUpdate = true;
    const [open, closed] = def.armsClose;
    // before `open` the arms are spread wide; they close round the ship between the two times
    const close = smooth(ramp(t, open, closed));
    const gap = 17 - close * (17 - 5.8);
    for (const arm of arms) arm.position.set((arm.userData.side as number) * gap, 9, def.armsAltM);
  }

  dispose() {
    this.stopEvent();
    this.clear();
    this.labelBox.remove();
  }
}
