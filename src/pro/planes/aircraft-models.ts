// Detailed 3D models (glTF, public/models/aircraft/, credits in CREDITS.json) for the most common aircraft types. One
// model serves a whole family and is scaled to the real length of each type; types without a model keep the simple
// procedural one (models.ts). The files are normalised: y up, nose towards +z, x centred, wheels at y = 0, in metres.

export interface GlbSpec {
  file: string;
  /** length of the model in metres (as built into the file) */
  length: number;
}

export const GLB_MODELS: Record<string, GlbSpec> = {
  'b737-800': { file: 'b737-800.glb', length: 39.5 },
  a320neo: { file: 'a320neo.glb', length: 37.57 },
  a220: { file: 'a220.glb', length: 38.7 },
  e175: { file: 'e175.glb', length: 31.68 },
  'cessna-172': { file: 'cessna-172.glb', length: 8.28 },
  b777: { file: 'b777.glb', length: 63.7 },
  b787: { file: 'b787.glb', length: 56.7 },
  a350: { file: 'a350.glb', length: 73.8 },
  a330: { file: 'a330.glb', length: 63.7 },
  b767: { file: 'b767.glb', length: 48.5 },
  b757: { file: 'b757.glb', length: 54.5 },
  a380: { file: 'a380.glb', length: 72.7 },
  erj135: { file: 'erj135.glb', length: 26.4 },
  crj200: { file: 'crj200.glb', length: 26.8 },
  atr72: { file: 'atr72.glb', length: 27.2 },
  q400: { file: 'q400.glb', length: 32.8 },
  pa28: { file: 'pa28.glb', length: 7.2 },
  pc12: { file: 'pc12.glb', length: 14.4 },
};

/** ICAO type designator → [model, real length of the type in metres] */
export const TYPE_MODEL: Record<string, [string, number]> = {
  B736: ['b737-800', 31.2], B737: ['b737-800', 33.6], B738: ['b737-800', 39.5], B739: ['b737-800', 42.1],
  B37M: ['b737-800', 35.6], B38M: ['b737-800', 39.5], B39M: ['b737-800', 42.2],
  A318: ['a320neo', 31.4], A319: ['a320neo', 33.8], A19N: ['a320neo', 33.8], A320: ['a320neo', 37.57], A20N: ['a320neo', 37.57], A321: ['a320neo', 44.5], A21N: ['a320neo', 44.5],
  BCS1: ['a220', 35], BCS3: ['a220', 38.7],
  E170: ['e175', 29.9], E75S: ['e175', 31.68], E75L: ['e175', 31.68], E190: ['e175', 36.2], E195: ['e175', 38.65], E290: ['e175', 36.2], E295: ['e175', 41.5],
  C150: ['cessna-172', 7.0], C152: ['cessna-172', 7.3], C172: ['cessna-172', 8.28], C72R: ['cessna-172', 8.28], C182: ['cessna-172', 8.8],
  B772: ['b777', 63.7], B77L: ['b777', 63.7], B77W: ['b777', 73.9], B773: ['b777', 73.9],
  B788: ['b787', 56.7], B789: ['b787', 62.8], B78X: ['b787', 68.3],
  A359: ['a350', 66.8], A35K: ['a350', 73.8],
  A332: ['a330', 58.8], A333: ['a330', 63.7], A338: ['a330', 58.8], A339: ['a330', 63.7],
  B762: ['b767', 48.5], B763: ['b767', 54.9], B764: ['b767', 61.4],
  B752: ['b757', 47.3], B753: ['b757', 54.4],
  A388: ['a380', 72.7],
  E135: ['erj135', 26.3], E145: ['erj135', 29.9], E45X: ['erj135', 29.9],
  CRJ1: ['crj200', 26.8], CRJ2: ['crj200', 26.8], CRJ7: ['crj200', 32.5], CRJ9: ['crj200', 36.2], CRJX: ['crj200', 39.1],
  AT72: ['atr72', 27.2], AT73: ['atr72', 27.2], AT75: ['atr72', 27.2], AT76: ['atr72', 27.2], AT45: ['atr72', 24.7], AT46: ['atr72', 22.7],
  DH8D: ['q400', 32.8], DH8C: ['q400', 25.7], DH8B: ['q400', 22.3], DH8A: ['q400', 22.3],
  P28A: ['pa28', 7.2], P28B: ['pa28', 7.2], P28R: ['pa28', 7.5], P28T: ['pa28', 7.6], PA28: ['pa28', 7.2],
  PC12: ['pc12', 14.4],
};

/** The model for an ICAO type and how much to stretch it (real length / built length); undefined: no detailed model. */
export function glbFor(type: string | undefined): { id: string; factor: number } | undefined {
  const t = type && TYPE_MODEL[type];
  if (!t) return undefined;
  return { id: t[0], factor: t[1] / GLB_MODELS[t[0]]!.length };
}
