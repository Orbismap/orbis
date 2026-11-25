// Generator for the sub-orbital Starship test flights (1 to 5, Starbase, 2023–2024): the same ascent, hot staging and booster return
// every time, with a different ending each (a flight termination, a lost booster, a ship that burns up, a splashdown, a tower catch).
// A flight is a `TestFlight` (what happened when); this file turns it into a `ReplayEvent`.
//
// Real: the dates, T-0, the times of staging, engine cut-off, entry and the end, the outcome. Modelled: every position, height and
// speed in between (a Falcon-9-class ascent, then an arc almost once round the Earth in the plane that the pad's eastward launch gives:
// the ship passes the Florida Strait, the Atlantic, Africa and the Indian Ocean and comes down off Western Australia).
import { bearing, destination, EARTH_RADIUS_KM, haversine, type LngLat } from '../../core/geo';
import { curve, lerpHeading, ramp } from '../curve';
import { orbitPositionAt, orbitThrough } from '../orbit';
import type { Actor, ActorSample, EngineLayout, EventLink, Phase, ReplayEvent, Shot, Tower } from '../types';

import { PAD_A } from './pad';

/** What the booster does after staging. */
export type BoosterFate = 'with-ship' | 'explodes' | 'lost' | 'splash' | 'catch';
/** What the ship does. */
export type ShipFate = 'terminated' | 'lost-in-entry' | 'splash';

export interface TestFlight {
  id: string;
  title: string;
  subtitle: string;
  /** T-0 in ms since epoch (UTC) */
  t0: number;
  summary: string;
  /** result, one short line */
  result: string;
  vehicles: string;
  note: string;
  badges: string[];
  /** the stages part ways (s); without one (flight 1) the stack stays together until `end` */
  sep: number | null;
  /** booster main engine cut-off (s) */
  meco: number;
  /** boostback burn (s) */
  boostback: [number, number];
  booster: { fate: BoosterFate; end: number };
  /** ship main engine cut-off (s) and the end of the ship's flight; `fate` says how it ends */
  ship: { seco: number; end: number; fate: ShipFate; apogeeKm: number; apogeeT: number; entry: number };
  /** the ship's last height in km when it ends before the entry (flight 1, 2) */
  endAltKm: number;
  /** extra ground distance flown by the end of the ascent, km (ship), so it is fixed by what the flight really reached */
  burnoutKm: number;
  /** a tower with catch arms (flight 5: the booster is caught) */
  tower: boolean;
  links: EventLink[];
  sources: { name: string; url: string }[];
}

export const BOOSTER_ENGINES: EngineLayout = { title: 'Booster', groups: [{ label: 'Mitte', total: 3 }, { label: 'Innen', total: 10 }, { label: 'Außen', total: 20 }] };
export const SHIP_ENGINES: EngineLayout = { title: 'Ship', groups: [{ label: 'Meeresspiegel', total: 3 }, { label: 'Vakuum', total: 3 }] };

const smooth = (x: number) => x * x * (3 - 2 * x);
const within = (t: number, ...w: [number, number][]) => w.some(([a, b]) => t >= a && t <= b);
const lit = (e: number[]) => e.some((n) => n > 0);
const STACK_OFFSET_M = 61;
const START = -60;
const ENTRY_S = 1140;

/** How fast the ship moves along its plane in the coast (km/s of arc): tuned, together with the plane, so that flights 4 and 5 come down off Western Australia (the speed shown is the real ~7.5 km/s). */
export const COAST_KM_S = 8.2;

function along(s: ActorSample, m: number): ActorSample {
  const p = (s.pitch * Math.PI) / 180;
  const [lng, lat] = destination([s.lng, s.lat], s.heading, (m * Math.cos(p)) / 1000);
  return { ...s, lng, lat, altM: s.altM + m * Math.sin(p) };
}

export function buildTestFlight(f: TestFlight, coastKmS = COAST_KM_S): ReplayEvent {
  const { sep, meco, boostback, booster: bf, ship: sf } = f;
  const stackEnd = sep === null ? f.ship.end : sep;
  const hasCoast = sf.end > sf.seco + 30;

  // The plane: through the pad at T-0, an eastward launch (inclination a little above the pad's latitude)
  const plane = orbitThrough(PAD_A[0], PAD_A[1], 0, 250, 26.5, true);
  // arc flown on the ground until engine cut-off, km; the great circle from the pad ends where the plane is at that moment
  const arcAt = (km: number, t: number) => orbitPositionAt(plane, plane.u0 + km / EARTH_RADIUS_KM, t);
  const secoPos = arcAt(f.burnoutKm, sf.seco);
  const az = bearing(PAD_A, secoPos);
  const insertKm = haversine(PAD_A, secoPos);
  const onTrack = (km: number): LngLat => destination(PAD_A, az, km);

  // ---- ship ----------------------------------------------------------------------------------------------------------------
  // flight 1 never got fast: it lost engines from the start and reached only about 39 km
  const weak = f.id === 'starship-flight-1';
  const before = (keys: [number, number][], last: number): [number, number][] => [...keys.filter(([t]) => t < sf.seco - 1), [sf.seco, last]];
  const kmKeys = before(weak ? [[0, 0], [10, 0], [30, 0.4], [62, 2.2], [100, 7], [150, 15], [200, 24]] : [[0, 0], [10, 0], [30, 0.5], [62, 3.5], [100, 17], [135, 40], [162, 62], ...(([[220, 170], [300, 440], [400, 880], [470, 1380]]) as [number, number][]).map(([t, km]): [number, number] => [162 + (t - 162) * ((sf.seco - 162) / 368), 62 + (km - 62) * ((insertKm - 62) / 1858)])], insertKm);
  const altKeys = before(weak ? [[0, 0], [10, 0.15], [30, 2], [62, 8], [100, 18], [140, 28], [180, 35], [225, 39]] : [[0, 0], [10, 0.15], [30, 2.5], [62, 12], [100, 35], [135, 56], [162, 68], [220, 100], [300, 124], [400, 142]], weak ? 38 : 150);
  const pitchKeys = before(weak ? [[0, 90], [10, 90], [30, 86], [62, 80], [100, 74], [140, 68]] : [[0, 90], [10, 90], [30, 86], [62, 78], [100, 64], [135, 50], [162, 42], [220, 30], [300, 18], [400, 9]], weak ? 60 : 3);
  const D = curve(kmKeys);
  const shipAscentAlt = curve(altKeys);
  const shipPitch = curve(pitchKeys);
  const ascentPos = (t: number) => onTrack(D(Math.max(0, t)));
  const ascentHeading = (t: number) => bearing(ascentPos(t), ascentPos(t + 1));
  const ascentSpeed = (dist: (t: number) => number, alt: (t: number) => number, t: number) => 1000 * Math.hypot(dist(t + 0.5) - dist(t - 0.5), alt(t + 0.5) - alt(t - 0.5));

  // coast: height (km) and arc
  const apT = sf.apogeeT;
  const coastAlt = curve([[sf.seco, 150], [sf.seco + 500, 150 + (sf.apogeeKm - 150) * 0.72], [apT, sf.apogeeKm], [(apT + sf.entry) / 2, (sf.apogeeKm + 100) / 2 + 12], [sf.entry, 100]]);
  const entryAlt = curve([[0, 100], [0.09, 85], [0.22, 70], [0.36, 62], [0.54, 50], [0.675, 38], [0.787, 25], [0.9, 14], [0.967, 6], [0.995, 1.6], [1, 0.03]].map(([a, b]) => [a! * ENTRY_S, b!] as [number, number]));
  const entrySpeed = curve([[0, 7.6], [0.09, 7.5], [0.22, 6.9], [0.36, 5.6], [0.54, 3.4], [0.675, 1.8], [0.787, 0.9], [0.9, 0.35], [0.967, 0.2], [1, 0.06]].map(([a, b]) => [a! * ENTRY_S, b!] as [number, number]));
  const flipAt = ENTRY_S - 28;
  const entryPitch = curve([[0, 0], [0.03, 58], [0.45, 55], [0.75, 35], [0.9, 15], [0.967, 0]].map(([a, b]) => [a! * ENTRY_S, b!] as [number, number]).concat([[flipAt - 6, 0], [flipAt + 8, 85], [ENTRY_S, 90]]));
  /** arc (km) flown since engine cut-off, from the speed profile: the coast speed, then the entry deceleration */
  const arcSince = (() => {
    const last = Math.ceil(sf.end) - sf.seco;
    const cum = [0];
    for (let s = 1; s <= last; s++) {
      const t = sf.seco + s - 0.5;
      const v = t < sf.entry ? coastKmS : entrySpeed(t - sf.entry);
      cum.push(cum[s - 1]! + v);
    }
    return (t: number) => {
      const c = Math.min(Math.max(t - sf.seco, 0), last);
      const i = Math.floor(c);
      return cum[i]! + (i < last ? (cum[i + 1]! - cum[i]!) * (c - i) : 0);
    };
  })();
  const coastPos = (t: number): LngLat => arcAt(f.burnoutKm + arcSince(t), t);
  const coastHeading = (t: number) => bearing(coastPos(t), coastPos(t + 1));

  const boosterEngines = (t: number): number[] => {
    if (t < 0) return [0, 0, 0];
    const full: number[] = f.id === 'starship-flight-1' ? [3, 8, 16] : [3, 10, 20];
    if (t < 110) return full;
    if (t < 120) return [full[0]!, full[1]!, Math.round(full[2]! * (1 - ramp(t, 110, 120)))];
    if (t <= meco) return [full[0]!, full[1]!, 0];
    if (t >= boostback[0] && t <= boostback[1]) return [3, 10, 0];
    // landing burn: the middle engines, then 3 more (13 relight, 3 hold the last metres): modelled
    if (bf.fate === 'splash' || bf.fate === 'catch' || bf.fate === 'lost') {
      const lb = bf.end - 28;
      if (t >= lb && t <= bf.end) return [3, bf.fate === 'lost' ? 0 : 0, 0];
    }
    return [0, 0, 0];
  };
  const shipEngines = (t: number): number[] => {
    if (within(t, [(sep ?? stackEnd) - 3, sf.fate === 'terminated' ? sf.end : sf.seco])) return [3, 3];
    if (sf.fate === 'splash' && within(t, [sf.end - 16, sf.end])) return [3, 0];
    return [0, 0];
  };

  // ---- booster ---------------------------------------------------------------------------------------------------------------
  const bEnd = bf.end;
  /** keys that fall before the end of the booster's flight, closed with its last value (a short flight, like the exploded booster of flight 2, drops the later keys) */
  const upTo = (keys: [number, number][], last: number): [number, number][] => [...keys.filter(([t]) => t >= (sep ?? 0) && t < bEnd - 1).sort((x, y) => x[0] - y[0]), [bEnd, last]];
  const s0 = sep ?? 0;
  const boosterDown = curve(upTo([[s0, D(s0)], [boostback[0], D(boostback[0]) + 6], [boostback[1], 72], [boostback[1] + 70, 66], [bEnd - 90, bf.fate === 'catch' ? 18 : 30]], bf.fate === 'catch' ? 0 : bf.fate === 'explodes' ? D(s0) + 9 : 26));
  const boosterAlt = curve(upTo([[s0, 68], [boostback[0] + 20, 86], [boostback[1] + 30, 97], [boostback[1] + 90, 97], [bEnd - 110, 66], [bEnd - 60, 22], [bEnd - 28, 4.2]], bf.fate === 'catch' ? 0.043 : bf.fate === 'lost' ? 0.46 : bf.fate === 'explodes' ? 74 : 0));
  const boosterPitch = curve(upTo([[s0, 42], [s0 + 14, 22], [boostback[0] + 14, 12], [boostback[1] + 40, 18], [bEnd - 110, 64], [bEnd - 40, 88]], bf.fate === 'explodes' ? 5 : 90));

  const boosterAscent = (t: number): ActorSample => {
    const [lng, lat] = ascentPos(t);
    const tumble = f.id === 'starship-flight-1' ? ramp(t, 140, f.ship.end) : 0;
    const pitch = shipPitch(t) - tumble * 260;
    const heading = (t < 5 ? az : ascentHeading(t)) + tumble * 90;
    return { lng, lat, altM: shipAscentAlt(t) * 1000 + 35, speedMs: ascentSpeed(D, shipAscentAlt, t), heading, pitch, burn: lit(boosterEngines(t)), plasma: 0, engines: boosterEngines(t) };
  };

  const booster = (t: number): ActorSample => {
    if (sep === null || t < sep) return boosterAscent(t);
    const tt = Math.min(t, bEnd);
    const [lng, lat] = onTrack(boosterDown(tt));
    const turn = smooth(ramp(t, sep, sep + 19));
    return {
      lng, lat, altM: boosterAlt(tt) * 1000, speedMs: t >= bEnd ? 0 : ascentSpeed(boosterDown, boosterAlt, tt),
      heading: lerpHeading(az, az + 180, turn), pitch: boosterPitch(tt), burn: lit(boosterEngines(t)), plasma: 0, engines: boosterEngines(t),
    };
  };

  const ship = (t: number): ActorSample => {
    if (sep === null || t < sep) {
      const e = shipEngines(t);
      return { ...along(boosterAscent(t), STACK_OFFSET_M), burn: lit(e), engines: e };
    }
    if (t < sf.seco || !hasCoast) {
      const tt = Math.min(t, sf.seco);
      const [lng, lat] = ascentPos(tt);
      return {
        lng, lat, altM: (t < sf.seco ? shipAscentAlt(t) : f.endAltKm) * 1000, speedMs: ascentSpeed(D, shipAscentAlt, tt),
        heading: ascentHeading(tt), pitch: shipPitch(tt), burn: lit(shipEngines(t)), plasma: 0, engines: shipEngines(t),
      };
    }
    const [lng, lat] = coastPos(t);
    if (t < sf.entry) {
      return { lng, lat, altM: coastAlt(t) * 1000, speedMs: 7500, heading: coastHeading(t), pitch: 0, burn: false, plasma: 0, engines: [0, 0] };
    }
    const u = t - sf.entry;
    const e = shipEngines(t);
    return {
      lng, lat, altM: entryAlt(u) * 1000, speedMs: 1000 * entrySpeed(u), heading: coastHeading(t), pitch: sf.fate === 'splash' ? entryPitch(u) : entryPitch(Math.min(u, 700)),
      burn: lit(e), plasma: ramp(u, 40, 250) * (1 - ramp(u, 600, 950)), engines: e,
    };
  };

  const actors: Actor[] = [
    { id: 'booster', kind: 'booster', label: 'Super Heavy', engines: { ...BOOSTER_ENGINES, title: 'Super Heavy' }, from: START, to: bf.fate === 'with-ship' ? f.ship.end : bEnd + (bf.fate === 'splash' || bf.fate === 'catch' ? 30 : 0), at: (t) => (t < START || t > (bf.fate === 'with-ship' ? f.ship.end : bEnd + 30) ? null : booster(t)) },
    { id: 'ship', kind: 'ship', label: 'Starship', engines: { ...SHIP_ENGINES, title: 'Starship' }, from: START, to: sf.end + (sf.fate === 'splash' ? 40 : 0), at: (t) => (t < START || t > sf.end + (sf.fate === 'splash' ? 40 : 0) ? null : ship(t)) },
  ];

  const sh = (target: string, distM: number, bearingRel: number, pitch: number, extra: Partial<Shot> = {}): Shot => ({ target, distM, bearingRel, pitch, ...extra });
  const phases: Phase[] = [];
  const add = (id: string, label: string, info: string, from: number, to: number, speed: number, shot: Shot) => { if (to > from) phases.push({ id, label, info, from, to, speed, shot }); };
  const end = sf.end + (sf.fate === 'splash' ? 40 : 0);
  add('countdown', 'Countdown', 'Super Heavy und Starship stehen auf Startplatz A in Starbase.', START, 0, 1, sh('booster', 420, 150, 82));
  if (sep === null) {
    add('ascent', 'Aufstieg', '33 Raptor-Triebwerke heben den Stapel ab, einige fallen schon beim Start aus.', 0, 140, 1, sh('booster', 900, 135, 76));
    add('tumble', 'Stapel dreht sich', 'Die Stufen trennen sich nicht: der Stapel trudelt.', 140, f.ship.end - 1, 1, sh('ship', 2200, 130, 78, { also: 'booster' }));
    add('abort', 'Selbstzerstörung', 'Die Flugabbruch-Sicherung zerstört das Fahrzeug nach 3 min 59 s in etwa 39 km Höhe.', f.ship.end - 1, f.ship.end + 20, 1, sh('ship', 1500, 130, 78));
  } else {
    add('ascent', 'Aufstieg', '33 Raptor-Triebwerke heben den Stapel ab; Max-Q nach rund einer Minute.', 0, meco, 1, sh('booster', 900, 135, 76));
    add('staging', 'Heißtrennung', 'Das Ship zündet noch am Booster und trennt sich.', meco, sep + 60, 1, sh('ship', 1800, 120, 80, { also: 'booster' }));
    if (bf.fate === 'explodes') {
      add('booster', 'Booster explodiert', 'Der Booster verliert bei der Boostback-Zündung die Kontrolle und explodiert über dem Golf.', sep + 60, bf.end + 15, 1, sh('booster', 1500, 150, 74, { also: 'ship' }));
    } else {
      add('booster', bf.fate === 'catch' ? 'Booster zurück zum Turm' : 'Booster kehrt zurück', bf.fate === 'catch' ? 'Boostback, Landebrennen und der erste Turmfang einer Super-Heavy-Stufe.' : bf.fate === 'lost' ? 'Boostback gelingt, doch bei der Landebrennen-Zündung fallen die Triebwerke aus: der Booster geht im Golf verloren.' : 'Boostback, Landebrennen und eine kontrollierte Wasserung im Golf.', sep + 60, bf.end + 30, 1, sh('booster', bf.fate === 'catch' ? 900 : 5000, 150, bf.fate === 'catch' ? 80 : 72, { also: bf.fate === 'catch' ? undefined : 'ship' }));
    }
    const shipFrom = phases[phases.length - 1]!.to;
    if (sf.fate === 'terminated') {
      add('ship-ascent', 'Ship allein', 'Das Ship beschleunigt allein weiter; die Triebwerke laufen bis kurz vor dem Ende.', shipFrom, sf.end - 1, 1, sh('ship', 2500, 200, 76));
      add('abort', 'Selbstzerstörung', 'Das Fahrzeug wird nach rund 8 Minuten in etwa 148 km Höhe zerstört: der Kontakt war schon abgerissen.', sf.end - 1, sf.end + 20, 1, sh('ship', 2000, 200, 76));
    } else {
      add('ship-ascent', 'Ship allein', 'Das Ship beschleunigt allein auf die Bahn.', shipFrom, sf.seco + 10, 1, sh('ship', 2500, 200, 76));
      add('coast', 'Antriebsloser Flug', 'Triebwerke aus: das Ship fliegt fast einmal um die Erde.', sf.seco + 10, sf.entry - 20, 60, sh('ship', 900_000, 160, 55, { globe: true }));
      if (sf.fate === 'lost-in-entry') {
        add('entry', 'Wiedereintritt', 'Das Ship tritt in die Atmosphäre ein und verliert die Kontrolle: nach rund 49 Minuten reißt der Kontakt ab.', sf.entry - 20, sf.end + 20, 6, sh('ship', 180, 290, 84));
      } else {
        add('entry', 'Wiedereintritt', 'Der Hitzeschild glüht, die Flaps steuern das Ship.', sf.entry - 20, sf.entry + flipAt - 40, 6, sh('ship', 180, 290, 84));
        add('splash', 'Flip und Wasserung', 'Flip, Landebrenne und eine aufrechte Wasserung im Indischen Ozean.', sf.entry + flipAt - 40, end, 1, sh('ship', 260, 55, 86));
      }
    }
  }

  const tower: Tower | undefined = f.tower
    ? { at: destination(PAD_A, 270, 0.016), heightM: 146, armsAltM: 70, armsClose: [bf.end - 38, bf.end - 3], armsHeading: 90 }
    : undefined;

  const markers: { t: number; label: string }[] = [{ t: 0, label: 'Start' }];
  if (sep === null) markers.push({ t: f.ship.end, label: 'Abbruch' });
  else {
    markers.push({ t: sep, label: 'Heißtrennung' });
    markers.push({ t: bf.end, label: bf.fate === 'catch' ? 'Turmfang' : bf.fate === 'splash' ? 'Booster im Golf' : bf.fate === 'lost' ? 'Booster verloren' : 'Booster explodiert' });
    if (hasCoast) markers.push({ t: sf.seco, label: 'Triebwerke aus' }, { t: sf.entry, label: 'Wiedereintritt' });
    markers.push({ t: sf.end, label: sf.fate === 'splash' ? 'Wasserung' : sf.fate === 'lost-in-entry' ? 'Verlust' : 'Abbruch' });
  }
  markers.sort((a, b) => a.t - b.t);

  const dur = (s: number) => `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)} h ` : ''}${Math.floor((s % 3600) / 60)} min`;
  return {
    id: f.id, title: f.title, subtitle: f.subtitle, t0: f.t0, start: START, end,
    pad: PAD_A, actors, tower, phases, markers, links: f.links, summary: f.summary,
    facts: [
      { label: 'Dauer', value: dur(sf.end), emphasis: true },
      { label: 'Ergebnis', value: f.result, emphasis: true },
      { label: 'Start', value: new Date(f.t0).toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC' },
      { label: 'Fahrzeuge', value: f.vehicles },
      { label: 'Startplatz', value: 'Starbase, Texas (Startplatz A)' },
      { label: 'Nutzlast', value: 'keine' },
    ],
    note: f.note,
    sources: f.sources,
  };
}
