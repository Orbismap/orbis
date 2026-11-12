import { describe, expect, it } from 'vitest';
import { unwrapAngle } from './frame';

describe('unwrapAngle', () => {
  it('keeps values that are already close', () => expect(unwrapAngle(10, 20)).toBe(20));
  it('crosses +180 without spinning back', () => expect(unwrapAngle(179, -179)).toBe(181));
  it('crosses -180 without spinning back', () => expect(unwrapAngle(-179, 179)).toBe(-181));
  it('follows several turns', () => expect(unwrapAngle(725, 5)).toBe(725));
});
