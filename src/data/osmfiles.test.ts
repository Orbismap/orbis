import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { osmPmtilesUrl, resetOsmFiles } from './osmfiles';

const BASE = 'https://orbis-osm.maltee.dev/';
const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);

describe('osmPmtilesUrl', () => {
  beforeEach(() => resetOsmFiles());
  afterEach(() => vi.unstubAllGlobals());

  it('takes the dated file name from meta.json', async () => {
    const fetchMock = vi.fn(() => json({ format: 8, files: { roofs: 'roofs-2026-11-18.pmtiles', cctv: 'cctv-2026-11-18.pmtiles' } }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await osmPmtilesUrl('roofs')).toBe(`${BASE}roofs-2026-11-18.pmtiles`);
    expect(await osmPmtilesUrl('cctv')).toBe(`${BASE}cctv-2026-11-18.pmtiles`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the undated name for a set that meta.json does not list, or for an old meta.json', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ format: 7, sets: {} })));
    expect(await osmPmtilesUrl('trees')).toBe(`${BASE}trees.pmtiles`);
  });

  it('falls back when meta.json cannot be read, and asks again next time', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(() => json({ files: { wind: 'wind-2026-11-18.pmtiles' } }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await osmPmtilesUrl('wind')).toBe(`${BASE}wind.pmtiles`);
    await Promise.resolve();
    expect(await osmPmtilesUrl('wind')).toBe(`${BASE}wind-2026-11-18.pmtiles`);
  });

  it('ignores file names that are not plain .pmtiles names', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ files: { cctv: '../evil.json', alpr: 'alpr-2026-11-18.pmtiles' } })));
    expect(await osmPmtilesUrl('cctv')).toBe(`${BASE}cctv.pmtiles`);
    expect(await osmPmtilesUrl('alpr')).toBe(`${BASE}alpr-2026-11-18.pmtiles`);
  });
});
