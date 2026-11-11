// Tuned colour scales of the weather fields and the premultiplied look-up tables the shaders sample.
// The generic scales live in core/color.ts (not ours to edit); where they needed tuning for the field renderer on
// the dark basemap and on satellite imagery, the tuned version is defined here and used by the weather layers.
import { buildLut, scaleRange, type ColorScale } from '../../core/color';
import { CAPE, GUSTS as CORE_GUSTS, PRECIP, TEMPERATURE } from '../../core/color';

export { CAPE, PRECIP, TEMPERATURE };

/** °C dew point: dry tan, comfortable green, humid teal-blue, oppressive violet. */
export const DEWPOINT: ColorScale = {
  unit: '°C',
  ticks: [-30, -15, 0, 10, 16, 22, 28],
  stops: [
    [-40, '#6a4a3a'], [-25, '#9a7a52'], [-10, '#c9b27a'], [0, '#e4dcae'], [6, '#b3da98'], [12, '#6cc79a'], [16, '#3fb8b4'],
    [20, '#3a8fd6'], [24, '#5a5ed8'], [28, '#9a3fc0'], [32, '#d63aa0'],
  ],
};

export const LUT_SIZE = 1024;

/** Premultiplied RGBA table over the scale's range (so that linear filtering never fringes at soft alpha edges). */
export function buildFieldLut(scale: ColorScale, size = LUT_SIZE): Uint8Array {
  const [min, max] = scaleRange(scale);
  const lut = buildLut(scale, min, max, size);
  for (let i = 0; i < size; i++) {
    const a = lut[i * 4 + 3]! / 255;
    lut[i * 4] = Math.round(lut[i * 4]! * a);
    lut[i * 4 + 1] = Math.round(lut[i * 4 + 1]! * a);
    lut[i * 4 + 2] = Math.round(lut[i * 4 + 2]! * a);
  }
  return lut;
}

/** km/h wind speed, tuned: calm air is a faint veil so that particles and basemap carry the picture, then a
 *  smooth indigo → teal → green → amber → red → magenta ramp. */
export const WIND: ColorScale = {
  unit: 'km/h',
  ticks: [0, 20, 40, 60, 80, 100, 120],
  stops: [
    [0, 'rgba(70, 60, 160, 0)'], [6, 'rgba(70, 70, 190, 0.28)'], [15, 'rgba(58, 110, 215, 0.5)'], [25, 'rgba(56, 170, 205, 0.62)'],
    [36, 'rgba(90, 205, 160, 0.72)'], [48, 'rgba(190, 228, 110, 0.8)'], [62, '#f3d76a'], [78, '#f0a050'], [95, '#df6258'], [115, '#b0346e'], [140, '#f0d0ee'],
  ],
};

/** km/h gusts, same family as WIND but stretched. */
export const GUSTS: ColorScale = {
  ...CORE_GUSTS,
  stops: [
    [0, 'rgba(70, 60, 160, 0)'], [10, 'rgba(70, 70, 190, 0.28)'], [25, 'rgba(58, 110, 215, 0.5)'], [40, 'rgba(56, 170, 205, 0.62)'],
    [55, 'rgba(90, 205, 160, 0.72)'], [70, 'rgba(190, 228, 110, 0.8)'], [85, '#f3d76a'], [100, '#f0a050'], [120, '#df6258'], [140, '#b0346e'], [170, '#f0d0ee'],
  ],
};

/** % relative humidity: dry is warm and strong, the usual 70-95 % range stays a soft blue veil so that the
 *  differences (fronts, dry intrusions) read and the basemap shows through. */
export const HUMIDITY: ColorScale = {
  unit: '%',
  ticks: [0, 25, 50, 75, 100],
  stops: [
    [0, '#9a5a22'], [20, '#c98a3d'], [40, '#e6cf94'], [58, 'rgba(160, 218, 200, 0.8)'], [72, 'rgba(90, 185, 215, 0.62)'],
    [85, 'rgba(60, 130, 210, 0.5)'], [95, 'rgba(50, 95, 195, 0.62)'], [100, 'rgba(60, 70, 175, 0.78)'],
  ],
};

/** % cloud cover: clear sky is see-through, overcast a milky veil (never opaque: the map stays readable). */
export const CLOUD: ColorScale = {
  unit: '%',
  ticks: [0, 25, 50, 75, 100],
  stops: [[0, 'rgba(255, 255, 255, 0)'], [15, 'rgba(235, 242, 252, 0.08)'], [50, 'rgba(235, 242, 252, 0.32)'], [80, 'rgba(242, 247, 255, 0.55)'], [100, 'rgba(250, 252, 255, 0.72)']],
};

/** hPa, diverging around 1013; the neutral middle is a faint veil, the extremes are saturated. */
export const PRESSURE: ColorScale = {
  unit: 'hPa',
  ticks: [960, 980, 1000, 1013, 1030, 1050],
  stops: [
    [960, '#5b2bd6'], [985, '#2f7fd8'], [1000, 'rgba(79, 195, 232, 0.75)'], [1013, 'rgba(226, 232, 242, 0.22)'],
    [1022, 'rgba(246, 201, 69, 0.7)'], [1035, '#e0462f'], [1050, '#9e1a3a'],
  ],
};

/** m snow depth: faint cold veil for a dusting, lilac to white for deep snow. */
export const SNOW: ColorScale = {
  unit: 'm',
  ticks: [0, 0.25, 0.5, 1, 2],
  stops: [[0, 'rgba(200, 220, 255, 0)'], [0.02, 'rgba(200, 220, 255, 0.35)'], [0.1, '#a9bfff'], [0.3, '#8fa0f5'], [0.6, '#b4a8f5'], [1, '#dcd2ff'], [2, '#ffffff']],
};
