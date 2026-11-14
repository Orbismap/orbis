import { describe, expect, it } from 'vitest';
import { autobahnItems } from './autobahn';
import { blitzerdeMarkers } from './blitzerde';
import { amtrakFixes } from './feed-amtraker';
import { ctaFixes } from './feed-cta';
import { digitrafficFixes, finnishKind } from './feed-digitraffic';
import { enturFixes, enturQuery } from './feed-entur';
import { hslKind } from './feed-hsl';
import { mbtaFixes } from './feed-mbta';
import { metroKind } from './feed-metrotransit';
import { septaFixes } from './feed-septa';
import { ttcFixes } from './feed-ttc';
import { gbfsStations } from './gbfs';
import { gtfsRtVehicles } from './gtfsrt';
import { BIKE_SYSTEMS } from './bikesystems';
import { overpassRoutes } from './oepnv';
import { backFromEnd, crossingStyle, laneArrows, leftHandTraffic, overpassRoadmarks } from './roadmark';
import { decodePolyline, pointAt, segmentFixes, transitousTrips } from './transitous';
import { kindOfMode } from './vehicles';

// --- minimal protobuf encoder for the GTFS-RT test message
const varint = (n: number): number[] => { const o: number[] = []; while (n > 127) { o.push((n & 127) | 128); n = Math.floor(n / 128); } o.push(n); return o; };
const field = (f: number, w: number, body: number[]) => [...varint(f * 8 + w), ...body];
const bytes = (f: number, b: number[]) => field(f, 2, [...varint(b.length), ...b]);
const str = (f: number, s: string) => bytes(f, [...new TextEncoder().encode(s)]);
const float = (f: number, v: number) => field(f, 5, [...new Uint8Array(new Float32Array([v]).buffer)]);

describe('gtfsRtVehicles', () => {
  it('decodes position, trip, descriptor and timestamp of a FeedMessage', () => {
    const vehicle = [
      ...bytes(1, [...str(1, 'trip-9'), ...str(5, '901')]),
      ...bytes(2, [...float(1, 44.97), ...float(2, -93.27), ...float(3, 90), ...float(5, 12.5)]),
      ...field(5, 0, varint(1_794_000_000)),
      ...str(7, 'stop-1'),
      ...bytes(8, [...str(1, 'v-1'), ...str(2, '4711')]),
    ];
    const entity = [...str(1, 'e1'), ...bytes(4, vehicle)];
    const noPos = [...str(1, 'e2'), ...bytes(4, bytes(1, str(1, 'x')))];
    const msg = [...bytes(1, [...str(1, '2.0')]), ...bytes(2, entity), ...bytes(2, noPos)];
    const list = gtfsRtVehicles(new Uint8Array(msg));
    expect(list).toHaveLength(1);
    const v = list[0]!;
    expect(v.lat).toBeCloseTo(44.97, 4);
    expect(v.lon).toBeCloseTo(-93.27, 4);
    expect(v.bearing).toBe(90);
    expect(v.speed).toBeCloseTo(12.5, 3);
    expect(v).toMatchObject({ tripId: 'trip-9', routeId: '901', stopId: 'stop-1', id: 'v-1', label: '4711', timestamp: 1_794_000_000 });
    expect(metroKind(v.routeId)).toBe('tram');
  });
  it('returns nothing for an empty message', () => expect(gtfsRtVehicles(new Uint8Array([]))).toEqual([]));
});

describe('Transitous', () => {
  it('decodes polylines', () => {
    // Google's documentation example: (38.5,-120.2), (40.7,-120.95), (43.252,-126.453)
    const xy = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(xy[0]).toBeCloseTo(-120.2, 4);
    expect(xy[1]).toBeCloseTo(38.5, 4);
    expect(xy[4]).toBeCloseTo(-126.453, 4);
  });
  const raw = [
    { trips: [{ tripId: '20261111_09:02_de-DELFI_1', displayName: 'ICE 383' }], mode: 'HIGHSPEED_RAIL', from: { name: 'A' }, to: { name: 'B' }, departure: '2026-11-11T12:00:00Z', arrival: '2026-11-11T12:10:00Z', scheduledDeparture: '2026-11-11T11:58:00Z', realTime: true, polyline: '_p~iF~ps|U_ulLnnqC' },
    { trips: [{ tripId: '20261111_09:02_fi-X_2', displayName: '55' }], mode: 'BUS', from: { name: 'C' }, to: { name: 'D' }, departure: '2026-11-11T12:00:00Z', arrival: '2026-11-11T12:05:00Z', scheduledDeparture: '2026-11-11T12:00:00Z', realTime: false, polyline: '_p~iF~ps|U_ulLnnqC' },
    { trips: [{ tripId: 'x' }], mode: 'TRAM', from: { name: 'E' }, to: { name: 'F' }, departure: 'bad', arrival: 'bad', scheduledDeparture: 'bad', realTime: false, polyline: '' },
  ];
  const segs = transitousTrips(raw);
  it('keeps valid segments with delay from real-time', () => {
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ line: 'ICE 383', delay: 2, mode: 'HIGHSPEED_RAIL' });
    expect(segs[1]!.delay).toBeUndefined();
  });
  it('places vehicles along the polyline and honours skip/want', () => {
    const mid = Date.parse('2026-11-11T12:05:00Z');
    const p = pointAt(segs[0]!, mid);
    expect(p.lat).toBeGreaterThan(38.5);
    expect(p.lat).toBeLessThan(40.7);
    const all = segmentFixes(segs, mid - 60_000, () => true);
    expect(all.map((f) => f.kind).sort()).toEqual(['bus', 'fern']);
    expect(all.find((f) => f.kind === 'fern')!.speed).toBeGreaterThan(50);
    expect(segmentFixes(segs, mid - 60_000, (m) => m === 'BUS', (feed) => feed.startsWith('fi-'))).toHaveLength(0);
    // held at the stop for a short while after arrival, gone later
    expect(segmentFixes(segs, Date.parse('2026-11-11T12:11:00Z'), () => true).map((f) => f.speed)).toEqual([0]);
    expect(segmentFixes(segs, Date.parse('2026-11-11T12:30:00Z'), () => true)).toHaveLength(0);
  });
  it('maps modes to kinds', () => {
    expect([kindOfMode('HIGHSPEED_RAIL'), kindOfMode('REGIONAL_FAST_RAIL'), kindOfMode('SUBURBAN'), kindOfMode('SUBWAY'), kindOfMode('TRAM'), kindOfMode('COACH'), kindOfMode('FERRY'), kindOfMode('OTHER')])
      .toEqual(['fern', 'regio', 'sbahn', 'ubahn', 'tram', 'bus', 'faehre', 'andere']);
  });
});

describe('feed adapters', () => {
  it('MBTA', () => {
    const f = mbtaFixes({
      data: [{ id: 'y3280', attributes: { latitude: 42.349, longitude: -71.152, bearing: 80, label: '3280', speed: null, updated_at: '2026-11-11T12:00:00-05:00' }, relationships: { route: { data: { id: '65' } } } }, { id: 'bad', attributes: { latitude: NaN, longitude: 0 } }],
      included: [{ id: '65', attributes: { short_name: '65', long_name: 'Brighton', type: 3 } }],
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ kind: 'bus', line: '65', heading: 80 });
    expect(f[0]!.speed).toBeUndefined();
  });
  it('SEPTA', () => {
    const f = septaFixes([{ lat: '39.95', lon: '-75.17', trainno: '1056', line: 'Manayunk/Norristown', dest: 'Suburban Sta', SOURCE: 'Cynwyd', late: 6, heading: '', nextstop: 'Gray 30th Street' }]);
    expect(f[0]).toMatchObject({ kind: 'regio', delay: 6, to: 'Suburban Sta', next: 'Gray 30th Street' });
    expect(f[0]!.heading).toBeUndefined();
  });
  it('TTC treats the 500 series as streetcars', () => {
    const f = ttcFixes({ vehicle: [{ routeTag: '504', lat: '43.65', lon: '-79.4', heading: '171', speedKmHr: '27', id: '4000', secsSinceReport: '18' }, { routeTag: '52', lat: '43.7', lon: '-79.5' }] });
    expect(f.map((x) => x.kind)).toEqual(['tram', 'bus']);
    expect(f[0]!.speed).toBeCloseTo(7.5, 1);
  });
  it('Entur', () => {
    const f = enturFixes({ data: { vehicles: [{ mode: 'RAIL', bearing: 107, delay: 104, originName: null, destinationName: 'Moss', vehicleId: '1135', lastUpdated: '2026-11-11T12:44:44Z', line: { publicCode: 'R21', lineName: 'Stabekk-Oslo S-Moss' }, location: { latitude: 59.9, longitude: 10.7 } }] } });
    expect(f[0]).toMatchObject({ kind: 'regio', line: 'R21', to: 'Moss', delay: 2 });
    expect(enturQuery([10.5, 59.8, 10.9, 60])).toContain('minLat: 59.800');
  });
  it('Amtraker uses the next station for the delay', () => {
    const f = amtrakFixes({ '1': [{ routeName: 'Sunset Limited', trainNum: '1', trainID: '1-9', lat: 34.06, lon: -117.65, heading: 'W', velocity: 10, origName: 'New Orleans', destName: 'Los Angeles Union', trainState: 'Active', stations: [{ name: 'Ontario', code: 'ONA', status: 'Enroute', schArr: '2026-11-11T10:00:00-08:00', arr: '2026-11-11T10:20:00-08:00' }] }, { routeName: 'X', trainNum: '2', lat: 0, lon: 0, trainState: 'Predeparture' }] });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ heading: 270, delay: 20, next: 'Ontario', to: 'Los Angeles Union' });
    expect(f[0]!.speed).toBeCloseTo(4.47, 1);
  });
  it('CTA and Digitraffic and HSL', () => {
    const c = ctaFixes({ ctatt: { route: [{ '@name': 'red', train: [{ rn: '815', destNm: 'Howard', nextStaNm: 'Loyola', lat: '41.9', lon: '-87.65', heading: '359', isDly: '1' }] }] } });
    expect(c[0]).toMatchObject({ kind: 'ubahn', line: 'Red Line 815', delay: 1 });
    const d = digitrafficFixes([{ trainNumber: 9345, departureDate: '2026-11-11', timestamp: '2026-11-11T12:00:00Z', speed: 72, location: { coordinates: [24.9, 60.2] } }]);
    expect(d[0]).toMatchObject({ kind: 'sbahn', train: true, trip: '2026-11-11/9345' });
    expect(d[0]!.speed).toBeCloseTo(20, 1);
    expect([finnishKind(27), finnishKind(1500), finnishKind(3300)]).toEqual(['fern', 'regio', 'andere']);
    expect([hslKind('31M1').kind, hslKind('3001').kind, hslKind('1006').kind, hslKind('2550').kind, hslKind('1019').kind]).toEqual(['ubahn', 'sbahn', 'tram', 'bus', 'faehre']);
  });
});

describe('autobahnItems', () => {
  const warning = { warning: [{ identifier: 'W1', title: 'A1 | Bliesheim - Weilerswist-West', subtitle: ' Köln -> Euskirchen', delayTimeValue: '3', abnormalTrafficType: 'QUEUING_TRAFFIC', averageSpeed: '15', startTimestamp: '2026-11-10T10:16:00Z', coordinate: { lat: 50.76, long: 6.82 }, description: ['Beginn: 10.11.26 um 11:16 Uhr', 'Ereignismeldung:', '- Im Stillstand'], geometry: { type: 'LineString', coordinates: [[6.82, 50.76], [6.81, 50.75]] } }, { identifier: 'W2', title: 'A1 | Foo', coordinate: { lat: 50.1, long: 6.1 }, description: [] }] };
  it('classifies jams and other reports and measures the stretch', () => {
    const r = autobahnItems(warning, 'warning', 'A1');
    expect(r.points.map((p) => p.properties.kind)).toEqual(['jam', 'warning']);
    expect(r.points[0]!.properties).toMatchObject({ sev: 2, delay: 3, kmh: 15, title: 'Bliesheim - Weilerswist-West', road: 'A1' });
    expect(r.points[0]!.properties.km).toBeGreaterThan(1);
    expect(r.lines).toHaveLength(1);
  });
  it('reads closures and the end of roadworks', () => {
    const r = autobahnItems({ roadworks: [{ identifier: 'R1', title: 'A3 | X - Y', future: true, isBlocked: 'false', coordinate: { lat: 48.4, long: 13.4 }, description: ['Zeitraum', 'Ende: 19.12.26 um 00:00 Uhr'] }] }, 'roadworks');
    expect(r.points[0]!.properties).toMatchObject({ kind: 'roadworks', future: true, end: '19.12.26 um 00:00 Uhr', road: 'A3' });
    expect(autobahnItems({ closure: [{ identifier: 'C', isBlocked: 'true', coordinate: { lat: 1, long: 2 } }] }, 'closure').points[0]!.properties.sev).toBe(3);
    expect(autobahnItems(null, 'warning').points).toEqual([]);
  });
});

describe('Overpass parsers', () => {
  it('routes and stops', () => {
    const r = overpassRoutes({ elements: [
      { type: 'relation', id: 5, tags: { route: 'tram', ref: '12', name: 'Tram 12', colour: '#ff0000', from: 'A', to: 'B', operator: 'BVG' }, members: [{ type: 'way', role: '', geometry: [{ lat: 52.5, lon: 13.4 }, { lat: 52.51, lon: 13.41 }] }, { type: 'way', role: 'platform', geometry: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }] }] },
      { type: 'relation', id: 6, tags: { route: 'bus' }, members: [] },
      { type: 'node', id: 9, lat: 52.5, lon: 13.4, tags: { name: 'Hbf' } }, { type: 'node', id: 10, lat: 52.5001, lon: 13.4001, tags: { name: 'Hbf' } },
    ] });
    expect(r.lines.features).toHaveLength(1);
    expect(r.lines.features[0]!.properties).toMatchObject({ ref: '12', color: '#ff0000', modeLabel: 'Tram' });
    expect(r.lines.features[0]!.geometry.coordinates).toHaveLength(1);
    expect(r.stops.features).toHaveLength(1);
  });
  it('road markings', () => {
    const g = [{ lat: 52, lon: 13 }, { lat: 52.001, lon: 13 }, { lat: 52.001, lon: 13.001 }, { lat: 52, lon: 13 }];
    const r = overpassRoadmarks({ elements: [
      { type: 'way', id: 1, tags: { crossing: 'zebra' }, geometry: g.slice(0, 2) },
      { type: 'way', id: 2, tags: { crossing: 'lines' }, geometry: g.slice(0, 2) },
      { type: 'way', id: 3, tags: { road_marking: 'solid_line', 'road_marking:stroke': 'dashed' }, geometry: g.slice(0, 2) },
      { type: 'way', id: 4, tags: { highway: 'secondary', overtaking: 'no' }, geometry: g.slice(0, 2) },
      { type: 'way', id: 5, tags: { traffic_island: 'yes' }, geometry: g },
      { type: 'way', id: 6, tags: { crossing: 'zebra' } },
    ] });
    expect(r.features.map((f) => f.properties.kind)).toEqual(['zebra', 'cross', 'marking', 'over', 'island']);
    expect(r.features[2]!.properties.dash).toBe(true);
    expect(r.features[4]!.geometry.type).toBe('Polygon');
  });
});

describe('road markings from road tags', () => {
  // a north-south street of ~220 m with a signal at its end node
  const way = (id: number, tags: Record<string, string>, nodes: number[], lons = 13): object => ({ type: 'way', id, tags: { highway: 'secondary', ...tags }, nodes, geometry: nodes.map((_, i) => ({ lat: 52 + i * 0.001, lon: lons })) });
  it('parses turn lanes per lane', () => {
    expect(laneArrows('left|through;right||')).toEqual(['l', 'sr', 's', 's']);
    expect(laneArrows('left;through;right|reverse')).toEqual(['lsr', '']);
    expect(laneArrows(undefined)).toEqual([]);
  });
  it('puts turn arrows into the right lanes, right of the centreline in right-hand traffic', () => {
    const r = overpassRoadmarks({ elements: [way(1, { 'turn:lanes:forward': 'left|through', 'lanes:forward': '2', 'lanes:backward': '1' }, [1, 2, 3])] });
    const a = r.features.filter((f) => f.properties.kind === 'arrow');
    expect(a.map((f) => f.properties.icon)).toEqual(['l', 's']);
    expect(a[0]!.properties.rot).toBe(0);
    const [x0, x1] = a.map((f) => (f.geometry as GeoJSON.Point).coordinates[0]!);
    expect(x0!).toBeGreaterThan(13); // east of the road = right of northbound travel
    expect(x1!).toBeGreaterThan(x0!);
  });
  it('mirrors lanes in left-hand traffic', () => {
    const r = overpassRoadmarks({ elements: [{ ...(way(1, { 'turn:lanes:forward': 'through', 'lanes:forward': '1', 'lanes:backward': '1' }, [1, 2, 3], -0.1) as object) }] });
    const a = r.features.find((f) => f.properties.kind === 'arrow')!;
    expect((a.geometry as GeoJSON.Point).coordinates[0]!).toBeLessThan(-0.1);
  });
  it('derives surface, dividers and centre of a four-lane road', () => {
    const r = overpassRoadmarks({ elements: [way(2, { lanes: '4' }, [1, 2])] });
    const k = r.features.map((f) => f.properties.kind);
    expect(k.filter((x) => x === 'surf')).toHaveLength(1);
    expect(k).not.toContain('edge');
    expect(k.filter((x) => x === 'centre')).toHaveLength(1);
    expect(k.filter((x) => x === 'lane')).toHaveLength(2);
    expect(r.features.find((f) => f.properties.kind === 'surf')!.properties.w).toBeCloseTo(13.4);
  });
  it('draws no multi-lane surface for ordinary two-lane roads', () => {
    expect(overpassRoadmarks({ elements: [way(3, { lanes: '2' }, [1, 2])] }).features).toHaveLength(0);
  });
  it('adds a stop line before a signal at the end of a road, only for the allowed direction', () => {
    const els = [way(4, {}, [1, 2, 3]), { type: 'node', id: 3, lat: 52.002, lon: 13, tags: { highway: 'traffic_signals' } }];
    const r = overpassRoadmarks({ elements: els });
    const s = r.features.filter((f) => f.properties.kind === 'stop');
    expect(s).toHaveLength(1);
    const g = s[0]!.geometry as GeoJSON.LineString;
    expect(g.coordinates[0]![1]).toBeCloseTo(g.coordinates[1]![1]!, 5); // crosses the road
    expect(g.coordinates[0]![1]).toBeLessThan(52.002); // before the node
    const one = overpassRoadmarks({ elements: [way(5, { oneway: '-1' }, [1, 2, 3]), els[1]!] });
    expect(one.features.filter((f) => f.properties.kind === 'stop')).toHaveLength(0); // traffic runs away from that node
  });
  it('draws a zebra across the road at a crossing node, and two lines at a signalised one', () => {
    const road = way(7, { lanes: '2' }, [1, 2, 3]);
    const mid = (tags: Record<string, string>) => ({ type: 'node', id: 2, lat: 52.001, lon: 13, tags: { highway: 'crossing', ...tags } });
    const z = overpassRoadmarks({ elements: [road, mid({ crossing: 'zebra' })] }).features.filter((f) => f.properties.kind === 'zebra');
    expect(z).toHaveLength(1);
    const g = z[0]!.geometry as GeoJSON.LineString;
    expect(g.coordinates[0]![1]).toBeCloseTo(g.coordinates[1]![1]!, 5); // across the north-south road
    expect(Math.abs(g.coordinates[1]![0]! - g.coordinates[0]![0]!) * 68000).toBeGreaterThan(6); // about the road width
    const s = overpassRoadmarks({ elements: [road, mid({ crossing: 'traffic_signals' })] }).features.filter((f) => f.properties.kind === 'cross');
    expect(s).toHaveLength(1);
    // already mapped as a crossing way next to the node: no second zebra
    const dup = overpassRoadmarks({ elements: [road, mid({ crossing: 'zebra' }), { type: 'way', id: 9, tags: { highway: 'footway', crossing: 'zebra' }, geometry: [{ lat: 52.001, lon: 12.9997 }, { lat: 52.001, lon: 13.0003 }] }] });
    expect(dup.features.filter((f) => f.properties.kind === 'zebra')).toHaveLength(1);
  });
  it('knows how crossings are painted (New York style ladder, US uncontrolled, signals)', () => {
    expect(crossingStyle({ crossing: 'marked', 'crossing:markings': 'ladder' })).toBe('zebra');
    expect(crossingStyle({ crossing: 'uncontrolled' })).toBe('zebra');
    expect(crossingStyle({ crossing: 'traffic_signals' })).toBe('cross');
    expect(crossingStyle({ crossing: 'traffic_signals', 'crossing:markings': 'zebra' })).toBe('zebra');
    expect(crossingStyle({ crossing: 'marked', 'crossing:markings': 'lines' })).toBe('cross');
    expect(crossingStyle({ crossing: 'unmarked' })).toBeUndefined();
    expect(crossingStyle({ crossing: 'marked', 'crossing:markings': 'no' })).toBeUndefined();
  });
  it('helpers', () => {
    expect(leftHandTraffic(-0.1, 51.5)).toBe(true);
    expect(leftHandTraffic(13.4, 52.5)).toBe(false);
    expect(backFromEnd([[13, 52], [13, 52.001]], 50)!.p[1]).toBeCloseTo(52.001 - 50 / 111320, 6);
    expect(backFromEnd([[13, 52], [13, 52.0001]], 50)).toBeUndefined();
  });
});

describe('GBFS', () => {
  it('joins information and status, handles GBFS 3 names and missing numbers', () => {
    const fc = gbfsStations({
      sysId: 'x', sys: 'Citi Bike · New York',
      info: { data: { stations: [{ station_id: '1', name: 'W 52 St', lat: 40.76, lon: -73.98, capacity: 30 }, { station_id: '2', name: [{ text: 'Plaça' }], lat: 41.4, lon: 2.1 }, { station_id: '3', name: 'zero', lat: 0, lon: 0 }] } },
      status: { data: { stations: [{ station_id: '1', num_bikes_available: 4, num_ebikes_available: 1, num_docks_available: 26, is_installed: 1, is_renting: 1, last_reported: 1_794_000_000 }] } },
    });
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]!.properties).toMatchObject({ bikes: 4, ebikes: 1, docks: 26, capacity: 30, off: false, id: 'x:1' });
    expect(fc.features[1]!.properties).toMatchObject({ name: 'Plaça', off: true, ebikes: -1, capacity: -1 });
  });
  it('has the 61 systems of the old Orbis', () => expect(BIKE_SYSTEMS).toHaveLength(61));
});

describe('blitzerdeMarkers', () => {
  it('skips clusters and stationary cameras', () => {
    const fc = blitzerdeMarkers({ pois: [
      { id: '', lat: 48.13, lng: 11.47, type: 1000, vmax: '0', counter: 1 },
      { id: '23836', lat: 48.19, lng: 11.50, type: 110, vmax: 60, info: { fixed: 1, kind: 'Ampel + Geschwindigkeit' }, address: { city: 'München' } },
      { id: '777', lat: 48.15, lng: 11.55, type: 1, vmax: '50', counter: 3, confirm_date: '2026-11-11T10:00:00Z', info: { desc: 'Stadteinwärts' }, address: { street: 'Leopoldstr.', city: 'München' } },
    ] });
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.properties).toMatchObject({ id: 'm777', speed: 50, votes: 3, where: 'Leopoldstr., München', dir: -1 });
    expect(blitzerdeMarkers({ pois: null }).features).toEqual([]);
  });
});
