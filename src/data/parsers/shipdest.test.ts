import { describe, expect, it } from 'vitest';
import { destinationTail, PortIndex, type PortRow } from './shipdest';

const rows: PortRow[] = [
  [4.3, 51.95, 'Rotterdam', 'NLRTM', 'Netherlands', 1],
  [9.97, 53.54, 'Hamburg', 'DEHAM', 'Germany', 1],
  [-71.1, 42.3, 'Hamburg', 'USHBG', 'United States', 4],
  [4.4, 51.3, 'Antwerpen', 'BEANR', 'Belgium', 1],
];
describe('destinationTail', () => {
  it('takes the last leg and drops noise', () => {
    expect(destinationTail('ROTTERDAM>ANTWERP')).toBe('ANTWERP');
    expect(destinationTail('HAMBURG FOR ORDERS')).toBe('HAMBURG');
    expect(destinationTail('NL RTM')).toBe('NL RTM');
    expect(destinationTail('')).toBe('');
  });
});
describe('PortIndex.resolve', () => {
  const idx = new PortIndex(rows);
  it('matches UN/LOCODE with and without space', () => {
    expect(idx.resolve('NLRTM')?.name).toBe('Rotterdam');
    expect(idx.resolve('DE HAM')?.name).toBe('Hamburg');
    expect(idx.resolve('ANTWERP>NLRTM')?.code).toBe('NLRTM');
  });
  it('matches a name, ties go to the nearest port', () => {
    expect(idx.resolve('rotterdam')?.code).toBe('NLRTM');
    expect(idx.resolve('HAMBURG', [8, 54])?.code).toBe('DEHAM');
    expect(idx.resolve('HAMBURG', [-70, 42])?.code).toBe('USHBG');
    expect(idx.resolve('HAMBURG')).toBeNull();
  });
  it('gives null for unknown text', () => {
    expect(idx.resolve('FOR ORDERS')).toBeNull();
    expect(idx.resolve('XYZ')).toBeNull();
  });
});
