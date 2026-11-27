// Falcon Heavy test flight, 6 Feb 2018, Launch Complex 39A, Florida: the first flight of the most powerful rocket of its time, with Elon Musk's
// Tesla Roadster as the dummy payload. 27 engines lift off; the two side boosters land side by side at Cape Canaveral, the centre core misses
// the drone ship; the upper stage carries "Starman" on.
//
// Real: the date and T-0 (20:45 UTC), the times of side booster cut-off and separation, the centre core cut-off, the landings (T+8:45 on land,
// the centre core at T+8:57), the outcome. Modelled: every position, height and speed in between (there is no public telemetry), the orbit as a
// circle. The replay ends in the parking orbit, 18 minutes in: the burns and the Roadster's flight to the orbit of Mars are not shown.
import { bearing, destination, EARTH_RADIUS_KM, haversine, type LngLat } from '../../core/geo';
import { curve, lerpHeading, ramp } from '../curve';
import { EARTH_RADIUS_EQ_KM, orbitalSpeed, orbitPosition, orbitPositionAt, orbitThrough, type CircularOrbit } from '../orbit';
import type { Actor, ActorSample, EngineLayout, Phase, ReplayEvent, Shot } from '../types';

export const PAD_39A: LngLat = [-80.6041, 28.6083];
const LZ1: LngLat = [-80.5447, 28.4858];
const LZ2: LngLat = [-80.5432, 28.4853];

const T = { start: -60, maxQ: 68, sideMeco: 150, sideSep: 153, boostback: [161, 200] as [number, number], entryBurn: [338, 358] as [number, number], coreMeco: 184, coreSep: 187, upperIgnition: 192, landingBurn: 500, landSide: 525, seco: 515, coreEntry: [356, 378] as [number, number], coreLanding: [513, 531] as [number, number], coreImpact: 537, end: 1100 } as const;
const CORE_LEN = 41.2;
const SIDE_LEN = 47;
const UPPER_LEN = 27;
/** the upper stage rides this far above the middle of the centre core */
const UPPER_OFFSET = CORE_LEN / 2 + UPPER_LEN / 2 - 1;
const ORBIT_KM = 300;
const BURNOUT_KM = 2050;

const CORE_ENGINES: EngineLayout = { title: 'Falcon Heavy', groups: [{ label: 'Mitte', total: 1 }, { label: 'Außen', total: 8 }] };
const UPPER_ENGINES: EngineLayout = { title: 'Obere Stufe', groups: [{ label: 'Vakuum', total: 1 }] };
const smooth = (x: number) => x * x * (3 - 2 * x);
const within = (t: number, ...w: [number, number][]) => w.some(([a, b]) => t >= a && t <= b);
const lit = (e: number[]) => e.some((n) => n > 0);

function along(s: ActorSample, m: number): ActorSample {
  const p = (s.pitch * Math.PI) / 180;
  const [lng, lat] = destination([s.lng, s.lat], s.heading, (m * Math.cos(p)) / 1000);
  return { ...s, lng, lat, altM: s.altM + m * Math.sin(p) };
}
const aside = (s: ActorSample, m: number): ActorSample => {
  const [lng, lat] = destination([s.lng, s.lat], s.heading + 90, m / 1000);
  return { ...s, lng, lat };
};

export function buildFalconHeavyDemo(): ReplayEvent {
  const plane = orbitThrough(PAD_39A[0], PAD_39A[1], 0, ORBIT_KM, 28.5, true);
  const secoPos = orbitPositionAt(plane, plane.u0 + BURNOUT_KM / EARTH_RADIUS_KM, T.seco);
  const orbit: CircularOrbit = { ...plane, u0: plane.u0 + BURNOUT_KM / EARTH_RADIUS_KM, t0: T.seco };
  const insertKm = haversine(PAD_39A, secoPos);
  const az = bearing(PAD_39A, secoPos);
  const onTrack = (km: number): LngLat => destination(PAD_39A, az, km);

  const D = curve([[0, 0], [10, 0], [30, 0.4], [68, 5], [100, 20], [150, 60], [187, 115], [260, 330], [350, 780], [430, 1400], [T.seco, insertKm]]);
  const ascentAlt = curve([[0, 0], [10, 0.1], [30, 1.8], [68, 9], [100, 25], [150, 56], [187, 80], [260, 120], [350, 190], [430, 250], [T.seco, ORBIT_KM]]);
  const ascentPitch = curve([[0, 90], [10, 90], [30, 85], [68, 74], [100, 60], [150, 44], [187, 36], [260, 22], [350, 12], [430, 6], [T.seco, 0]]);
  const speedOf = (dist: (t: number) => number, alt: (t: number) => number, t: number) => 1000 * Math.hypot(dist(t + 0.5) - dist(t - 0.5), alt(t + 0.5) - alt(t - 0.5));
  const ascentPos = (t: number) => onTrack(D(Math.max(0, t)));
  const ascentHeading = (t: number) => bearing(ascentPos(t), ascentPos(t + 1));

  // ---- the stack and the cores -------------------------------------------------------------------------------------------
  const stack = (t: number): ActorSample => {
    const [lng, lat] = ascentPos(t);
    return { lng, lat, altM: ascentAlt(t) * 1000 + 20, speedMs: speedOf(D, ascentAlt, t), heading: t < 5 ? az : ascentHeading(t), pitch: ascentPitch(t), burn: false, plasma: 0 };
  };
  const coreEngines = (t: number): number[] => {
    if (t < 0) return [0, 0];
    if (t <= T.coreMeco) return [1, 8];
    if (within(t, T.coreEntry)) return [1, 2];
    if (within(t, T.coreLanding)) return [1, 0];
    return [0, 0];
  };
  const sideEngines = (t: number): number[] => {
    if (t < 0) return [0, 0];
    if (t <= T.sideMeco) return [1, 8];
    if (within(t, T.boostback) || within(t, T.entryBurn)) return [1, 2];
    if (t >= T.landingBurn && t <= T.landSide) return [1, 0];
    return [0, 0];
  };
  const upperEngines = (t: number): number[] => (within(t, [T.upperIgnition, T.seco]) ? [1] : [0]);

  // centre core: up with the stack, then a ballistic arc down to the drone ship ~600 km out
  const coreDown = curve([[T.coreSep, D(T.coreSep)], [260, 260], [350, 440], [430, 545], [500, 592], [T.coreImpact, 600]]);
  const coreAlt = curve([[T.coreSep, 80], [230, 115], [270, 132], [330, 125], [400, 85], [450, 48], [490, 12], [515, 2.5], [T.coreImpact, 0.02]]);
  const corePitch = curve([[T.coreSep, 36], [200, 14], [225, 8], [330, 70], [450, 88], [T.coreImpact, 90]]);
  const core = (t: number): ActorSample => {
    if (t < T.coreSep) return { ...stack(t), burn: lit(coreEngines(t)), engines: coreEngines(t) };
    const tt = Math.min(t, T.coreImpact);
    const [lng, lat] = onTrack(coreDown(tt));
    return {
      lng, lat, altM: coreAlt(tt) * 1000, speedMs: t >= T.coreImpact ? 0 : speedOf(coreDown, coreAlt, tt),
      heading: lerpHeading(az, az + 180, smooth(ramp(t, T.coreSep, T.coreSep + 30))), pitch: corePitch(tt), burn: lit(coreEngines(t)), plasma: 0, engines: coreEngines(t),
    };
  };

  // side boosters: up beside the core, apart at T+2:33, back over the sea to their landing zones
  const sideDown = curve([[T.sideSep, D(T.sideSep)], [T.boostback[0], D(T.boostback[0]) + 4], [T.boostback[1], 70]]);
  const sideAlt = curve([[T.sideSep, 56], [180, 78], [230, 98], [280, 98], [330, 80], [400, 45], [450, 22], [490, 6], [T.landSide, 0.025]]);
  const sidePitch = curve([[T.sideSep, 44], [T.sideSep + 14, 20], [200, 14], [330, 70], [450, 88], [T.landSide, 90]]);
  const sideBack = curve([[T.boostback[1], 0], [300, 0.46], [400, 0.82], [500, 0.97], [T.landSide, 1]]);
  const sideBooster = (dir: 1 | -1, lz: LngLat) => (t: number): ActorSample => {
    if (t < T.sideSep) return aside({ ...stack(t), burn: lit(sideEngines(t)), engines: sideEngines(t) }, dir * 3.9);
    const apart = dir * (3.9 + 1500 * smooth(ramp(t, T.sideSep, T.boostback[1])));
    const out = onTrack(sideDown(Math.min(t, T.boostback[1])));
    const away = destination(out, az + 90, apart / 1000);
    const [lng, lat] = t <= T.boostback[1] ? away : destination(away, bearing(away, lz), haversine(away, lz) * sideBack(t));
    return {
      lng, lat, altM: sideAlt(Math.min(t, T.landSide)) * 1000, speedMs: t >= T.landSide ? 0 : speedOf(sideDown, sideAlt, Math.min(t, T.boostback[1])) * (t <= T.boostback[1] ? 1 : 0.5),
      heading: lerpHeading(az, az + 180, smooth(ramp(t, T.sideSep, T.sideSep + 25))), pitch: sidePitch(Math.min(t, T.landSide)), burn: lit(sideEngines(t)), plasma: 0, engines: sideEngines(t),
    };
  };
  const left = sideBooster(-1, LZ1);
  const right = sideBooster(1, LZ2);

  // upper stage: on top of the centre core, then alone to the parking orbit
  const upper = (t: number): ActorSample => {
    if (t < T.coreSep) return { ...along(stack(t), UPPER_OFFSET), burn: false, engines: upperEngines(t) };
    if (t < T.seco) {
      const [lng, lat] = ascentPos(t);
      return { lng, lat, altM: ascentAlt(t) * 1000, speedMs: speedOf(D, ascentAlt, t), heading: ascentHeading(t), pitch: ascentPitch(t), burn: lit(upperEngines(t)), plasma: 0, engines: upperEngines(t) };
    }
    const [lng, lat] = orbitPosition(orbit, t);
    const [lng2, lat2] = orbitPosition(orbit, t + 1);
    return { lng, lat, altM: ORBIT_KM * 1000, speedMs: 1000 * orbitalSpeed(EARTH_RADIUS_EQ_KM + ORBIT_KM), heading: bearing([lng, lat], [lng2, lat2]), pitch: 0, burn: false, plasma: 0, engines: [0] };
  };

  const actors: Actor[] = [
    { id: 'core', kind: 'booster', model: 'falcon-core', lengthM: CORE_LEN, radiusM: 1.83, label: 'Mittlere Kernstufe', engines: CORE_ENGINES, from: T.start, to: T.coreImpact + 25, at: (t) => (t < T.start || t > T.coreImpact + 25 ? null : core(t)) },
    { id: 'left', kind: 'booster', model: 'falcon-side', lengthM: SIDE_LEN, radiusM: 1.83, label: 'Seitenbooster links', engines: { ...CORE_ENGINES, title: 'Seitenbooster' }, from: T.start, to: T.landSide + 40, at: (t) => (t < T.start || t > T.landSide + 40 ? null : left(t)) },
    { id: 'right', kind: 'booster', model: 'falcon-side', lengthM: SIDE_LEN, radiusM: 1.83, label: 'Seitenbooster rechts', engines: { ...CORE_ENGINES, title: 'Seitenbooster' }, from: T.start, to: T.landSide + 40, at: (t) => (t < T.start || t > T.landSide + 40 ? null : right(t)) },
    { id: 'upper', kind: 'ship', model: 'falcon-upper', lengthM: UPPER_LEN, radiusM: 1.4, label: 'Obere Stufe mit Roadster', engines: UPPER_ENGINES, from: T.start, to: T.end, at: (t) => (t < T.start || t > T.end ? null : upper(t)) },
  ];

  const sh = (target: string, distM: number, bearingRel: number, pitch: number, extra: Partial<Shot> = {}): Shot => ({ target, distM, bearingRel, pitch, ...extra });
  const phases: Phase[] = [
    { id: 'countdown', label: 'Countdown', info: 'Drei Kernstufen mit 27 Merlin-Triebwerken stehen auf Startplatz 39A im Kennedy Space Center.', from: T.start, to: 0, speed: 1, shot: sh('core', 420, 150, 82) },
    { id: 'ascent', label: 'Aufstieg', info: '27 Triebwerke heben ab; Max-Q nach 68 s, die Seitenbooster brennen bis T+2:30.', from: 0, to: T.sideMeco, speed: 1, shot: sh('core', 700, 135, 76) },
    { id: 'side-sep', label: 'Seitenbooster trennen sich', info: 'Die beiden Seitenbooster trennen sich, die mittlere Kernstufe läuft weiter.', from: T.sideMeco, to: 200, speed: 1, shot: sh('core', 1500, 120, 80, { also: 'left' }) },
    { id: 'stage-sep', label: 'Stufentrennung', info: 'Die mittlere Kernstufe wird abgetrennt, die obere Stufe zündet.', from: 200, to: 260, speed: 1, shot: sh('upper', 2500, 150, 76, { also: 'core' }) },
    { id: 'return', label: 'Rückkehr der Seitenbooster', info: 'Boostback und Eintrittsbrennen: beide Seitenbooster kehren zur Landezone zurück.', from: 260, to: 450, speed: 3, shot: sh('left', 6000, 150, 70, { also: 'right' }) },
    { id: 'landing-burn', label: 'Landebrennen', info: 'Die Seitenbooster zünden zur Landung, die mittlere Kernstufe fällt Richtung Landeschiff.', from: 450, to: 520, speed: 1, shot: sh('left', 600, 150, 80, { also: 'right' }) },
    { id: 'double-landing', label: 'Doppellandung', info: 'Beide Seitenbooster setzen fast gleichzeitig auf Landezone 1 und 2 auf.', from: 520, to: 532, speed: 1, shot: sh('left', 700, 150, 80, { also: 'right' }) },
    { id: 'core-miss', label: 'Kernstufe verfehlt das Schiff', info: 'Nur ein Triebwerk zündet: die Kernstufe schlägt mit rund 480 km/h neben dem Landeschiff ein.', from: 532, to: 560, speed: 1, shot: sh('core', 250, 150, 80) },
    { id: 'orbit', label: 'Parkbahn', info: 'Die obere Stufe erreicht eine Umlaufbahn in etwa 300 km Höhe, mit dem Roadster an Bord.', from: 560, to: T.end, speed: 30, shot: sh('upper', 900_000, 160, 55, { globe: true }) },
  ];

  return {
    id: 'falcon-heavy-demo', title: 'Falcon Heavy Demoflug', subtitle: 'Drei Kerne, zwei Landungen und ein Roadster im All', t0: Date.UTC(2018, 1, 6, 20, 45, 0),
    start: T.start, end: T.end, pad: PAD_39A, actors, phases,
    markers: [
      { t: 0, label: 'Start' }, { t: T.maxQ, label: 'Max-Q' }, { t: T.sideSep, label: 'Seitenbooster getrennt' }, { t: T.coreSep, label: 'Stufentrennung' },
      { t: T.seco, label: 'Parkbahn' }, { t: T.landSide, label: 'Doppellandung' }, { t: T.coreImpact, label: 'Kernstufe verfehlt' },
    ].sort((a, b) => a.t - b.t),
    links: [{ label: 'SpaceX: Falcon Heavy', url: 'https://www.spacex.com/vehicles/falcon-heavy/', kind: 'official' }],
    summary: 'Der erste Flug der Falcon Heavy, damals die stärkste Rakete der Welt. Die beiden Seitenbooster landen nach 8 min 45 s fast gleichzeitig bei Cape Canaveral, die mittlere Kernstufe verfehlt das Landeschiff. Die obere Stufe bringt Elon Musks Tesla Roadster auf den Weg Richtung Mars-Bahn.',
    facts: [
      { label: 'Dauer', value: '18 min (gezeigt)', emphasis: true },
      { label: 'Ergebnis', value: 'Seitenbooster gelandet, Kernstufe verloren', emphasis: true },
      { label: 'Start', value: 'Di 6. Feb. 2018, 20:45 UTC (15:45 Ortszeit)' },
      { label: 'Fahrzeug', value: 'Falcon Heavy (3 Kernstufen, 27 Merlin)' },
      { label: 'Startplatz', value: 'Kennedy Space Center, Startplatz 39A' },
      { label: 'Nutzlast', value: 'Tesla Roadster mit „Starman“' },
    ],
    note: 'Start, Trennungen, Landungen und Ergebnis stammen aus dem veröffentlichten Ablauf. Es gibt keine öffentliche Telemetrie: Positionen, Höhen und Geschwindigkeiten dazwischen sind modelliert, die Parkbahn als Kreis. Die späteren Zündungen der oberen Stufe und der Flug des Roadsters sind nicht gezeigt.',
    sources: [
      { name: 'Wikipedia: Falcon Heavy test flight', url: 'https://en.wikipedia.org/wiki/Falcon_Heavy_test_flight' },
      { name: 'SpaceX: Falcon Heavy', url: 'https://www.spacex.com/vehicles/falcon-heavy/' },
    ],
  };
}
