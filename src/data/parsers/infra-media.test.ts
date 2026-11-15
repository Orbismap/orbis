import { describe, expect, it } from 'vitest';
import { powerPlants } from './powerplants';
import { resourceGroup, wikiResources } from './resources';
import { dataCenters } from './datacenters';
import { heatCells } from './heat';
import { webcamFeed, webcamPoints } from './webcams';
import { radioStations } from './radio';
import { berlinToEpoch, demoEvents } from './demos';
import { overpassPipelines } from './pipelines';
import { peeringdbFacilities, mergeDatacenters } from './peeringdb';
import { mrdsCommodities, mrdsSites } from './mrds';
import { runParser } from '../worker/pool';

describe('powerPlants', () => {
  const rows = [
    [111.0032, 30.8235, 22500, 'Hydro', 'Three Gorges Dam', 'China', 2003, '', 'http://www.ctgpc.com.cn/sx/'],
    [73.4889, 61.2794, 8865, 'Gas', 'Surgutskaya GRES-2', 'Russia', 1979, 'PJSC "Unipro"', 'https://energybase.ru/x'],
    [103.6484, 28.2606, 13050, 'Hydro', 'Baihetan Dam', 'China', 0, '', ''],
    [1, 2, 0, 'Wind', 'zero', 'X', 2000, '', ''],
    [5, 6, 10, 'Petcoke', 'Pet', 'X', 2000, '', ''],
    [5, 6, 10, 'Geothermal', 'Geo', 'X', 2000, '', ''],
  ];
  it('classifies fuels, drops empty plants and unusable fields', () => {
    const fc = powerPlants(rows);
    expect(fc.features).toHaveLength(5);
    const [a, b, c, d, e] = fc.features.map((f) => f.properties);
    expect(a).toMatchObject({ name: 'Three Gorges Dam', fuel: 'hydro', mw: 22500, year: 2003, url: 'http://www.ctgpc.com.cn/sx/' });
    expect(b).toMatchObject({ fuel: 'gas', owner: 'PJSC "Unipro"' });
    expect(c!.year).toBe(0);
    expect(d!.fuel).toBe('coal');
    expect(e!.fuel).toBe('other');
  });
  it('survives garbage', () => expect(powerPlants(null).features).toEqual([]));
});

describe('wikiResources', () => {
  it('groups by class and products', () => {
    const fc = wikiResources([
      [53.6797, 24.9747, 'Q144818', 'Zakum', 'Ölfeld', ''],
      [-111.65, 57.02, 'Q754632', 'Athabasca-Ölsande', 'Ölfeld', 'oil sands'],
      [10, 50, 'Q1', 'Zeche', 'Bergwerk', 'bituminous coal, coal'],
      [10, 51, 'Q2', 'Grube', 'Bergwerk', 'gold ore, silver ore'],
      [10, 52, 'Q3', 'Unbekannt', 'Bergwerk', ''],
    ]);
    expect(fc.features.map((f) => f.properties.group)).toEqual(['oilgas', 'oilgas', 'coal', 'metal', 'other']);
    expect(fc.features[3]!.properties.products).toBe('Gold, Silber');
    expect(resourceGroup('Bergwerk', 'uranium ore')).toBe('uranium');
    expect(resourceGroup('Salzbergwerk', '')).toBe('salt');
  });
});

describe('dataCenters', () => {
  it('slims OSM points', () => {
    const fc = dataCenters({ type: 'FeatureCollection', features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [4.93794, 52.30306] }, properties: { osm: 'node/717740190', name: 'Equinix AM7', operator: 'Equinix', city: 'Amsterdam' } },
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: {} },
    ] });
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.properties).toEqual({ id: 'node/717740190', name: 'Equinix AM7', operator: 'Equinix', city: 'Amsterdam' });
  });
});

describe('heatCells', () => {
  it('weights points', () => {
    const fc = heatCells([[11.44, 48.19, 1], [5.73, 45.19, 151], ['x', 1, 2]]);
    expect(fc.features.map((f) => f.properties.n)).toEqual([1, 151]);
  });
});

describe('webcams', () => {
  it('keeps https media only', () => {
    const fc = webcamFeed([
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.01594, 51.60067] }, properties: { id: 'JamCams_00002.00865', title: 'A406 Billet Upass E', subtitle: 'Verkehrskamera London', image: 'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00002.00865.jpg', video: 'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00002.00865.mp4', url: 'https://x/y.mp4', source: 'TfL', kind: 'road' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [151.1, -34.0] }, properties: { id: 'nsw-1', title: 'Miranda', image: 'http://insecure/x.jpg', url: 'http://insecure/x.jpg', source: 'NSW', kind: 'road', dir: 270 } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [NaN, 1] }, properties: {} },
    ]);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]!.properties).toMatchObject({ image: expect.stringContaining('https://'), video: expect.stringContaining('.mp4'), dir: -1 });
    expect(fc.features[1]!.properties).toMatchObject({ image: '', url: 'http://insecure/x.jpg', dir: 270 });
  });
  it('reads world positions', () => expect(webcamPoints([[23.9962, 60.0537], [1]]).features).toHaveLength(1));
});

describe('radioStations', () => {
  const rb = [
    { stationuuid: 'a', name: 'Classic Vinyl HD ', url_resolved: 'https://icecast.walmradio.com:8443/classic', homepage: 'https://walmradio.com/classic', tags: '1930,1940,1950,1960,1970', country: 'USA', codec: 'MP3', bitrate: 320, geo_lat: 40.7517, geo_long: -73.9754, clickcount: 1411, hls: 0, favicon: 'https://walmradio.com/logo.png' },
    { stationuuid: 'b', name: 'Insecure', url_resolved: 'http://s/x', geo_lat: 1, geo_long: 2, hls: 1, favicon: 'http://insecure.example/logo.png' },
    { stationuuid: 'a', name: 'dup', geo_lat: 1, geo_long: 2 },
    { stationuuid: 'c', name: 'broken', geo_lat: 1, geo_long: 2, lastcheckok: 0 },
    { stationuuid: 'd', name: 'nogeo', geo_lat: null, geo_long: null },
  ];
  it('splits secure and insecure streams, dedupes, drops broken', () => {
    const fc = radioStations(rb);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]!.properties).toMatchObject({ name: 'Classic Vinyl HD', stream: 'https://icecast.walmradio.com:8443/classic', tags: '1930, 1940, 1950, 1960', bitrate: 320, clicks: 1411, favicon: 'https://walmradio.com/logo.png' });
    expect(fc.features[1]!.properties).toMatchObject({ stream: '', streamHttp: 'http://s/x', hls: true, favicon: '' });
  });
});

describe('demoEvents', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  const ev = (over: object) => ({ n: 'Mahnwache', s: '2026-12-21T19:00:00', e: '2026-12-21T20:00:00', c: 'Deutschland', city: 'Dresden', place: 'Prager Straße', lon: 13.7, lat: 51.0, topics: ['Arbeit', 'Frieden'], org: 'Verein', u: 'https://demonstrations.org/de/events/1', ...over });
  it('converts Berlin wall time, drops broken series, repairs ends', () => {
    expect(berlinToEpoch('2026-12-21T19:00:00')).toBe(Date.parse('2026-12-21T18:00:00Z')); // CET
    expect(berlinToEpoch('2026-07-01T12:00:00')).toBe(Date.parse('2026-07-01T10:00:00Z')); // CEST
    const d = demoEvents({ built: '2026-11-10T20:22:54Z', events: [
      ev({}),
      ev({ s: '2052-04-05T00:00:00', e: '2021-07-05T14:30:00' }),
      ev({ n: 'Ende kaputt', s: '2026-11-11T10:00:00', e: '2021-01-01T00:00:00', lon: 1 }),
      ev({}), // exact duplicate
    ] }, { now });
    expect(d.features.features).toHaveLength(2);
    const [a, b] = d.features.features.map((f) => f.properties);
    expect(a).toMatchObject({ name: 'Mahnwache', topics: 'Arbeit, Frieden', end: a!.start + 3_600_000 });
    expect(b!.end).toBe(b!.start + 2 * 3_600_000);
    expect(d.built).toBe(Date.parse('2026-11-10T20:22:54Z'));
  });
  it('runs through the pool inline', async () => {
    const d = await runParser('demoEvents', { events: [ev({})] }, { args: { now } });
    expect(d.features.features).toHaveLength(1);
  });
});

describe('overpassPipelines', () => {
  it('colours by substance and skips degenerate ways', () => {
    const fc = overpassPipelines({ elements: [
      { type: 'way', id: 229357251, geometry: [{ lat: 53.64, lon: 9.51 }, { lat: 53.65, lon: 9.52 }], tags: { man_made: 'pipeline', substance: 'natural_gas', operator: 'GASCADE', diameter: '1000', location: 'underground' } },
      { type: 'way', id: 2, geometry: [{ lat: 1, lon: 2 }, { lat: 1, lon: 3 }], tags: { substance: 'hydrogen', name: 'H2-Leitung' } },
      { type: 'way', id: 3, geometry: [{ lat: 1, lon: 2 }], tags: { substance: 'gas' } },
      { type: 'way', id: 4 },
    ] });
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]!.properties).toMatchObject({ substance: 'gas', operator: 'GASCADE', diameter: '1000', underground: true });
    expect(fc.features[0]!.geometry.coordinates[0]).toEqual([9.51, 53.64]);
    expect(fc.features[1]!.properties).toMatchObject({ substance: 'hydrogen', name: 'H2-Leitung', underground: false });
  });
});

describe('peeringdb', () => {
  const raw = { data: [
    { id: 1, org_name: 'Equinix, Inc.', name: 'Equinix DC1 - Ashburn', net_count: 527, ix_count: 9, carrier_count: 14, city: 'Ashburn', country: 'US', latitude: 39.016363, longitude: -77.459023 },
    { id: 2, org_name: 'X', name: 'X', latitude: null, longitude: null },
    { id: 3, name: 'Null Island', latitude: 0, longitude: 0 },
  ] };
  it('keeps located facilities', () => {
    const fc = peeringdbFacilities(raw);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.properties).toMatchObject({ fid: 1, nets: 527, org: 'Equinix, Inc.', ixs: 9 });
    expect(peeringdbFacilities(null).features).toEqual([]);
  });
  it('drops OSM points within 300 m of a facility', () => {
    const pdb = peeringdbFacilities(raw);
    const osm = dataCenters({ features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-77.4592, 39.0165] }, properties: { osm: 'node/1', name: 'dup' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [8.6, 50.1] }, properties: { osm: 'node/2', name: 'other' } },
    ] });
    const m = mergeDatacenters(pdb, osm);
    expect(m.features.map((f) => f.properties.src)).toEqual(['pdb', 'osm']);
    expect(m.features[1]!.properties.name).toBe('other');
  });
});

describe('mrdsSites', () => {
  const gml = `<wfs:FeatureCollection><gml:featureMember><ms:mrds fid="mrds.1"><ms:geometry><gml:Point srsName="EPSG:4326">
    <gml:coordinates>-111.500000,39.250000</gml:coordinates></gml:Point></ms:geometry><ms:dep_id>10129978</ms:dep_id>
    <ms:site_name>Skyline &amp; Drive Pit</ms:site_name><ms:dev_stat>Past Producer</ms:dev_stat><ms:code_list> SDG</ms:code_list></ms:mrds></gml:featureMember>
    <gml:featureMember><ms:mrds><ms:geometry><gml:Point><gml:coordinates>-110.1,38.2</gml:coordinates></gml:Point></ms:geometry><ms:dep_id>5</ms:dep_id>
    <ms:site_name>Unknown</ms:site_name><ms:dev_stat>Producer</ms:dev_stat><ms:code_list> CU AU</ms:code_list></ms:mrds></gml:featureMember></wfs:FeatureCollection>`;
  it('reads GML members', () => {
    const fc = mrdsSites(gml);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]!.properties).toMatchObject({ name: 'Skyline & Drive Pit', status: 'ehemals gefördert', commodities: 'Sand & Kies', group: 'other' });
    expect(fc.features[1]!.properties).toMatchObject({ name: '', status: 'in Förderung', commodities: 'Kupfer, Gold', group: 'metal' });
    expect(fc.features[0]!.geometry.coordinates).toEqual([-111.5, 39.25]);
  });
  it('ranks groups and survives garbage', () => {
    expect(mrdsCommodities('CU U').group).toBe('uranium');
    expect(mrdsSites(null).features).toEqual([]);
  });
});
