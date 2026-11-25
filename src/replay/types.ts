// Replay mode: rewatch a past live event (a rocket launch, a re-entry …) as a 3D animation on the map. An event is data:
// actors that move along modelled tracks, phases with their own camera shot, and links to the real footage. Pure types,
// no DOM, no three.js (the drawing lives in pro/replay, the camera director in director.ts).
import type { LngLat } from '../core/geo';

/** Where an actor is at one instant. All angles in degrees. */
export interface ActorSample {
  lng: number;
  lat: number;
  /** height above the sea in metres */
  altM: number;
  /** speed relative to the ground, m/s */
  speedMs: number;
  /** direction the nose points, clockwise from north */
  heading: number;
  /** elevation of the body axis above the horizon: 90 upright, 0 lying */
  pitch: number;
  /** engines burning (plume) */
  burn: boolean;
  /** re-entry plasma glow, 0..1 */
  plasma: number;
  /** engines burning per group of the actor's `engines` layout (same order); absent: the actor has no engine display */
  engines?: number[];
}

/** How an actor's engines are arranged, for the live-stream style engine display. */
export interface EngineLayout {
  /** shown above the display */
  title: string;
  /** groups from the middle outwards: a ring each (a ring of 3 is a triangle) */
  groups: { label: string; total: number }[];
}

export type ActorKind = 'booster' | 'ship' | 'satellite';

export interface Actor {
  id: string;
  kind: ActorKind;
  label: string;
  /** engine arrangement (vehicles only) */
  engines?: EngineLayout;
  /** the shape to draw; absent: a Starship booster / ship by `kind` */
  model?: 'falcon-core' | 'falcon-side' | 'falcon-upper';
  /** length and radius of the body in metres, for the drawing (absent: the Starship values) */
  lengthM?: number;
  radiusM?: number;
  /** visible from / to, seconds after T-0 */
  from: number;
  to: number;
  /** state at `t` seconds after T-0; null outside [from, to] */
  at(t: number): ActorSample | null;
}

/** How the camera sits relative to what it follows. The Pro camera eases between shots. */
export interface Shot {
  /** actor id followed, or 'pad' for the launch site */
  target: string;
  /** a second actor kept in frame (the camera pulls back to include it) */
  also?: string;
  /** distance camera to target in metres */
  distM: number;
  /** direction of the camera seen from the target, degrees relative to the nose heading (180 = behind) */
  bearingRel: number;
  /** camera tilt: 0 straight down, 90 horizon */
  pitch: number;
  /** show the day / night terminator and the whole globe (orbit views) */
  globe?: boolean;
}

export interface Phase {
  id: string;
  label: string;
  /** one line for the info card */
  info: string;
  from: number;
  to: number;
  shot: Shot;
  /** replay speed that suits this phase (1 = real time); the player may follow it ("Auto") */
  speed: number;
}

export interface Tower {
  /** the foot of the tower */
  at: LngLat;
  heightM: number;
  /** height of the catch arms above the ground, metres */
  armsAltM: number;
  /** the arms open at the first time and have closed round the ship at the second (seconds after T-0) */
  armsClose: [open: number, closed: number];
  /** direction the arms reach from the tower, degrees from north */
  armsHeading: number;
}

export interface EventLink {
  label: string;
  url: string;
  /** what it is: the official stream, a recording, a report … */
  kind: 'official' | 'video' | 'report';
}

export interface ReplayEvent {
  id: string;
  title: string;
  subtitle: string;
  /** T-0 in ms since epoch (UTC) */
  t0: number;
  /** start of the replay, seconds after T-0 (negative: countdown) */
  start: number;
  /** end of the replay, seconds after T-0 */
  end: number;
  pad: LngLat;
  actors: Actor[];
  /** a launch tower with catch arms at the pad (drawn at its real size, never enlarged) */
  tower?: Tower;
  phases: Phase[];
  /** moments to jump to */
  markers: { t: number; label: string }[];
  links: EventLink[];
  /** one or two sentences for the details page */
  summary: string;
  /** key facts for the details page */
  facts: { label: string; value: string; emphasis?: boolean }[];
  /** what is real data and what is modelled, shown in the UI */
  note: string;
  sources: { name: string; url: string }[];
}

/** What the camera should do right now, worked out by the director: where to look, from which side, how far. */
export interface ShotView {
  phaseId: string;
  /** [lng, lat, altitude m] of what the camera keeps in the middle */
  target: [number, number, number];
  /** the direction the target points, degrees */
  heading: number;
  /** the map's bearing (where the camera looks) and pitch (0 down … 90 horizon) */
  bearing: number;
  pitch: number;
  /** camera distance to the target in metres */
  distM: number;
  /** a view of the whole globe (orbit shots) */
  globe: boolean;
}
