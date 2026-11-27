// Starship Flight 15 (Booster 22 + Ship 42, Starlink Group 31-2), 13 / 14 Nov 2026, Starbase, Texas: liftoff, hot staging,
// booster return, orbit, 26 Starlink V3 satellites, a day in orbit, de-orbit, re-entry and the first ship catch.
//
// What is real and what is modelled: the event times (T-0 22:47 UTC, Max-Q, MECO, staging, SECO-1, orbit insertion, deploy
// window, de-orbit burn, entry, catch at ~T+22:32), the 32° inclination and the ~275 km orbit come from the published
// timeline (see `sources`). There is no public telemetry: positions, heights and speeds BETWEEN those events are modelled
// (a Falcon-9-class ascent profile, real two-body orbit mechanics with J2 node drift, a Shuttle-class re-entry
// deceleration), then tuned so that the orbit really brings the ship back over the pad after ~22 h (tuning test).
import { bearing, destination, EARTH_RADIUS_KM, haversine, type LngLat } from '../../core/geo';
import { curve, lerpHeading, ramp } from '../curve';
import { EARTH_RADIUS_EQ_KM, orbitalSpeed, orbitPosition, orbitThrough, meanMotion, MU, type CircularOrbit } from '../orbit';
import type { Actor, ActorSample, Phase, ReplayEvent } from '../types';

/** Orbital Launch Pad 2 at Starbase (approximate, within ~100 m). */
export const PAD: LngLat = [-97.1541, 25.9961];

// ---- timeline, seconds after T-0 -------------------------------------------------------------------------------------
export const T = {
  start: -60,
  maxQ: 58,
  meco: 139,
  sep: 141,
  boostbackStart: 146,
  boostbackEnd: 182,
  splash: 390,
  seco1: 489,
  insertStart: 1570,
  insert: 1590,
  deployStart: 2100,
  deployEnd: 2100 + 42 * 60,
  deorbitStart: 21 * 3600 + 36 * 60,
  deorbitEnd: 21 * 3600 + 36 * 60 + 10,
  entry: 22 * 3600 + 10 * 60,
  flip: 22 * 3600 + 32 * 60 + 8,
  landingBurn: 22 * 3600 + 32 * 60 + 14,
  catch: 22 * 3600 + 32 * 60 + 34,
  end: 22 * 3600 + 32 * 60 + 34 + 45,
} as const;

/**
 * The orbit is fixed by physics: its plane contains the pad at T-0 (a launch goes into the plane of its pad), so only the
 * inclination, the altitude and how far along the plane the ship is at insertion are free. They are tuned (starship15.test.ts)
 * so that the ship comes back over Mexico about 22 h later, as it did.
 */
export interface FlightParams {
  /** orbit inclination, degrees */
  incDeg: number;
  /** mean orbit altitude, km: the orbit is modelled as circular at this height (period, ground track), the height shown swings around it */
  altKm: number;
  /** angular distance flown in the plane from the pad to the insertion point, as ground km (arc on the Earth) */
  phaseKm: number;
}
export const PARAMS: FlightParams = { incDeg: 32, altKm: 245, phaseKm: 9750 };
/** apogee height of the orbit, km: the insertion burn happens there; the perigee follows from the mean height */
export const APOGEE_KM = 275;

const STARLINKS = 26;
/** length of the ship's stack part above the booster centre: the ship's centre sits this far up the axis until staging (m) */
const STACK_OFFSET_M = 61;

// ---- ascent and booster return (km, degrees) ----------------------------------------------------------------------------
const downrange = (insertKm: number) => curve([[0, 0], [10, 0], [30, 0.5], [58, 3], [90, 14], [120, 34], [139, 55], [200, 170], [300, 540], [400, 1070], [489, 1700], [T.insert, insertKm]]);
const shipAlt = curve([[0, 0], [10, 0.15], [30, 2.5], [58, 12], [90, 35], [120, 56], [139, 68], [200, 105], [300, 135], [400, 150], [489, 155], [1000, 222], [T.insert, 275]]);
const shipPitch = curve([[0, 90], [10, 90], [30, 86], [58, 78], [90, 66], [120, 52], [139, 46], [200, 34], [300, 20], [400, 10], [489, 6], [T.insert, 0]]);
const boosterDown = curve([[141, 55], [160, 70], [182, 75], [250, 60], [330, 30], [T.splash, 22]]);
const boosterAlt = curve([[141, 68], [170, 85], [200, 96], [230, 98], [270, 90], [320, 62], [350, 38], [380, 8], [T.splash, 0]]);
const boosterPitch = curve([[141, 46], [150, 20], [160, 12], [200, 20], [260, 60], [320, 85], [T.splash, 90]]);

// ---- re-entry (u = seconds after the entry interface) ----------------------------------------------------------------------
const ENTRY_SEC = T.catch - T.entry;
const entrySpeed = curve([[0, 7.6], [120, 7.5], [300, 6.9], [480, 5.6], [720, 3.4], [900, 1.8], [1050, 0.9], [1200, 0.35], [1290, 0.2], [1334, 0.09], [ENTRY_SEC, 0.002]]);
const entryAlt = curve([[0, 100], [120, 85], [300, 70], [480, 62], [720, 50], [900, 38], [1050, 25], [1200, 14], [1290, 6], [1334, 1.6], [ENTRY_SEC, 0.08]]);
const entryPitch = curve([[0, 0], [40, 60], [600, 55], [1000, 35], [1200, 15], [1290, 0], [1320, 0], [T.flip - T.entry + 6, 85], [ENTRY_SEC, 90]]);
/** cumulative distance flown (fraction 0..1) after u seconds of re-entry, from the speed profile */
const entryProgress = (() => {
  const cum = [0];
  for (let u = 1; u <= ENTRY_SEC; u++) cum.push(cum[u - 1]! + entrySpeed(u - 0.5));
  const total = cum[ENTRY_SEC]!;
  return (u: number) => {
    const c = Math.min(Math.max(u, 0), ENTRY_SEC);
    const i = Math.floor(c);
    const f = c - i;
    return ((cum[i]! + (i < ENTRY_SEC ? (cum[i + 1]! - cum[i]!) * f : 0)) / total);
  };
})();

/**
 * Engines burning, per ring from the middle outwards. Super Heavy has 33 Raptors: 3 in the middle (they gimbal), 10 in the inner
 * ring, 20 in the outer ring. The ascent runs on all of them; the outer ring shuts down first, the rest at MECO; the boostback burn
 * restarts the 13 of the middle and inner rings. Timing of the shutdown is modelled.
 */
function boosterEngines(t: number): number[] {
  if (t < 0) return [0, 0, 0];
  if (t < 110) return [3, 10, 20];
  if (t < 120) return [3, 10, Math.round(20 * (1 - ramp(t, 110, 120)))];
  if (t <= T.meco) return [3, 10, 0];
  if (t >= T.boostbackStart && t <= T.boostbackEnd) return [3, 10, 0];
  return [0, 0, 0];
}

/**
 * The ship has 6 Raptors: 3 sea-level engines in the middle and 3 vacuum engines around them. Which ones fire in which burn is
 * modelled (ascent: all six; orbit and de-orbit burns: the vacuum engines; the landing burn: the sea-level engines).
 */
function shipEngines(t: number): number[] {
  if (within(t, [T.meco - 2, T.seco1])) return [3, 3];
  if (within(t, [T.insertStart, T.insert], [T.deorbitStart, T.deorbitEnd])) return [0, 3];
  if (within(t, [T.landingBurn, T.catch])) return [3, 0];
  return [0, 0];
}
const lit = (e: number[]) => e.some((n) => n > 0);

const within = (t: number, ...w: [number, number][]) => w.some(([a, b]) => t >= a && t <= b);
const smooth = (x: number) => x * x * (3 - 2 * x);

/** Move a sample `m` metres along its body axis (the ship rides on top of the booster until staging). */
function along(s: ActorSample, m: number): ActorSample {
  const p = (s.pitch * Math.PI) / 180;
  const [lng, lat] = destination([s.lng, s.lat], s.heading, (m * Math.cos(p)) / 1000);
  return { ...s, lng, lat, altM: s.altM + m * Math.sin(p) };
}

export interface Flight {
  ship(t: number): ActorSample;
  booster(t: number): ActorSample;
  satellite(i: number, t: number): ActorSample | null;
  /** orbit of the ship from insertion on */
  orbit: CircularOrbit;
  /** where the re-entry starts, and how far it is to the pad (km) */
  entryPoint: LngLat;
  entryKm: number;
  /** heading the orbit has at the entry point */
  entryHeading: number;
}

export function buildFlight(p: FlightParams = PARAMS): Flight {
  // the plane through the pad at T-0, advanced along the plane to the insertion point
  const plane = orbitThrough(PAD[0], PAD[1], 0, p.altKm, p.incDeg, true);
  const orbit: CircularOrbit = { ...plane, u0: plane.u0 + p.phaseKm / EARTH_RADIUS_KM, t0: T.insert };
  const insertPos = orbitPosition(orbit, T.insert);
  // the ascent flies a great circle from the pad to that point
  const az = bearing(PAD, insertPos);
  const insertKm = haversine(PAD, insertPos);
  const D = downrange(insertKm);
  const onTrack = (km: number): LngLat => destination(PAD, az, km);
  // the orbit is slightly elliptical (apogee at insertion, perigee below the mean): the height swings once per revolution
  const swing = APOGEE_KM - p.altKm;
  const ellipAlt = (o: CircularOrbit, t: number) => o.a - EARTH_RADIUS_EQ_KM + swing * Math.cos(o.u0 + meanMotion(o.a) * (t - o.t0) - orbit.u0);
  const e0 = ellipAlt(orbit, T.deorbitEnd);
  const orbitAlt = (t: number) => (t <= T.deorbitEnd ? ellipAlt(orbit, t) : decay(t));
  const decay = curve([[T.deorbitEnd, e0], [T.deorbitEnd + 700, e0 - 0.25 * (e0 - 100)], [T.deorbitEnd + 1400, e0 - 0.6 * (e0 - 100)], [T.entry, 100]]);
  const entryPoint = orbitPosition(orbit, T.entry);
  const entryKm = haversine(entryPoint, PAD);
  const entryBearing = bearing(entryPoint, PAD);
  const orbitHeading = (t: number) => bearing(orbitPosition(orbit, t), orbitPosition(orbit, t + 1));
  const entryHeading = orbitHeading(T.entry);

  const ascentPos = (t: number) => onTrack(D(Math.max(0, t)));
  const ascentHeading = (t: number) => bearing(ascentPos(t), ascentPos(t + 1));

  const ascentSpeed = (dist: (t: number) => number, alt: (t: number) => number, t: number) => 1000 * Math.hypot(dist(t + 0.5) - dist(t - 0.5), alt(t + 0.5) - alt(t - 0.5));

  // the stack: booster centre; the ship's centre is above it
  const boosterAscent = (t: number): ActorSample => {
    const [lng, lat] = ascentPos(t);
    const pitch = shipPitch(t);
    return { lng, lat, altM: shipAlt(t) * 1000 + 35, speedMs: ascentSpeed(D, shipAlt, t), heading: t < 5 ? az : ascentHeading(t), pitch, burn: lit(boosterEngines(t)), plasma: 0, engines: boosterEngines(t) };
  };

  const booster = (t: number): ActorSample => {
    if (t < T.sep) return boosterAscent(t);
    const tt = Math.min(t, T.splash);
    const [lng, lat] = onTrack(boosterDown(tt));
    const turn = smooth(ramp(t, T.sep, T.sep + 19));
    return {
      lng, lat, altM: boosterAlt(tt) * 1000,
      speedMs: t >= T.splash ? 0 : ascentSpeed(boosterDown, boosterAlt, tt),
      heading: lerpHeading(az, az + 180, turn), pitch: boosterPitch(tt),
      burn: lit(boosterEngines(t)), plasma: 0, engines: boosterEngines(t),
    };
  };

  const ship = (t: number): ActorSample => {
    if (t < T.sep) {
      // on the stack the ship rides along; its own engines light just before the booster's shut down (hot staging)
      const e = shipEngines(t);
      return { ...along(boosterAscent(t), STACK_OFFSET_M), burn: lit(e), engines: e };
    }
    if (t < T.insert) {
      const [lng, lat] = ascentPos(t);
      return {
        lng, lat, altM: shipAlt(t) * 1000, speedMs: t < T.seco1 ? ascentSpeed(D, shipAlt, t) : 1000 * orbitalSpeed(EARTH_RADIUS_EQ_KM + shipAlt(t)),
        heading: ascentHeading(t), pitch: shipPitch(t), burn: lit(shipEngines(t)), plasma: 0, engines: shipEngines(t),
      };
    }
    if (t < T.entry) {
      const [lng, lat] = orbitPosition(orbit, t);
      // turn round for the de-orbit burn (retrograde), burn, turn back
      const flipped = smooth(ramp(t, T.deorbitStart - 20, T.deorbitStart)) - smooth(ramp(t, T.deorbitEnd, T.deorbitEnd + 20));
      return {
        lng, lat, altM: orbitAlt(t) * 1000, speedMs: 1000 * orbitalSpeed(EARTH_RADIUS_EQ_KM + orbitAlt(t)),
        heading: (orbitHeading(t) + 180 * flipped) % 360, pitch: 0, burn: lit(shipEngines(t)), plasma: 0, engines: shipEngines(t),
      };
    }
    const u = Math.min(t - T.entry, ENTRY_SEC);
    const [lng, lat] = destination(entryPoint, entryBearing, entryKm * entryProgress(u));
    const left = haversine([lng, lat], PAD);
    return {
      lng, lat, altM: entryAlt(u) * 1000, speedMs: 1000 * entrySpeed(u),
      heading: left > 0.3 ? bearing([lng, lat], PAD) : entryBearing, pitch: entryPitch(u),
      burn: lit(shipEngines(t)), plasma: ramp(u, 40, 250) * (1 - ramp(u, 600, 950)), engines: shipEngines(t),
    };
  };

  // Starlink V3 satellites: released into the ship's orbit one after another, each with a few cm/s to m/s of its own, so
  // the string spreads out along the track over the day
  const deployAt = (i: number) => T.deployStart + ((T.deployEnd - T.deployStart) * i) / (STARLINKS - 1);
  const satOrbits: CircularOrbit[] = [];
  for (let i = 0; i < STARLINKS; i++) {
    const dn = (0.0003 * (i - (STARLINKS - 1) / 2)) / orbit.a; // rad/s
    const n = meanMotion(orbit.a) + dn;
    satOrbits.push({ ...orbit, a: Math.cbrt(MU / (n * n)), u0: orbit.u0 - dn * (deployAt(i) - T.insert) });
  }
  const satellite = (i: number, t: number): ActorSample | null => {
    const o = satOrbits[i];
    if (!o || t < deployAt(i)) return null;
    const [lng, lat] = orbitPosition(o, t);
    const [lng2, lat2] = orbitPosition(o, t + 1);
    return { lng, lat, altM: ellipAlt(o, t) * 1000, speedMs: 1000 * orbitalSpeed(o.a), heading: bearing([lng, lat], [lng2, lat2]), pitch: 0, burn: false, plasma: 0 };
  };

  return { ship, booster, satellite, orbit, entryPoint, entryKm, entryHeading };
}

/** Distance in km between where the orbit takes the ship at `T.entry` and the pad, plus how far the heading there is from the line to the pad. Used by the tuning test. */
export function returnMiss(f: Flight): { km: number; headingDeg: number } {
  const dh = Math.abs((((bearing(f.entryPoint, PAD) - f.entryHeading) % 360) + 540) % 360 - 180);
  return { km: f.entryKm, headingDeg: dh };
}

export function buildStarship15(p: FlightParams = PARAMS): ReplayEvent {
  const f = buildFlight(p);
  const actors: Actor[] = [
    { id: 'booster', kind: 'booster', label: 'Super Heavy Booster 22', engines: { title: 'Booster 22', groups: [{ label: 'Mitte', total: 3 }, { label: 'Innen', total: 10 }, { label: 'Außen', total: 20 }] }, from: T.start, to: T.splash + 40, at: (t) => (t < T.start || t > T.splash + 40 ? null : f.booster(t)) },
    { id: 'ship', kind: 'ship', label: 'Starship Ship 42', engines: { title: 'Ship 42', groups: [{ label: 'Meeresspiegel', total: 3 }, { label: 'Vakuum', total: 3 }] }, from: T.start, to: T.end, at: (t) => (t < T.start || t > T.end ? null : f.ship(t)) },
  ];
  for (let i = 0; i < STARLINKS; i++) {
    actors.push({ id: `sat${i + 1}`, kind: 'satellite', label: `Starlink V3 #${i + 1}`, from: T.deployStart + ((T.deployEnd - T.deployStart) * i) / (STARLINKS - 1), to: T.end, at: (t) => (t > T.end ? null : f.satellite(i, t)) });
  }
  const phases: Phase[] = [
    { id: 'countdown', label: 'Countdown', info: 'Booster 22 und Ship 42 stehen auf Startplatz 2 in Starbase.', from: T.start, to: 0, speed: 1, shot: { target: 'booster', distM: 420, bearingRel: 150, pitch: 82 } },
    { id: 'ascent', label: 'Aufstieg', info: '33 Raptor-3-Triebwerke heben den Stapel ab; Max-Q nach 58 s.', from: 0, to: T.meco, speed: 1, shot: { target: 'booster', distM: 900, bearingRel: 135, pitch: 76 } },
    { id: 'staging', label: 'Heißtrennung', info: 'Das Ship zündet noch am Booster und trennt sich.', from: T.meco, to: 200, speed: 1, shot: { target: 'ship', also: 'booster', distM: 1800, bearingRel: 120, pitch: 80 } },
    { id: 'booster', label: 'Booster kehrt zurück', info: 'Boostback-Zündung, dann kontrollierter Wassereinschlag im Golf: der Turmfang wurde abgebrochen.', from: 200, to: T.splash + 30, speed: 1, shot: { target: 'booster', also: 'ship', distM: 5000, bearingRel: 150, pitch: 72 } },
    { id: 'ship-ascent', label: 'Ship allein', info: 'Das Ship beschleunigt auf der suborbitalen Bahn.', from: T.splash + 30, to: T.seco1 + 10, speed: 1, shot: { target: 'ship', distM: 2500, bearingRel: 200, pitch: 76 } },
    { id: 'coast', label: 'Antriebsloser Flug', info: 'Triebwerke aus, der Bogen steigt zum höchsten Punkt.', from: T.seco1 + 10, to: T.insertStart, speed: 10, shot: { target: 'ship', distM: 600_000, bearingRel: 160, pitch: 60, globe: true } },
    { id: 'insertion', label: 'Orbit-Einschuss', info: 'Kurze Zündung im höchsten Punkt: Umlaufbahn in etwa 275 km Höhe.', from: T.insertStart, to: T.insert + 20, speed: 1, shot: { target: 'ship', distM: 900, bearingRel: 215, pitch: 78 } },
    { id: 'deploy', label: 'Starlink-Ausbringung', info: '26 Starlink-V3-Satelliten, einer etwa alle 100 s.', from: T.insert + 20, to: T.deployEnd + 120, speed: 20, shot: { target: 'ship', distM: 6000, bearingRel: 220, pitch: 70 } },
    { id: 'orbit', label: 'In der Umlaufbahn', info: 'Rund 14 Umläufe in 22 Stunden. Die Bodenspur wandert mit der Erddrehung nach Westen.', from: T.deployEnd + 120, to: T.deorbitStart - 90, speed: 3600, shot: { target: 'ship', distM: 14_000_000, bearingRel: 0, pitch: 12, globe: true } },
    { id: 'deorbit', label: 'Deorbit-Zündung', info: 'Zehn Sekunden gegen die Flugrichtung bringen die Bahn in die Atmosphäre.', from: T.deorbitStart - 90, to: T.deorbitEnd + 60, speed: 1, shot: { target: 'ship', distM: 400, bearingRel: 235, pitch: 80 } },
    { id: 'approach', label: 'Anflug', info: 'Über dem Pazifik, rund 35 Minuten bis zum Wiedereintritt.', from: T.deorbitEnd + 60, to: T.entry - 20, speed: 120, shot: { target: 'ship', distM: 3_000_000, bearingRel: 20, pitch: 25, globe: true } },
    { id: 'entry', label: 'Wiedereintritt', info: 'Der Hitzeschild glüht, vier Flaps steuern das Ship.', from: T.entry - 20, to: T.entry + 600, speed: 4, shot: { target: 'ship', distM: 170, bearingRel: 290, pitch: 84 } },
    { id: 'descent', label: 'Gleitflug', info: 'Über Nordmexiko und Südtexas im Bauchfluglage nach Starbase.', from: T.entry + 600, to: T.flip - 40, speed: 6, shot: { target: 'ship', distM: 320, bearingRel: 300, pitch: 80 } },
    { id: 'catch', label: 'Flip und Fang', info: 'Flip, Landebrennen und die Greifarme fangen das Ship.', from: T.flip - 40, to: T.end, speed: 1, shot: { target: 'ship', distM: 260, bearingRel: 55, pitch: 86 } },
  ];
  return {
    id: 'starship-flight-15',
    title: 'Starship Flug 15',
    subtitle: 'Orbit, 26 Starlink V3 und der erste Schiffsfang',
    t0: Date.UTC(2026, 10, 13, 22, 47, 0),
    start: T.start,
    end: T.end,
    pad: PAD,
    actors,
    // Mechazilla: its arms reach east to the catch point, which is the pad position of the ship at T+22:32:34
    tower: { at: destination(PAD, 270, 0.016), heightM: 146, armsAltM: 70, armsClose: [T.catch - 40, T.catch - 3], armsHeading: 90 },
    phases,
    markers: [
      { t: 0, label: 'Start' },
      { t: T.maxQ, label: 'Max-Q' },
      { t: T.sep, label: 'Heißtrennung' },
      { t: T.splash, label: 'Booster im Golf' },
      { t: T.seco1, label: 'Triebwerke aus' },
      { t: T.insert, label: 'Orbit erreicht' },
      { t: T.deployStart, label: 'Starlink' },
      { t: T.deorbitStart, label: 'Deorbit' },
      { t: T.entry, label: 'Wiedereintritt' },
      { t: T.entry + 300, label: 'Plasma' },
      { t: T.flip, label: 'Flip' },
      { t: T.catch, label: 'Fang' },
    ],
    links: [
      { label: 'Livestream von SpaceX (X)', url: 'https://x.com/i/broadcasts/2brajgZlOKRMka', kind: 'official' },
      { label: 'SpaceX: Flug 15', url: 'https://www.spacex.com/launches/starship-flight-15', kind: 'official' },
      { label: 'Space.com: Start und Booster-Wasserung', url: 'https://youtu.be/F0ltKM5qc7A', kind: 'video' },
      { label: 'NASASpaceflight', url: 'https://www.youtube.com/watch?v=9XM0lpVlvo0', kind: 'video' },
      { label: 'Everyday Astronaut', url: 'https://www.youtube.com/watch?v=QJFdKoKNn2M', kind: 'video' },
      { label: 'Spaceflight Now', url: 'https://www.youtube.com/watch?v=QlR1agMLyMk', kind: 'video' },
    ],
    summary: 'Der 15. Flug des Starship-Systems: Zum ersten Mal fliegt ein Ship fast einen ganzen Tag im Orbit, setzt 26 Starlink-V3-Satelliten aus und kehrt zum Startturm zurück, wo die Greifarme es fangen. Der Booster wasserte stattdessen im Golf, der geplante Turmfang wurde abgebrochen.',
    facts: [
      { label: 'Dauer', value: '22 h 33 min', emphasis: true },
      { label: 'Ergebnis', value: 'Ship gefangen, Booster im Golf', emphasis: true },
      { label: 'Start', value: 'Fr 13. Nov. 2026, 22:47 UTC (16:47 Ortszeit)' },
      { label: 'Fahrzeuge', value: 'Super Heavy Booster 22, Starship Ship 42' },
      { label: 'Startplatz', value: 'Starbase, Texas (Startplatz 2)' },
      { label: 'Nutzlast', value: '26 Starlink V3' },
      { label: 'Umlaufbahn', value: 'Bahnneigung 32°, Apogäum etwa 275 km' },
      { label: 'Triebwerke', value: '33 Raptor 3 am Booster, 6 am Ship' },
    ],
    note: 'Zeitpunkte, Bahnneigung (32°) und Orbithöhe (Apogäum rund 275 km) stammen aus dem veröffentlichten Ablauf. Es gibt keine öffentliche Telemetrie: Positionen, Höhen und Geschwindigkeiten dazwischen sind modelliert, die Umlaufbahn mit echter Bahnmechanik.',
    sources: [
      { name: 'Space.com', url: 'https://www.space.com/space-exploration/launches-spacecraft/spacex-starship-flight-15-chopsticks-double-catch-super-heavy-ship' },
      { name: 'Space Launch Schedule', url: 'https://www.spacelaunchschedule.com/launch/starship-starlink-group-31-2-starship-flight-15/' },
      { name: 'NASASpaceFlight', url: 'https://www.nasaspaceflight.com/2026/11/starship-flight-15-spacex-history/' },
      { name: 'CNN', url: 'https://www.cnn.com/2026/11/13/science/live-news/spacex-starship-flight-15-ship-catch' },
    ],
  };
}

export const starship15 = buildStarship15();
