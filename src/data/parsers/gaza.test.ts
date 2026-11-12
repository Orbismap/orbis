import { describe, expect, it } from 'vitest';
import { gazaDisplacement, healthSites, ipcAreas, rowAt } from './gaza';

describe('gaza parsers', () => {
  it('displacement events', () => {
    const fc = gazaDisplacement({ events: [{ d: '2026-10-25', lat: 31.5, lon: 34.46, f: 46, l: 'Gaza', t: 'IAC', k: 'Conflict', e: 'x', s: 'OCHA', x: 'text' }, { d: 'bad', lat: 1, lon: 1 }] });
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.properties).toMatchObject({ people: 46, source: 'OCHA', t: Date.parse('2026-10-25T12:00:00Z') });
  });
  it('health sites', () => {
    const fc = healthSites({ places: [{ lon: 34.25, lat: 31.28, a: 'clinic', n: 'x', o: '', u: 'https://www.openstreetmap.org/way/1' }, { lat: 3 }] });
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.properties.kind).toBe('clinic');
  });
  it('ipc areas keep finished analyses', () => {
    const fc = ipcAreas({ areas: [{ name: 'Gaza', geometry: { type: 'Polygon', coordinates: [] }, phase: 3, period: 'C', pop: 5, shares: [0, 1], people: [0, 5], history: [{ from: 'a', to: 'b', kind: 'current', analysis: 'x', p: { '3+': 1 }, n: {} }, { from: 'a', to: 'b', kind: 'x', analysis: 'y', p: {}, n: {} }] }, { name: 'none' }] });
    expect(fc.features).toHaveLength(1);
    expect(JSON.parse(fc.features[0]!.properties.history)).toHaveLength(1);
  });
  it('rowAt picks the last report before the day', () => {
    const rows = [{ report_date: '2023-10-07' }, { report_date: '2023-10-09' }, { report_date: '2023-10-12' }];
    expect(rowAt(rows, Date.parse('2023-10-10T10:00:00Z'))!.report_date).toBe('2023-10-09');
    expect(rowAt(rows, Date.parse('2023-10-01T10:00:00Z'))).toBeUndefined();
    expect(rowAt(rows, Date.parse('2030-01-01'))!.report_date).toBe('2023-10-12');
  });
});

import { archiveDots, archiveExternal, archivePins, captionParts, dayToDate } from './archive';
describe('archive parsers', () => {
  it('pins, external and dots', () => {
    const pins = archivePins([[115727, 34.500925, 31.538581, 4, 9, 388, 1, [[34.4986, 31.5497]], 'gl'], [1, 'x', 2]]);
    expect(pins.features).toHaveLength(1);
    expect(pins.features[0]!.properties).toMatchObject({ clip: 115727, lvl: 4, ci: 9, day: 388, kind: 'pin' });
    const ext = archiveExternal([{ lat: 31.5, lon: 34.4, level: 'L4', title: 'Testimony', source: { name: 'genocide.live', url: 'https://genocide.live/858' }, footage_url: 'https://x.com/a/1' }]);
    expect(ext.features[0]!.properties).toMatchObject({ kind: 'ext', lvl: 4, srcName: 'genocide.live' });
    expect(archiveDots([[1, 34.49, 31.54, 3, 1, 1112, 'f'], [2, null, 1]]).features).toHaveLength(1);
  });
  it('date and caption helpers', () => {
    expect(dayToDate('2023-10-07', 388)).toBe('2024-10-29');
    expect(dayToDate('2023-10-07', -1)).toBe('');
    expect(captionParts('Strike on a school\nmore text [Original post] original words')).toEqual({ title: 'Strike on a school', text: 'more text original words' });
  });
});
