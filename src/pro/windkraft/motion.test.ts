import { describe, expect, it } from 'vitest';
import { hubWind, ratedRpm, rotorRpm, turnTowards } from './motion';

describe('rotor speed', () => {
  it('stands in a calm and in a storm', () => {
    expect(rotorRpm(100, 0)).toBe(0);
    expect(rotorRpm(100, 2.9)).toBe(0);
    expect(rotorRpm(100, 26)).toBe(0);
  });

  it('rises with the wind up to the rated speed', () => {
    expect(rotorRpm(100, 4)).toBeGreaterThan(0);
    expect(rotorRpm(100, 9)).toBeGreaterThan(rotorRpm(100, 6));
    expect(rotorRpm(100, 14)).toBe(ratedRpm(100));
    expect(rotorRpm(100, 22)).toBe(ratedRpm(100));
  });

  it('turns large rotors slower than small ones', () => {
    expect(ratedRpm(200)).toBeLessThan(ratedRpm(80));
  });

  it('has more wind at a higher hub', () => {
    expect(hubWind(5, 10)).toBeCloseTo(5);
    expect(hubWind(5, 120)).toBeGreaterThan(hubWind(5, 60));
  });
});

describe('turning', () => {
  it('takes the shorter way across north', () => {
    expect(turnTowards(350, 10, 0.5)).toBeCloseTo(0);
    expect(turnTowards(10, 350, 0.25)).toBeCloseTo(5);
    expect(turnTowards(100, 200, 1)).toBeCloseTo(200);
  });
});
