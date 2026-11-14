import { describe, expect, it } from 'vitest';
import { GLB_MODELS, glbFor, TYPE_MODEL } from './aircraft-models';

describe('aircraft models', () => {
  it('every type points at a known model', () => {
    for (const [type, [id]] of Object.entries(TYPE_MODEL)) expect(GLB_MODELS[id], type).toBeDefined();
  });
  it('stretches a model to the length of the type', () => {
    expect(glbFor('B738')).toEqual({ id: 'b737-800', factor: 1 });
    expect(glbFor('A321')!.factor).toBeCloseTo(44.5 / 37.57);
  });
  it('knows nothing of other types', () => {
    expect(glbFor('XXXX')).toBeUndefined();
    expect(glbFor(undefined)).toBeUndefined();
    expect(glbFor('')).toBeUndefined();
  });
});
