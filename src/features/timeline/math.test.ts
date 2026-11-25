import { describe, expect, it } from 'vitest';
import { DAY, HOUR } from '../../core/time';
import { buildAxis, formatRelative, formatSelected } from './math';

const t0 = new Date(2026, 5, 1).getTime();

describe('Zeitachse', () => {
  it('Tage: Beschriftung je Tag, Monat als Kontext', () => {
    const a = buildAxis(t0, t0 + 14 * DAY, 800);
    expect(a.ticks.length).toBeGreaterThan(5);
    expect(a.ticks.some((k) => k.major && k.labels[0] === 'Juni 2026' || k.labels[0] === 'Juni')).toBe(true);
  });
  it('Stunden nur bei kurzem Ausschnitt', () => {
    expect(buildAxis(t0, t0 + 7 * DAY, 800).ticks.some((k) => k.labels[0]!.includes('Uhr'))).toBe(false);
    const a = buildAxis(t0, t0 + 2 * DAY, 800);
    expect(a.ticks.some((k) => /^\d+ Uhr$/.test(k.labels[0]!))).toBe(true);
    expect(a.ticks.some((k) => k.major && k.labels[0]!.includes('Jun'))).toBe(true);
  });
  it('Jahre und Jahrhunderte', () => {
    const y = buildAxis(t0, t0 + 6 * 365 * DAY, 800);
    expect(y.ticks.some((k) => /^20\d\d$/.test(k.labels[0]!))).toBe(true);
    const c = buildAxis(new Date(1700, 0, 1).getTime(), new Date(2100, 0, 1).getTime(), 800);
    expect(c.ticks.some((k) => k.labels[0]!.includes('Jahrhundert') || /^\d{4}$/.test(k.labels[0]!))).toBe(true);
    expect(c.ticks.length).toBeLessThan(30);
  });
});

describe('Zeiträume von Jahrtausenden', () => {
  it('Achse über 57 000 Jahre mit Jahren vor Christus', () => {
    const d = new Date(0);
    d.setUTCFullYear(-55000);
    const a = buildAxis(d.getTime(), Date.now(), 900);
    expect(a.ticks.length).toBeLessThan(30);
    expect(a.ticks.some((k) => k.labels.some((l) => l.includes('v. Chr.')))).toBe(true);
  });
  it('Anzeige in Jahren vor Christus', () => {
    const d = new Date(0);
    d.setUTCFullYear(-4999);
    expect(formatSelected(d.getTime(), 10 * 365 * DAY)).toBe('5000 v. Chr.');
  });
});

describe('Anzeige nach Auflösung der Daten', () => {
  const t = new Date(2026, 5, 20, 2).getTime();
  it('Jahresdaten: nur die Jahreszahl', () => expect(formatSelected(t, 365 * DAY)).toBe('2026'));
  it('Monatsdaten: Monat und Jahr', () => expect(formatSelected(t, 30 * DAY)).toBe('Juni 2026'));
  it('Tagesdaten: Tag ohne Uhrzeit', () => expect(formatSelected(t, DAY)).not.toMatch(/:/));
  it('Stundendaten: Tag mit Uhrzeit', () => expect(formatSelected(t, HOUR)).toContain('02:00'));
  it('relativ über Jahre', () => expect(formatRelative(t0 - 30 * 365 * DAY, t0)).toBe('vor 30\u202fJahren'));
  it('Rest', () => expect(formatRelative(t0 + 5 * HOUR, t0)).toBe('in 5\u202fh'));
});
