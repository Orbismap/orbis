import { describe, expect, it } from 'vitest';
import { cccEvents } from './ccc';

describe('cccEvents', () => {
  const raw = { built: 'x', events: [
    { d: '2025-04-29', ty: 'demonstration; civil disobedience', city: 'Los Angeles', st: 'CA', lon: -118.2426, lat: 34.0549, s: 110000, slo: 20000, shi: 200000, sb: 'hundreds of thousands', is: 'economy', ar: 12, so: 'www.cbsnews.com', cl: 'for wages' },
    { d: '2025-01-01', city: 'Albany', st: 'NY', lon: -73.7, lat: 42.6 },
    { d: '2025-01-02', city: 'Nowhere', lon: null, lat: null },
  ] };
  it('keeps located events with slim props', () => {
    const fc = cccEvents(raw);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]!.properties).toMatchObject({ s: 110000, ar: 12, st: 'CA', t: Date.parse('2025-04-29T12:00:00Z') });
    expect(fc.features[1]!.properties).toMatchObject({ s: 0, ar: -1 });
    expect(fc.lastDay).toBe(Date.parse('2025-04-29T12:00:00Z'));
    expect(cccEvents(null).features).toEqual([]);
  });
});
