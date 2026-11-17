import * as THREE from 'three';
import { toMercator, toUnit, type GeoFrame, type Vec3 } from '../world3d/frame';
import { anchorUniforms, BEHIND_GLOBE_GLSL, BLEND_GLSL, setAnchor } from '../world3d/line';

// All wires of the power grid in ONE mesh (many wires would be many draw calls as single GeoLine objects). Each segment
// is a screen-space quad carrying both endpoints on the sphere and in mercator, blended like the map, so the wires stay
// right through the globe transition without being rebuilt. The wires themselves (sag, insulator points) come from network.ts.

/** Thickness of a wire in the world (m, exaggerated: a real one is a few centimetres): seen in perspective, near wires are thicker. */
const WIRE_M = 0.22;
/** limits of the width on screen (CSS px): far wires stay visible, near ones do not turn into ribbons */
const MIN_PX = 0.6;
const MAX_PX = 3.5;
const OPACITY = 0.9;

const VERTEX = `
attribute vec3 aGlobeStart;
attribute vec3 aGlobeEnd;
attribute vec3 aMercStart;
attribute vec3 aMercEnd;
attribute vec2 aCorner;
attribute vec3 aColor;
uniform vec2 uRes;
uniform float uK; // width on screen = uK / depth
uniform vec2 uLimit;
varying vec3 vSphere;
varying vec3 vColor;
${BLEND_GLSL}
void main() {
  vec4 cs = blend(aGlobeStart, aMercStart);
  vec4 ce = blend(aGlobeEnd, aMercEnd);
  vSphere = mix(aGlobeStart, aGlobeEnd, aCorner.x);
  vColor = aColor;
  if (cs.w <= 0.0 || ce.w <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec2 d = (ce.xy / ce.w - cs.xy / cs.w) * uRes;
  float len = length(d);
  vec2 dir = len > 0.0001 ? d / len : vec2(1.0, 0.0);
  vec4 c = mix(cs, ce, aCorner.x);
  float width = clamp(uK / c.w, uLimit.x, uLimit.y);
  c.xy += vec2(-dir.y, dir.x) * aCorner.y * width / uRes * c.w;
  gl_Position = c;
}`;
const FRAGMENT = `
uniform float uOpacity;
varying vec3 vSphere;
varying vec3 vColor;
${BEHIND_GLOBE_GLSL}
void main() {
  if (behindGlobe(vSphere)) discard;
  gl_FragColor = vec4(vColor, uOpacity);
  #include <colorspace_fragment>
}`;

/** One wire to draw: points [lon, lat, altitude m] and a colour. */
export interface DrawWire {
  points: readonly (readonly [number, number, number])[];
  rgb: readonly [number, number, number];
}

export class WireMesh {
  readonly object: THREE.Mesh;
  private u = { ...anchorUniforms(), uRes: { value: new THREE.Vector2(1, 1) }, uK: { value: 0 }, uLimit: { value: new THREE.Vector2(MIN_PX, MAX_PX) }, uOpacity: { value: OPACITY } };
  private material: THREE.ShaderMaterial;
  private anchorUnit: Vec3 = [0, 0, 1];
  private anchorMerc: Vec3 = [0, 0, 0];
  private count = 0;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: this.u,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.object = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.object.matrixAutoUpdate = false;
    this.object.frustumCulled = false;
    this.object.renderOrder = 2;
    this.object.visible = false;
  }

  /** Rebuilds the whole mesh. The geometry is relative to the first point, so it keeps its precision over a few kilometres. */
  setWires(wires: readonly DrawWire[]) {
    const first = wires[0]?.points[0];
    this.object.geometry.dispose();
    if (!first) {
      this.count = 0;
      this.object.geometry = new THREE.BufferGeometry();
      this.object.visible = false;
      return;
    }
    this.anchorUnit = toUnit(first[0], first[1], 0);
    this.anchorMerc = toMercator(first[0], first[1], 0);
    const [aU, aM] = [this.anchorUnit, this.anchorMerc];

    let segs = 0;
    for (const w of wires) segs += Math.max(0, w.points.length - 1);
    const g = new THREE.BufferGeometry();
    const vec = (size: number) => new THREE.BufferAttribute(new Float32Array(segs * 4 * size), size);
    const [gs, ge, ms, me, rgba] = [vec(3), vec(3), vec(3), vec(3), vec(3)];
    const corner = new Float32Array(segs * 8);
    const index = new Uint32Array(segs * 6);
    let i = 0;
    for (const w of wires) {
      const rel = w.points.map(([lng, lat, alt]) => {
        const [u, m] = [toUnit(lng, lat, alt), toMercator(lng, lat, alt)];
        return { u: [u[0] - aU[0], u[1] - aU[1], u[2] - aU[2]] as Vec3, m: [m[0] - aM[0], m[1] - aM[1], m[2] - aM[2]] as Vec3 };
      });
      for (let k = 1; k < rel.length; k++, i++) {
        const [a, b] = [rel[k - 1]!, rel[k]!];
        for (let v = 0; v < 4; v++) {
          const at = i * 4 + v;
          gs.setXYZ(at, a.u[0], a.u[1], a.u[2]);
          ge.setXYZ(at, b.u[0], b.u[1], b.u[2]);
          ms.setXYZ(at, a.m[0], a.m[1], a.m[2]);
          me.setXYZ(at, b.m[0], b.m[1], b.m[2]);
          rgba.setXYZ(at, w.rgb[0], w.rgb[1], w.rgb[2]);
          corner.set([v >> 1, v & 1 ? 1 : -1], at * 2);
        }
        index.set([0, 1, 2, 2, 1, 3].map((n) => i * 4 + n), i * 6);
      }
    }
    g.setAttribute('position', gs);
    g.setAttribute('aGlobeStart', gs);
    g.setAttribute('aGlobeEnd', ge);
    g.setAttribute('aMercStart', ms);
    g.setAttribute('aMercEnd', me);
    g.setAttribute('aColor', rgba);
    g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    this.object.geometry = g;
    this.count = segs;
    this.object.visible = segs > 0;
  }

  /** Sets the anchor uniforms for this frame; the geometry itself does not change with the camera. */
  update(frame: GeoFrame) {
    if (!this.object.visible) return;
    const px = frame.pixels;
    this.u.uRes.value.set(px[0], px[1]);
    const ratio = px[0] / frame.width;
    // pixels at the map centre, scaled by (depth of the centre / depth here): a perspective width
    this.u.uK.value = (WIRE_M / frame.centreMetresPerPixel) * frame.centreDepth * ratio;
    this.u.uLimit.value.set(MIN_PX * ratio, MAX_PX * ratio);
    setAnchor(this.u, frame, this.anchorUnit, this.anchorMerc);
  }

  get segments() {
    return this.count;
  }

  dispose() {
    this.object.geometry.dispose();
    this.material.dispose();
  }
}
