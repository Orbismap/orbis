import { describe, expect, it } from 'vitest';
import { swMag, swWind, swXray, xrayClass } from './spaceweather';

// real records (SWPC rtsw, 2026-11-11), shortened
const wind = [
  { time_tag: '2026-11-11T12:40:00', active: false, source: 'ACE', proton_speed: 526.18, proton_density: 2.16 },
  { time_tag: '2026-11-11T12:39:00', active: true, source: 'SOLAR1', proton_speed: 518.1, proton_density: 1.87 },
  { time_tag: '2026-11-11T12:38:00', active: true, source: 'SOLAR1', proton_speed: 514.6, proton_density: 1.94 },
  { time_tag: '2026-11-11T11:39:00', active: true, source: 'SOLAR1', proton_speed: 480, proton_density: null },
  { time_tag: '2026-11-11T12:37:00', active: true, source: 'SOLAR1', proton_speed: null, proton_density: null },
];
const mag = [
  { time_tag: '2026-11-11T12:39:00', active: true, source: 'SOLAR1', bt: 3.58, bz_gsm: 1.06 },
  { time_tag: '2026-11-11T12:20:00', active: true, source: 'SOLAR1', bt: 4, bz_gsm: -3 },
  { time_tag: '2026-11-11T10:00:00', active: true, source: 'SOLAR1', bt: 4, bz_gsm: -9 },
];
const xray = [
  { time_tag: '2026-11-10T12:43:00Z', satellite: 18, flux: 9.89e-7, energy: '0.1-0.8nm' },
  { time_tag: '2026-11-10T12:43:00Z', satellite: 18, flux: 2.4e-8, energy: '0.05-0.4nm' },
  { time_tag: '2026-11-11T12:40:00Z', satellite: 18, flux: 6.65e-7, energy: '0.1-0.8nm' },
  { time_tag: '2026-11-11T06:00:00Z', satellite: 18, flux: 2.3e-5, energy: '0.1-0.8nm' },
];

describe('space weather parsers', () => {
  it('takes the newest primary-source wind record and the hourly trend', () => {
    const w = swWind(wind)!;
    expect(w.source).toBe('SOLAR1');
    expect(w.speed).toBe(518.1);
    expect(w.time).toBe(Date.parse('2026-11-11T12:39:00Z'));
    expect(w.trend).toBeCloseTo(38.1);
  });
  it('reads Bz and the 30 min window', () => {
    const m = swMag(mag)!;
    expect(m.bz).toBe(1.06);
    expect(m.bzMin30).toBe(-3);
    expect(m.bz30).toBeCloseTo(-0.97, 1);
  });
  it('classifies X-ray flux and finds the peak', () => {
    expect(xrayClass(6.65e-7)).toBe('B6.7');
    expect(xrayClass(2.3e-5)).toBe('M2.3');
    expect(xrayClass(1.2e-4)).toBe('X1.2');
    const x = swXray(xray)!;
    expect(x.cls).toBe('B6.7');
    expect(x.peakCls).toBe('M2.3');
  });
  it('survives garbage', () => {
    expect(swWind(null)).toBeUndefined();
    expect(swMag([{}])).toBeUndefined();
    expect(swXray([])).toBeUndefined();
  });
});

import { bzInfo, kpInfo, windInfo, xrayInfo } from './spaceweather';
describe('plain-language meanings', () => {
  it('maps Kp to the G scale', () => {
    expect(kpInfo(2.33).level).toBe(0);
    expect(kpInfo(5).label).toMatch(/^G1/);
    expect(kpInfo(7.67).label).toMatch(/^G3/);
  });
  it('describes wind, Bz and flares', () => {
    expect(windInfo(650)).toBe('sehr schnell');
    expect(bzInfo(-7)).toMatch(/Süden/);
    expect(bzInfo(2)).toMatch(/Norden/);
    expect(xrayInfo('M1.2')).toMatch(/^R1/);
    expect(xrayInfo('X2.0')).toMatch(/^R3/);
    expect(xrayInfo('B3.0')).toMatch(/ruhig/);
  });
});
