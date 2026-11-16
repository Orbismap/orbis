import { describe, expect, it } from 'vitest';
import { validateStyleMin, type StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { basemapDef, composeStyle, isBasemapId, resolveBasemapId } from '.';
import { distanceToBoundsKm, haversineKm, itemDistanceKm, regionalFor } from '../../features/basemap/regional-list';
import { basemapCredits } from '../../features/attribution/credits';
import { validateKarte } from '../../karten/store';
import { parseHash } from '../../core/url';
import data from './regional.generated.json';
import { REGIONAL_ALIASES, REGIONAL_IDS } from './regional.ids.generated';
import { STACK_CAP, activeMembers, boundsArea, entryLabel, intersects, loadRegional, memberIds, membersOf, regionalDef, type Bounds, type RegionalEntry } from './regional';

const entries = data as unknown as RegionalEntry[];

const members = (e: RegionalEntry) => membersOf(e);

describe('generated regional data', () => {
  it('ids match the sync id list and are URL-safe', () => {
    expect(entries.map((e) => e.i).sort()).toEqual([...REGIONAL_IDS].sort());
    expect(new Set(REGIONAL_IDS).size).toBe(REGIONAL_IDS.length);
    for (const id of REGIONAL_IDS) {
      expect(id).toMatch(/^r-[a-z0-9-]{1,30}$/);
      expect(isBasemapId(id)).toBe(true);
      expect(parseHash(`#/?b=${id}`).basemap).toBe(id);
    }
  });
  it('only keyless https tiles with sane bounds and zooms', () => {
    expect(entries.length).toBeGreaterThan(500);
    for (const e of entries) for (const m of members(e)) {
      for (const u of [m.u].flat()) {
        expect(u.startsWith('https://')).toBe(true);
        expect(u).not.toMatch(/api_?key|token|secret|[?&#/]key[=/]|\{apikey\}|\{zoom\}|\{-y\}|\{switch|\{proj\}|\{bbox\}/i);
        expect(u.includes('{bbox-epsg-3857}') || (u.includes('{z}') && u.includes('{x}') && u.includes('{y}'))).toBe(true);
      }
      expect(m.b[0]).toBeLessThan(m.b[2]);
      expect(m.b[1]).toBeLessThan(m.b[3]);
      expect(m.z1).toBeGreaterThanOrEqual(m.z0 ?? 0);
      expect(m.z1).toBeLessThanOrEqual(22);
    }
  });
  it('merges yearly editions into series: newest first, union bounds, years in the label', async () => {
    const series = entries.filter((e) => e.m);
    expect(series.length).toBeGreaterThan(100);
    for (const e of series) {
      expect(e.m!.length).toBeGreaterThan(1);
      const ys = e.m!.map((m) => m.y ?? 9999);
      expect(ys).toEqual([...ys].sort((a, b) => b - a));
      for (const m of e.m!) expect(m.b[0] >= e.b[0] - 1e-9 && m.b[2] <= e.b[2] + 1e-9 && m.b[1] >= e.b[1] - 1e-9 && m.b[3] <= e.b[3] + 1e-9).toBe(true);
      expect(e.n).not.toMatch(/\b(19|20)\d\d\b/);
    }
    const mv = entries.find((e) => e.i === 'r-mecklenburg-vorpommern-dop20')!;
    expect(mv.m!.map((m) => m.y)).toEqual([undefined, 2024, 2023, 2022, 2021, 2020, 2019]);
    expect(entryLabel(mv)).toBe('Mecklenburg-Vorpommern DOP20 (2019–aktuell)');
    // the old per-year ids still resolve
    expect(entries.some((e) => e.i === 'r-mv-dop20-2023')).toBe(false);
    for (const old of ['r-mv-dop20', 'r-mv-dop20-2019', 'r-mv-dop20-2024']) {
      expect(isBasemapId(old)).toBe(true);
      expect(resolveBasemapId(old)).toBe('r-mecklenburg-vorpommern-dop20');
    }
    expect(resolveBasemapId('r-mecklenburg-vorpommern-dop20')).toBe('r-mecklenburg-vorpommern-dop20');
    expect(resolveBasemapId('swissimage')).toBe('swissimage');
    expect(resolveBasemapId('oam')).toBeUndefined();
    // every alias points at a live entry, and no alias shadows a live id
    for (const [old, target] of Object.entries(REGIONAL_ALIASES)) {
      expect(entries.some((e) => e.i === target)).toBe(true);
      expect(entries.some((e) => e.i === old)).toBe(false);
    }
  });
  it('series stack only members touching the view, capped, newest first', async () => {
    const mv = entries.find((e) => e.i === 'r-mecklenburg-vorpommern-dop20')!;
    expect(activeMembers(mv, undefined)).toHaveLength(STACK_CAP);
    // Rostock area: members whose bounds miss it are left out (2022 covers only the west)
    const near = activeMembers(mv, [13.9, 54.1, 14.1, 54.2]).map((i) => mv.m![i]!.y);
    expect(near).not.toContain(2022);
    expect(near).not.toContain(2020);
    // nothing outside MV
    expect(activeMembers(mv, [8, 46, 9, 47])).toEqual([]);
    const hapes = entries.find((e) => e.i === 'r-nsw-dcs-ss-hape-imagery')!;
    expect(hapes.m!.length).toBeGreaterThan(STACK_CAP);
    expect(activeMembers(hapes, [-180, -85, 180, 85])).toHaveLength(STACK_CAP);
  });
  it('composed style validates, credits list the used editions', async () => {
    await loadRegional();
    const id = 'r-mecklenburg-vorpommern-dop20';
    const d = regionalDef(id)!;
    expect(d.layers[0]!.type).toBe('background');
    expect(d.layers).toHaveLength(1 + 7);
    expect(Object.keys(d.sources)).toHaveLength(7);
    // oldest at the bottom, newest on top
    expect(d.layers[1]!.id).toBe(memberIds(id, 6).layer);
    expect(d.layers[7]!.id).toBe(memberIds(id, 0).layer);
    for (const s of Object.values(d.sources)) expect((s as { bounds: number[] }).bounds).toHaveLength(4);
    expect(basemapDef(id as never).id).toBe(id);
    const style = composeStyle({ basemap: id as never, labels: true, terminator: true, projection: 'globe' });
    expect(validateStyleMin({ ...style, sources: { ...style.sources, ...d.sources }, layers: [...style.layers, ...d.layers] } as StyleSpecification).map((e) => e.message)).toEqual([]);
    const c = basemapCredits(id as never, [12, 54, 12.2, 54.1]);
    expect(c[0]?.name).toMatch(/GeoBasis-DE\/MV/);
    expect(c.some((x) => /2024/.test(x.license ?? ''))).toBe(true);
    for (const e of entries) expect(basemapCredits(e.i as never).length).toBeGreaterThan(0);
    // a view outside every member credits only the labels sources
    expect(basemapCredits(id as never, [8, 46, 9, 47])).toHaveLength(2);
  });
  it('persisted Karten accept regional, aliased and old swiss ids, reject unknown or removed', () => {
    const k = (b: string) => validateKarte({ id: 'x', name: 'T', basemap: b, layers: [], view: { center: [1, 2], zoom: 3 } }, () => false)!.basemap;
    expect(k('r-mecklenburg-vorpommern-dop20')).toBe('r-mecklenburg-vorpommern-dop20');
    expect(k('r-mv-dop20-2023')).toBe('r-mecklenburg-vorpommern-dop20');
    expect(k('swissimage')).toBe('swissimage');
    expect(k('r-nonexistent')).toBe('orbis-dark');
    expect(k('oam')).toBe('orbis-dark');
  });
});

describe('view intersection', () => {
  const ch: Bounds = [5.95, 45.81, 10.5, 47.81];
  it('basic, antimeridian and world views', () => {
    expect(intersects([8, 46, 9, 47], ch)).toBe(true);
    expect(intersects([10, 50, 13, 54], ch)).toBe(false);
    expect(intersects([-200, 40, -100, 60], [170, 40, 179, 50])).toBe(true);
    expect(intersects([-180, -80, 180, 80], ch)).toBe(true);
    expect(intersects([8, 46, 9, 47], [-180, -85, 180, 85])).toBe(true);
  });
  it('picker list: swisstopo only near Switzerland, selected one always kept, wide view empty', async () => {
    await loadRegional();
    const ids = (v: Bounds | undefined, c: [number, number], sel: never) => regionalFor(v, c, sel).map((o) => o.item.id as string);
    expect(ids([13, 53, 14, 54], [13.5, 53.5], 'orbis-dark' as never)).not.toContain('swissimage');
    expect(ids([13, 53, 14, 54], [13.5, 53.5], 'orbis-dark' as never)).toContain('r-mecklenburg-vorpommern-dop20');
    expect(ids([8, 46.5, 8.5, 47], [8.25, 46.75], 'orbis-dark' as never)).toContain('swissimage');
    expect(ids([13, 53, 14, 54], [13.5, 53.5], 'swissimage' as never)).toContain('swissimage');
    expect(ids([-170, -60, 170, 60], [0, 0], 'orbis-dark' as never)).toEqual([]);
  });
  it('picker list is sorted by distance of the centre to the coverage, then area, then name', async () => {
    await loadRegional();
    const list = regionalFor([8, 46.5, 8.5, 47], [8.25, 46.75], 'orbis-dark');
    expect(list.length).toBeGreaterThan(3);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1]!, b = list[i]!;
      expect(a.km <= b.km).toBe(true);
      if (a.km === b.km) expect(a.item.area < b.item.area || (a.item.area === b.item.area && a.item.label.localeCompare(b.item.label, 'de') <= 0)).toBe(true);
    }
    expect(list[0]!.km).toBe(0); // the centre lies inside several layers
  });
});

describe('distance to coverage', () => {
  const box: Bounds = [10, 50, 12, 52];
  it('0 inside, great-circle to the nearest edge outside', () => {
    expect(distanceToBoundsKm([11, 51], box)).toBe(0);
    expect(distanceToBoundsKm([13, 51], box)).toBeCloseTo(haversineKm([12, 51], [13, 51]), 6);
    expect(distanceToBoundsKm([11, 53], box)).toBeCloseTo(haversineKm([11, 52], [11, 53]), 6);
    expect(distanceToBoundsKm([13, 53], box)).toBeCloseTo(haversineKm([12, 52], [13, 53]), 6);
  });
  it('handles the antimeridian', () => {
    const fiji: Bounds = [177, -19, 180, -16];
    const west: Bounds = [-180, -19, -178, -16];
    expect(distanceToBoundsKm([-179, -17], fiji)).toBeCloseTo(haversineKm([-179, -17], [-180, -17]), 6); // 1 deg away across the line
    expect(distanceToBoundsKm([179.5, -17], west)).toBeCloseTo(haversineKm([179.5, -17], [180, -17]), 6);
    expect(distanceToBoundsKm([-179, -17], west)).toBe(0);
    expect(distanceToBoundsKm([179, -17], fiji)).toBe(0);
  });
  it('a series counts by its nearest member, ties go to the smaller area then the name', () => {
    const item = (id: string, label: string, bounds: Bounds, parts?: Bounds[]) => ({ id: id as never, label, bounds, area: boundsArea(bounds), ...(parts ? { parts } : {}) });
    const far: Bounds = [0, 0, 1, 1], near: Bounds = [10, 10, 11, 11];
    const series = item('r-s', 'S', [0, 0, 11, 11], [far, near]);
    expect(itemDistanceKm([10.5, 10.5], series)).toBe(0);
    expect(itemDistanceKm([5, 5], series)).toBeGreaterThan(0);
    const c: [number, number] = [10.5, 10.5];
    const items = [item('r-b', 'B', [10, 10, 12, 12]), item('r-a', 'A', [10, 10, 12, 12]), item('r-small', 'Z', [10, 10, 11, 11])];
    const sorted = items.map((i) => ({ i, km: itemDistanceKm(c, i) })).sort((x, y) => x.km - y.km || x.i.area - y.i.area || x.i.label.localeCompare(y.i.label, 'de')).map((o) => o.i.id);
    expect(sorted).toEqual(['r-small', 'r-a', 'r-b']);
  });
});
