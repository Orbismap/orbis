import { describe, expect, it } from 'vitest';
import { modeGroup, vehicleOf } from './modes';

describe('vehicleOf', () => {
  it('knows the kinds that have their own mode, and keeps their group', () => {
    expect(vehicleOf('HIGHSPEED_RAIL', 'ICE 600')).toBe('schnellzug');
    expect(vehicleOf('NIGHT_RAIL', 'NJ 401')).toBe('nachtzug');
    expect(vehicleOf('FLEX', '312')).toBe('rufbus');
    expect(vehicleOf('FUNICULAR', '')).toBe('standseil');
    expect(modeGroup('NIGHT_RAIL')).toBe('fern');
    expect(modeGroup('FLEX')).toBe('bus');
  });
  it('recognises the others only by a clear line name', () => {
    expect(vehicleOf('BUS', 'SEV RE1')).toBe('ersatz');
    expect(vehicleOf('ODM', 'AST 5')).toBe('taxi');
    expect(vehicleOf('LONG_DISTANCE', 'ICE 1601')).toBe('schnellzug');
    expect(vehicleOf('LONG_DISTANCE', 'IC 2073')).toBeUndefined();
    expect(vehicleOf('BUS', '245')).toBeUndefined();
    expect(vehicleOf('SUBURBAN', 'S 3')).toBeUndefined();
  });
});
