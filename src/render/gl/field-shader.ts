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
      tile = evalLevel(u_ta${i}, u_tb${i}, p0, p0 + ivec2(1, 0), p0 + ivec2(0, 1), p0 + ivec2(1, 1), f);
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
uniform int u_mode;                    // 0 value, 1 magnitude (u,v → km/h), 2 humidity (T, Td → %)
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

// time-blended quantised value of one grid cell; ok = 0 when either step is nodata
float cellQ(sampler2DArray t, ivec2 p, out float ok) {
  int a = q16(texelFetch(t, ivec3(p, u_l0), 0).rg);
  int b = u_tf > 0.0 ? q16(texelFetch(t, ivec3(p, u_l1), 0).rg) : a;
  ok = (a != NODATA && b != NODATA) ? 1.0 : 0.0;
  return mix(float(a), float(b), u_tf);
}

// bilinear with nodata corners left out of the weights; xyz = value A, value B, coverage
vec3 evalLevel(sampler2DArray ta, sampler2DArray tb, ivec2 c00, ivec2 c10, ivec2 c01, ivec2 c11, vec2 f) {
  vec4 w = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
  float ok0, ok1, ok2, ok3;
  vec4 qa = vec4(cellQ(ta, c00, ok0), cellQ(ta, c10, ok1), cellQ(ta, c01, ok2), cellQ(ta, c11, ok3));
  vec4 ok = vec4(ok0, ok1, ok2, ok3);
  vec4 qb = vec4(0.0);
  if (u_mode != 0) {
    float k0, k1, k2, k3;
    qb = vec4(cellQ(tb, c00, k0), cellQ(tb, c10, k1), cellQ(tb, c01, k2), cellQ(tb, c11, k3));
    ok *= vec4(k0, k1, k2, k3);
  }
  vec4 wk = w * ok;
  float ws = wk.x + wk.y + wk.z + wk.w;
  if (ws < 1e-4) return vec3(0.0);
  return vec3(dot(wk, qa) / ws * u_sca.x + u_sca.y, dot(wk, qb) / ws * u_scb.x + u_scb.y, ws);
}

float derive(vec2 ab) {
  if (u_mode == 1) return length(ab) * 3.6;
  if (u_mode == 2) {
    float rh = 100.0 * exp(17.625 * ab.y / (243.04 + ab.y) - 17.625 * ab.x / (243.04 + ab.x));
    return clamp(rh, 0.0, 100.0);
  }
  return ab.x;
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
  vec3 tile = vec3(0.0);
  float tileW = 0.0;
  ${slotBlocks}

  // overview (0.5°), longitude wraps
  vec3 ov = vec3(0.0);
  if (tileW < 0.999) {
    ivec2 osz = textureSize(u_oa, 0).xy;
    vec2 g = vec2(mod(lon + 180.0, 360.0) / 0.5, clamp((90.0 - lat) / 0.5, 0.0, float(osz.y - 1)));
    ivec2 p0 = ivec2(floor(g));
    p0.y = min(p0.y, osz.y - 2);
    vec2 f = g - vec2(p0);
    int x1 = p0.x + 1 >= osz.x ? 0 : p0.x + 1;
    ov = evalLevel(u_oa, u_ob, p0, ivec2(x1, p0.y), ivec2(p0.x, p0.y + 1), ivec2(x1, p0.y + 1), f);
  }

  // soft hand-over from overview to tile; where one has no data the other one speaks
  vec3 s;
  if (tile.z > 0.0 && ov.z > 0.0) s = mix(ov, tile, tileW);
  else if (tile.z > 0.0) s = tile;
  else s = ov;
  float value = derive(s.xy);

  float cov = smoothstep(0.15, 0.6, s.z);
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
