import { describe, expect, it } from 'vitest';
import { portsParse } from './ports';

describe('portsParse', () => {
  it('maps World Port Index rows and UN/LOCODE-only rows', () => {
    const fc = portsParse({ v: 1, ports: [
      [-5.35, 36.1333, 'Europa Point', '', 'Gibraltar', 2, 'Coastal (Breakwater)', 12.5, 7.9, 0, 0, 1, 'Good', 'CR'],
      [9.9, 53.5, 'Hamburg', 'DEHAM', 'DE', 1, 'River (Tide Gates)', 15, 14, 400, 13.5, 1, 'Excellent', 'CRSLBOG'],
      [10, 10, 'Tiny', 'XXTNY', 'Nowhere', 5],
    ] });
    expect(fc.features).toHaveLength(3);
    const g = fc.features[0]!.properties;
    expect(g).toMatchObject({ size: 'Mittel', pilot: 'Pflicht', shelter: 'gut', fac: 'Container, Ro-Ro', channel: 12.5, wpi: true });
    expect(fc.features[1]!.properties.country).toBe('Deutschland');
    expect(fc.features[1]!.properties.draft).toBe(13.5);
    const t = fc.features[2]!.properties;
    expect(t).toMatchObject({ tier: 5, wpi: false, type: '', fac: '' });
  });
  it('tolerates garbage', () => { expect(portsParse(null).features).toEqual([]); });
});
