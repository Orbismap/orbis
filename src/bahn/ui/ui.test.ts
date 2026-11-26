import { validateStyleMin, type StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import type { Call, Journey, Leg, Time } from '../data/types';
import { journeyMap, legIndex, stopOfCall, tripMap } from './mapData';
import { LAYERS, SOURCES, TAP_LAYERS, routeFeatures, stopFeatures } from './mapLayers';
import { bahnStyle } from './mapStyle';
import { sheetTops, snap, tapped } from './sheetState';

const at: Time = { planned: 0, actual: 0, delayMin: null };
const call = (name: string, lng: number, stopId = name): Call => ({ name, stopId, lat: 53, lng, time: at });
const leg = (mode: Leg['mode'], from: Call, to: Call, via: Call[] = [], path?: [number, number][]): Leg =>
  ({ mode, line: 'X', headsign: '', from, to, via, cancelled: false, ...(path ? { path } : {}) });
const journey = (legs: Leg[]): Journey => ({ departure: at, arrival: at, transfers: legs.length - 1, legs });
const color = (m: string) => `#${m}`;

const walk = leg('fuss', call('Start', 11), call('A', 11.1));
const bus = leg('bus', call('A', 11.1), call('B', 11.3), [call('V', 11.2)], [[11.1, 53], [11.15, 53.01], [11.3, 53]]);
const train = leg('regio', call('B', 11.3), call('Ziel', 11.5));
const j = journey([walk, bus, train]);

describe('Karte einer Verbindung', () => {
  it('zeichnet den echten Verlauf, sonst gerade Linien, Fußwege gestrichelt', () => {
    const { routes } = journeyMap(j, color);
    expect(routes.map((r) => [r.id, r.dashed, r.coords.length])).toEqual([['leg-0', true, 2], ['leg-1', false, 3], ['leg-2', false, 2]]);
    expect(legIndex('leg-2')).toBe(2);
  });

  it('kennzeichnet Start, Umstiege, Zwischenhalte und Ziel', () => {
    expect(journeyMap(j, color).stops.map((s) => `${s.stop.name}:${s.kind}`)).toEqual(['V:via', 'A:transfer', 'B:transfer', 'B:transfer', 'Start:start', 'Ziel:end']);
  });

  it('hebt einen Abschnitt hervor und passt die Karte auf ihn ein', () => {
    const m = journeyMap(j, color, 2);
    expect(m.routes.map((r) => !!r.dim)).toEqual([true, true, false]);
    expect(m.fit).toEqual([[11.3, 53], [11.5, 53]]);
    expect(m.stops.some((s) => s.kind === 'via')).toBe(false);
  });

  it('zeigt im Linienlauf die Haltestelle, von der man kommt', () => {
    expect(tripMap(bus, color, 'V').stops.map((s) => s.kind)).toEqual(['start', 'selected', 'end']);
  });

  it('ersetzt eine fehlende Haltestellen-ID durch die Koordinaten', () => {
    expect(stopOfCall({ name: 'x', lat: 53, lng: 11, time: at })?.id).toBe('53.00000,11.00000');
    expect(stopOfCall({ name: 'x', time: at })).toBeNull();
  });
});

describe('Kartenebenen', () => {
  it('sind mit dem Grundstil ein gültiger Stil, alle antippbaren gibt es', () => {
    const { routes, stops } = journeyMap(j, () => '#ff0000', 1);
    const data = { routes: routeFeatures(routes), stops: stopFeatures(stops), nearby: stopFeatures([]) };
    const style: StyleSpecification = {
      ...bahnStyle,
      sources: { ...bahnStyle.sources, ...Object.fromEntries(SOURCES.map((id) => [id, { type: 'geojson' as const, data: data[id] }])) },
      layers: [...bahnStyle.layers, ...LAYERS],
    };
    expect(validateStyleMin(style).map((e) => e.message)).toEqual([]);
    for (const id of TAP_LAYERS) expect(style.layers.some((l) => l.id === id), id).toBe(true);
  });
});

describe('Blatt', () => {
  const tops = sheetTops(800);
  it('hat drei Rasten von oben nach unten', () => {
    expect(tops.full).toBeLessThan(tops.half);
    expect(tops.half).toBeLessThan(tops.peek);
  });

  it('rastet ohne Wisch an der nächsten Rast ein', () => {
    expect(snap(tops.half + 20, 0, tops)).toBe('half');
    expect(snap(40, 0.1, tops)).toBe('full');
    expect(snap(700, 0, tops)).toBe('peek');
  });

  it('folgt einem Wisch zur nächsten Rast in seine Richtung', () => {
    expect(snap(tops.half - 20, -1, tops)).toBe('full');
    expect(snap(tops.half + 20, 1, tops)).toBe('peek');
    expect(snap(tops.peek - 20, -1, tops)).toBe('half');
    expect(snap(tops.full + 20, 1, tops)).toBe('half');
    expect(snap(tops.full, -1, tops)).toBe('full');
    expect(snap(tops.peek, 1, tops)).toBe('peek');
  });

  it('wechselt beim Tipp auf den Griff', () => {
    expect([tapped('peek'), tapped('half'), tapped('full')]).toEqual(['half', 'full', 'half']);
  });
});
