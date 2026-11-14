import { describe, expect, it } from 'vitest';
import { formatDistance, formatDuration, instruction, parseRoutes } from './osrm';

const step = (type: string, modifier?: string, name = '', exit?: number) => ({ distance: 100, duration: 10, name, maneuver: { type, modifier, location: [1, 2] as [number, number], exit } });

describe('routing', () => {
  it('writes German instructions', () => {
    expect(instruction(step('turn', 'left', 'Hauptstraße'), false, 0, 1)).toBe('Abbiegen links auf Hauptstraße');
    expect(instruction(step('turn', 'straight'), false, 0, 1)).toBe('Geradeaus weiter');
    expect(instruction(step('roundabout', 'right', '', 2), false, 0, 1)).toBe('Im Kreisverkehr die 2. Ausfahrt nehmen');
    expect(instruction(step('arrive', 'left'), true, 0, 1)).toBe('Ziel erreicht, links');
    expect(instruction(step('arrive'), true, 0, 2)).toBe('Zwischenziel erreicht');
  });
  it('parses a route and rejects an empty answer', () => {
    const r = parseRoutes({ code: 'Ok', routes: [{ distance: 5000, duration: 600, geometry: { coordinates: [[1, 2], [3, 4]] }, legs: [{ steps: [step('depart', undefined, 'A'), step('arrive')] }] }] });
    expect(r[0]!.steps.map((s) => s.text)).toEqual(['Starten auf A', 'Ziel erreicht']);
    expect(() => parseRoutes({ code: 'NoRoute' })).toThrow('Keine Route');
  });
  it('formats distance and duration', () => {
    expect(formatDistance(430)).toContain('m');
    expect(formatDistance(12_400)).toMatch(/^12.km$/);
    expect(formatDuration(59 * 60)).toMatch(/^59.Min\.$/);
    expect(formatDuration(3600 * 2 + 600)).toMatch(/^2.Std. 10.Min\.$/);
  });
});
