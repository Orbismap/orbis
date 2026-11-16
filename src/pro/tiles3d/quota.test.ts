import { describe, expect, it } from 'vitest';
import { countRoot, ionProblem, rootsThisMonth } from './quota';

const fake = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe('root request count', () => {
  it('counts up within a month and starts again in the next', () => {
    const s = fake();
    const jan = new Date('2027-01-10T12:00:00Z');
    expect(rootsThisMonth(jan, s)).toBe(0);
    expect(countRoot(jan, s)).toBe(1);
    expect(countRoot(jan, s)).toBe(2);
    expect(rootsThisMonth(jan, s)).toBe(2);
    expect(rootsThisMonth(new Date('2027-02-01T00:00:01Z'), s)).toBe(0);
  });
  it('survives unreadable storage', () => {
    const s = fake();
    s.setItem('orbis-ion-roots', '{kaputt');
    expect(countRoot(new Date('2027-03-05T00:00:00Z'), s)).toBe(1);
  });
});

describe('ionProblem', () => {
  it('explains the quota and the token errors, nothing else', () => {
    expect(ionProblem('Failed to load model with error code 429')).toMatch(/Tageslimit/);
    expect(ionProblem('CesiumIonAuthPlugin: Failed to load data with error code 401')).toMatch(/Token/);
    expect(ionProblem('Failed to load model with error code 500')).toBeUndefined();
  });
});
