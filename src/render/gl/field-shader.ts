// GLSL of the field renderer. Vertex: world mesh in mercator coordinates through MapLibre's projectTile.
// Fragment: reconstructs int16 from RG8, samples overview + (optionally) one 0.125° tile bilinearly with exact
// nodata handling, blends the two bracketing time layers, derives magnitude/humidity, colours via LUT and
// adds anti-aliased contour lines.

export const TILE_SLOTS = 4;

export const FIELD_ATTRIBS = { a_pos: 0 } as const;

export const FIELD_VERTEX = `
in vec2 a_pos;
uniform float u_copy;
out highp vec2 v_merc;
void main() {
  vec2 m = vec2(a_pos.x + u_copy, a_pos.y);
  v_merc = m;
  gl_Position = projectTile(m);
}`;

const slotUniforms = Array.from({ length: TILE_SLOTS }, (_, i) => `uniform sampler2DArray u_ta${i};\nuniform sampler2DArray u_tb${i};`).join('\n');

// one block per tile slot: the tiles partition the world, so at most one of them contains the fragment
const slotBlocks = Array.from(
  { length: TILE_SLOTS },
  (_, i) => `
  if (!tileHit && u_tinfo[${i}].z > 0.5) {
    float lonRel = mod(lon - u_tinfo[${i}].x, 360.0);
    float latRel = u_tinfo[${i}].y - lat;
    if (lonRel < 45.0 && latRel >= 0.0 && latRel < 45.0) {
      tileHit = true;
      vec2 g = vec2(lonRel, latRel) / 0.125;
      ivec2 p0 = ivec2(floor(g));
      p0 = min(p0, ivec2(359));
      vec2 f = g - vec2(p0);
      tile = evalLevel(u_ta${i}, u_tb${i}, p0, p0 + ivec2(1, 0), p0 + ivec2(0, 1), p0 + ivec2(1, 1), f, tileC);
      vec4 e = u_tedge[${i}];
      tileW = mix(1.0, smoothstep(0.0, FEATHER, lonRel), e.x)
            * mix(1.0, smoothstep(0.0, FEATHER, 45.0 - lonRel), e.y)
            * mix(1.0, smoothstep(0.0, FEATHER, latRel), e.z)
            * mix(1.0, smoothstep(0.0, FEATHER, 45.0 - latRel), e.w);
    }
  }`,
).join('');

export const FIELD_FRAGMENT = `
#define FEATHER 2.0
in highp vec2 v_merc;
out vec4 fragColor;

uniform sampler2DArray u_oa;
uniform sampler2DArray u_ob;
${slotUniforms}
uniform sampler2D u_lut;
uniform vec4 u_tinfo[${TILE_SLOTS}];   // lon0, lat0, active, -
uniform vec4 u_tedge[${TILE_SLOTS}];   // 1 where the neighbour in W, E, N, S is missing (feather the edge)
uniform vec2 u_sca;                    // scale, offset of variable A
uniform vec2 u_scb;
uniform int u_l0;
uniform int u_l1;
uniform float u_tf;
uniform int u_mode;                    // 0 value, 1 magnitude (u,v → km/h), 2 humidity (T, Td → %), 3 feels (T, Td, u, v → °C)
uniform int u_ntl;                     // layers per variable in the packed samplers of mode 3
uniform int u_tk;                      // terrain correction of a value field: 0 none, 1 temperature, 2 dew point
uniform float u_terr_on;               // terrain correction available (and wanted)
uniform sampler2D u_terr;              // dT in K on a lon/lat rectangle, row 0 = north
uniform vec4 u_terr_rect;              // west, north, width, height (degrees)
uniform vec2 u_range;
uniform float u_opacity;
uniform vec4 u_contour;                // interval (0 = off), offset, width px, alpha
uniform vec4 u_contour2;               // major every n lines, major width factor, major alpha factor, -
uniform vec3 u_contour_color;

const int NODATA = -32768;

int q16(vec2 rg) {
  int lo = int(rg.r * 255.0 + 0.5);
  int hi = int(rg.g * 255.0 + 0.5);
  int q = lo | (hi << 8);
  return q >= 32768 ? q - 65536 : q;
}

// time-blended quantised value of one grid cell (variable voff of a packed sampler); ok = 0 when either step is nodata
float cellQ(sampler2DArray t, ivec2 p, int voff, out float ok) {
  int base = voff * u_ntl;
  int a = q16(texelFetch(t, ivec3(p, u_l0 + base), 0).rg);
  int b = u_tf > 0.0 ? q16(texelFetch(t, ivec3(p, u_l1 + base), 0).rg) : a;
  ok = (a != NODATA && b != NODATA) ? 1.0 : 0.0;
  return mix(float(a), float(b), u_tf);
}

vec4 cellQ4(sampler2DArray t, ivec2 c00, ivec2 c10, ivec2 c01, ivec2 c11, int voff, inout vec4 ok) {
  float k0, k1, k2, k3;
  vec4 q = vec4(cellQ(t, c00, voff, k0), cellQ(t, c10, voff, k1), cellQ(t, c01, voff, k2), cellQ(t, c11, voff, k3));
  ok *= vec4(k0, k1, k2, k3);
  return q;
}

// bilinear with nodata corners left out of the weights; result = the variables of the mode (physical units), cov = coverage
vec4 evalLevel(sampler2DArray ta, sampler2DArray tb, ivec2 c00, ivec2 c10, ivec2 c01, ivec2 c11, vec2 f, out float cov) {
  vec4 w = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
  vec4 ok = vec4(1.0);
  vec4 qa0 = cellQ4(ta, c00, c10, c01, c11, 0, ok);
  vec4 qa1 = vec4(0.0);
  vec4 qb0 = vec4(0.0);
  vec4 qb1 = vec4(0.0);
  if (u_mode != 0) qb0 = cellQ4(tb, c00, c10, c01, c11, 0, ok);
  if (u_mode == 3) {
    qa1 = cellQ4(ta, c00, c10, c01, c11, 1, ok);
    qb1 = cellQ4(tb, c00, c10, c01, c11, 1, ok);
  }
  vec4 wk = w * ok;
  float ws = wk.x + wk.y + wk.z + wk.w;
  cov = ws;
  if (ws < 1e-4) { cov = 0.0; return vec4(0.0); }
  float a0 = dot(wk, qa0) / ws * u_sca.x + u_sca.y;
  float b0 = dot(wk, qb0) / ws * u_scb.x + u_scb.y;
  if (u_mode == 3) return vec4(a0, dot(wk, qa1) / ws * u_sca.x + u_sca.y, b0, dot(wk, qb1) / ws * u_scb.x + u_scb.y);
  return vec4(a0, b0, 0.0, 0.0);
}

const float TD_RATIO = 0.002 / 0.0065;

float terrainK(float lon, float lat) {
  if (u_terr_on < 0.5) return 0.0;
  vec2 uv = vec2(mod(lon - u_terr_rect.x, 360.0) / u_terr_rect.z, (u_terr_rect.y - lat) / u_terr_rect.w);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture(u_terr, uv).r;
}

// twin of deriveField() in grid.ts
float derive(vec4 v, float lon, float lat) {
  if (u_mode == 1) return length(v.xy) * 3.6;
  float dT = (u_mode >= 2 || u_tk > 0) ? terrainK(lon, lat) : 0.0;
  if (u_mode == 0) return v.x + (u_tk == 1 ? dT : (u_tk == 2 ? dT * TD_RATIO : 0.0));
  float t = v.x + dT;
  float td = min(v.y + dT * TD_RATIO, t);
  if (u_mode == 2) {
    float rh = 100.0 * exp(17.625 * td / (243.04 + td) - 17.625 * t / (243.04 + t));
    return clamp(rh, 0.0, 100.0);
  }
  float rh = clamp(100.0 * exp(17.62 * td / (243.12 + td) - 17.62 * t / (243.12 + t)), 0.0, 100.0);
  float e = rh / 100.0 * 6.105 * exp(17.27 * t / (237.7 + t));
  return t + 0.33 * e - 0.7 * length(v.zw) - 4.0;
}

float contourLine(float v, out float major) {
  float x = (v - u_contour.y) / u_contour.x;
  float fw = max(fwidth(x), 1e-5);
  float n = floor(x + 0.5);
  float d = abs(x - n) / fw;
  major = (u_contour2.x > 0.5 && mod(n, u_contour2.x) == 0.0) ? 1.0 : 0.0;
  float half_w = 0.5 * u_contour.z * mix(1.0, u_contour2.y, major);
  float line = 1.0 - smoothstep(half_w - 0.5, half_w + 0.5, d);
  // lines closer than ~3 px dissolve instead of turning into moiré
  return line * (1.0 - smoothstep(0.25, 0.4, fw));
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  float lon = v_merc.x * 360.0 - 180.0;
  float lat = degrees(atan(sinh(3.141592653589793 * (1.0 - 2.0 * v_merc.y))));

  // tile (0.125°) where available
  bool tileHit = false;
  vec4 tile = vec4(0.0);
  float tileC = 0.0;
  float tileW = 0.0;
  ${slotBlocks}

  // overview (0.5°), longitude wraps
  vec4 ov = vec4(0.0);
  float ovC = 0.0;
  if (tileW < 0.999) {
    ivec2 osz = textureSize(u_oa, 0).xy;
    vec2 g = vec2(mod(lon + 180.0, 360.0) / 0.5, clamp((90.0 - lat) / 0.5, 0.0, float(osz.y - 1)));
    ivec2 p0 = ivec2(floor(g));
    p0.y = min(p0.y, osz.y - 2);
    vec2 f = g - vec2(p0);
    int x1 = p0.x + 1 >= osz.x ? 0 : p0.x + 1;
    ov = evalLevel(u_oa, u_ob, p0, ivec2(x1, p0.y), ivec2(p0.x, p0.y + 1), ivec2(x1, p0.y + 1), f, ovC);
  }

  // soft hand-over from overview to tile; where one has no data the other one speaks
  vec4 sv;
  float sc;
  if (tileC > 0.0 && ovC > 0.0) { sv = mix(ov, tile, tileW); sc = mix(ovC, tileC, tileW); }
  else if (tileC > 0.0) { sv = tile; sc = tileC; }
  else { sv = ov; sc = ovC; }
  float value = derive(sv, lon, lat);

  float cov = smoothstep(0.15, 0.6, sc);
  float t = clamp((value - u_range.x) / (u_range.y - u_range.x), 0.0, 1.0);
  vec4 col = texture(u_lut, vec2(t * (1.0 - 1.0 / 1024.0) + 0.5 / 1024.0, 0.5)) * (cov * u_opacity);

  if (u_contour.x > 0.0) {
    float major;
    float line = contourLine(value, major);
    float la = line * u_contour.w * mix(1.0, u_contour2.z, major) * cov * u_opacity;
    col = col * (1.0 - la) + vec4(u_contour_color * la, la);
  }
  // 1/255 of dither hides the last bit of banding on slow gradients
  col.rgb += (hash(gl_FragCoord.xy) - 0.5) / 255.0 * step(0.001, col.a);
  fragColor = col;
}`;
