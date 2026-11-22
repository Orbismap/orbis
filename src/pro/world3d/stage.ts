import * as THREE from 'three';
import type { CustomLayerInterface, CustomRenderMethodInput, MapMouseEvent, Map as MlMap } from 'maplibre-gl';
import { GeoFrame, type Vec3 } from './frame';

// One custom layer and one three.js renderer for everything 3D on a map. Parts (aircraft today, ships or
// buildings tomorrow) register with the stage; it draws them together, in one pass, with one depth buffer.
//
// On the flat map the scene is drawn straight into the map, so the 2.5D buildings hide what is behind them. On
// the globe that does not work: MapLibre's depth buffer holds the distance to the horizon plane there instead of a
// real depth (globeComputeClippingZ). So on the globe the scene gets a framebuffer with a depth buffer of its own
// and is laid over the map afterwards; the globe itself hides things by a ray test (GeoFrame.occluded, the
// fragment shader of GeoLine) and by an invisible sphere in that depth buffer.
//
// The stage renders only when something changes: MapLibre calls `render` for camera moves and style changes, and a
// part that animates answers `update` with true, which schedules the next frame (full rate while the camera
// moves, ~20 fps otherwise; never while the tab is hidden).

export const STAGE_LAYER_ID = 'orbis-stage';

/** Something drawn on the stage. */
export interface StagePart {
  readonly object: THREE.Object3D;
  /** Called every frame before drawing. True: it animates, keep the map repainting. */
  update(frame: GeoFrame, now: number): boolean | void;
  /** What is at a screen point (CSS px): an id of this part, or null. Only called while the object is visible. */
  pick?(frame: GeoFrame, x: number, y: number): string | null;
  /** A click (tap) hit `id`. */
  click?(id: string): void;
  /** The pointer is over `id` (null: over nothing of this part). */
  hover?(id: string | null): void;
  /** Where object `id` is now [lon, lat, altitude m], null: unknown. A part that has this can be followed. */
  positionOf?(id: string): Vec3 | null;
  /** Brings the displayed state to `now`; the follow camera calls it before `positionOf`, the stage then draws the same instant. */
  step?(now: number): void;
  /** The camera follows `id` (null: nothing is followed any more); the part may keep its label visible. */
  setFollowed?(id: string | null): void;
  /**
   * True while the part draws the ground itself (streamed 3D tiles of a city): the stage then draws everything into its own
   * framebuffer and lays it over the map, so the map below is only the fallback where nothing has loaded yet. Without that the
   * tiles and the map's ground would fight over the depth buffer at every height difference.
   */
  coversMap?(): boolean;
  /** Numbers for the test hook. */
  stats?(): Record<string, number>;
  dispose?(): void;
}

/** What the follow camera does with clicks (see follow.ts). */
export interface ClickGate {
  /** The click belongs to a drag: nobody reacts to it. */
  readonly wasDrag: boolean;
  /** Called before the part gets the click, so a switch of the followed object comes before the selection changes. */
  retarget(part: StagePart, id: string): void;
}

// Light and shadow. The sun stands in the south-west, 46° high (seen from the usual camera, looking north, it lights the south walls and
// the roof slopes that face south, the others stay darker: that is what shows the structure of a roof). The flat map gets real shadows
// (one shadow map around the map centre, cast and received by what sets `castShadow` / `receiveShadow`: buildings, landmark models), so
// steps and ridges throw shadows on the roofs and walls behind them. The ground is the map's own and receives none. The globe keeps the
// light from the camera's side (no fixed sun fits a sphere) and has no shadows.
/** where the sun is, as a direction in render space (x east, y SOUTH, z up) */
const SUN_DIR = new THREE.Vector3(-0.49, 0.49, 0.72);
const AMBIENT = 1.0;
const SUN = 2.7;
const SHADOW_MAP = 2048;
/** the shadow map covers this many metres at most around the map centre (a half side) */
const SHADOW_MAX_M = 1200;

/** how often the cursor looks for something below it (ms): when the mouse moves, and when only the objects do */
const HOVER_MOVE_MS = 40;
const HOVER_FRAME_MS = 120;
/** while only the objects move (the camera rests), this frame time is enough (ms) */
const IDLE_FRAME_MS = 50;

const COMPOSITE_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;
// the framebuffer is linear and premultiplied, the map's canvas sRGB and premultiplied
const COMPOSITE_FRAGMENT = `
uniform sampler2D uTex;
varying vec2 vUv;
vec3 encode(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  vec4 c = texture2D(uTex, vUv);
  if (c.a <= 0.0) discard;
  gl_FragColor = vec4(encode(c.rgb / c.a) * c.a, c.a);
}`;

export class Stage implements CustomLayerInterface {
  readonly id = STAGE_LAYER_ID;
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;
  /** the frame drawn last, for labels and picking between two frames */
  frame: GeoFrame | null = null;
  /** set: the time parts are drawn at, so that a moving focus and the camera following it agree exactly */
  clock: number | null = null;
  /** set by the follow camera */
  clicks: ClickGate | null = null;
  private renderer?: THREE.WebGLRenderer;
  private target?: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private sun = new THREE.DirectionalLight(0xffffff, SUN);
  private overlay = new THREE.Scene();
  private overlayMat = new THREE.ShaderMaterial({
    vertexShader: COMPOSITE_VERTEX,
    fragmentShader: COMPOSITE_FRAGMENT,
    uniforms: { uTex: { value: null } },
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  /** an invisible Earth in the depth buffer: what is behind the horizon is hidden per pixel */
  private earth = new THREE.Mesh(new THREE.SphereGeometry(0.998, 64, 48), new THREE.MeshBasicMaterial({ colorWrite: false }));
  private parts: StagePart[] = [];
  private mouse: { x: number; y: number } | null = null;
  private hovering = new Map<StagePart, string | null>();
  private lastHover = 0;
  private repaintTimer = 0;
  private frames = 0;
  /** the stage sits below the data layers (see lower) */
  private lowered = false;

  /** `place(true)`: below the data layers, `place(false)`: on top of the points slot. Given by the host (it knows the layer stack). */
  constructor(private map: MlMap, private place: (belowData: boolean) => void = () => {}) {
    this.scene.add(new THREE.AmbientLight(0xffffff, AMBIENT), this.sun, this.sun.target);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    this.sun.shadow.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.earth.renderOrder = -1;
    this.earth.frustumCulled = false;
    this.scene.add(this.earth);
    const triangle = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const cover = new THREE.Mesh(triangle, this.overlayMat);
    cover.frustumCulled = false;
    this.overlay.add(cover);
  }

  add(part: StagePart) {
    this.parts.push(part);
    this.scene.add(part.object);
    this.map.triggerRepaint();
  }

  remove(part: StagePart) {
    this.parts = this.parts.filter((p) => p !== part);
    this.scene.remove(part.object);
    part.dispose?.();
    this.map.triggerRepaint();
  }

  /** Something changed that is not the camera (new data, selection): draw once more. */
  wake() {
    this.map.triggerRepaint();
  }

  /** Numbers for the test hook: frames drawn so far, and what each part reports. */
  stats(): Record<string, number> {
    const out: Record<string, number> = { frames: this.frames, parts: this.parts.length, globe: this.frame?.globe ? 1 : 0 };
    for (const p of this.parts) Object.assign(out, p.stats?.());
    return out;
  }

  onAdd(map: MlMap, gl: WebGL2RenderingContext) {
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    map.on('mousemove', this.onMouseMove);
    map.on('mouseout', this.onMouseOut);
    map.on('click', this.onClick);
  }

  onRemove() {
    clearTimeout(this.repaintTimer);
    this.repaintTimer = 0;
    this.map.off('mousemove', this.onMouseMove);
    this.map.off('mouseout', this.onMouseOut);
    this.map.off('click', this.onClick);
    this.onMouseOut();
    this.target?.dispose();
    this.target = undefined;
    this.overlayMat.dispose();
    this.earth.geometry.dispose();
    (this.earth.material as THREE.Material).dispose();
    this.renderer?.dispose();
    this.renderer = undefined;
    for (const p of this.parts) p.dispose?.();
    this.parts = [];
  }

  render(_gl: WebGL2RenderingContext, args: CustomRenderMethodInput) {
    const renderer = this.renderer;
    if (!renderer) return;
    const canvas = this.map.getCanvas();
    const pd = args.defaultProjectionData;
    const frame = new GeoFrame({
      mainMatrix: pd.mainMatrix as ArrayLike<number>,
      fallbackMatrix: pd.fallbackMatrix as ArrayLike<number>,
      transition: pd.projectionTransition,
      center: this.map.getCenter(),
      fov: args.fov,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      ratio: canvas.width / canvas.clientWidth,
    });
    this.frame = frame;
    const now = this.clock ?? performance.now();
    let moving = false;
    for (const p of this.parts) if (p.update(frame, now)) moving = true;
    this.lower(this.parts.some((p) => p.object.visible && p.coversMap?.()));
    // nothing to draw: no framebuffer and no pass over the whole screen
    if (this.parts.some((p) => p.object.visible)) {
      this.draw(renderer, frame, canvas);
      this.frames++;
    }
    if (this.mouse && performance.now() - this.lastHover > HOVER_FRAME_MS) this.updateHover();
    if (moving && !document.hidden) this.repaint();
  }

  private draw(renderer: THREE.WebGLRenderer, frame: GeoFrame, canvas: HTMLCanvasElement) {
    this.camera.projectionMatrix.copy(frame.proj);
    this.earth.visible = frame.t >= 1;
    this.earth.position.set(-frame.origin[0], -frame.origin[1], -frame.origin[2]);
    // the light comes from the camera's side: on a sphere no fixed direction lights all models
    if (frame.globe) {
      this.sun.castShadow = false;
      this.sun.position.set(frame.camera[0] - frame.origin[0], frame.camera[1] - frame.origin[1], frame.camera[2] - frame.origin[2]);
    }
    else this.aimSun(frame);

    // three.js and MapLibre each cache GL state: three starts from scratch, MapLibre resets its own after custom layers
    renderer.resetState();
    renderer.setViewport(0, 0, canvas.width, canvas.height);
    // on the globe the depth buffer is no real depth, and where a part brings its own ground it must not compete with the map's
    if (frame.globe || this.parts.some((p) => p.object.visible && p.coversMap?.())) {
      const target = this.renderTarget(canvas.width, canvas.height);
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);
      renderer.render(this.scene, this.camera);
      renderer.setRenderTarget(null);
      this.overlayMat.uniforms.uTex!.value = target.texture;
      renderer.render(this.overlay, this.camera);
    } else {
      renderer.setRenderTarget(null);
      renderer.render(this.scene, this.camera);
    }
  }

  /**
   * The sun of the flat map and its shadow map: a box around the map centre that is as wide as the view (at most SHADOW_MAX_M), seen from
   * the sun. The render space is mercator, `k` render units to the metre, so the shadow camera is worked out in metres and scaled by k.
   */
  private aimSun(frame: GeoFrame) {
    const k = frame.basis(this.map.getCenter().lng, this.map.getCenter().lat).up[2];
    const half = Math.min(SHADOW_MAX_M, Math.max(60, (frame.centreMetresPerPixel * Math.max(frame.width, frame.height)) * 0.6));
    const dist = half * 1.2;
    this.sun.position.copy(SUN_DIR).normalize().multiplyScalar(dist * k);
    this.sun.target.position.set(0, 0, 0);
    this.sun.target.updateMatrixWorld();
    const cam = this.sun.shadow.camera as THREE.OrthographicCamera;
    cam.left = -half * k; cam.right = half * k; cam.top = half * k; cam.bottom = -half * k;
    cam.near = 0.5 * k;
    cam.far = (dist + half * 1.5) * k;
    cam.updateProjectionMatrix();
    // a texel is 2 * half / SHADOW_MAP metres; the surface is moved back by about one and a half of them against the stripes of self-shadowing
    this.sun.shadow.normalBias = ((2 * half) / SHADOW_MAP) * 1.5 * k;
    this.sun.shadow.bias = -0.00005;
    this.sun.castShadow = true;
  }

  /**
   * Where the stage sits in the layer stack. Normally on top of the points slot (aircraft and the like above the data). Where a
   * part brings the ground (3D tiles), the stage moves down to just above the raster slot, so the data layers (areas, lines,
   * points, labels) are drawn over the ground and not hidden by it; the 3D objects stay with the ground in the same depth buffer.
   * The move happens after the frame (a layer is not moved while the map is drawing).
   */
  private lower(on: boolean) {
    if (on === this.lowered) return;
    this.lowered = on;
    queueMicrotask(() => {
      if (!this.map.getLayer(this.id)) return;
      this.place(on);
      this.map.triggerRepaint();
    });
  }

  /** The next frame for moving objects; the map draws at full rate anyway while the camera moves. */
  private repaint() {
    if (this.map.isMoving()) {
      this.map.triggerRepaint();
    } else if (!this.repaintTimer) {
      this.repaintTimer = window.setTimeout(() => {
        this.repaintTimer = 0;
        this.map.triggerRepaint();
      }, IDLE_FRAME_MS);
    }
  }

  private onMouseMove = (e: MapMouseEvent) => {
    this.mouse = e.originalEvent.buttons ? null : { x: e.point.x, y: e.point.y };
    if (!this.mouse) this.setHover(null, null);
    else if (performance.now() - this.lastHover > HOVER_MOVE_MS) this.updateHover();
  };

  private onMouseOut = () => {
    this.mouse = null;
    this.setHover(null, null);
  };

  private onClick = (e: MapMouseEvent) => {
    if (this.clicks?.wasDrag) return;
    const hit = this.pick(e.point.x, e.point.y);
    if (!hit) return;
    this.clicks?.retarget(hit.part, hit.id);
    hit.part.click?.(hit.id);
  };

  /** The part and id at a screen point (CSS px); parts in the order they were added, the last one on top. */
  pick(x: number, y: number): { part: StagePart; id: string } | null {
    const frame = this.frame;
    if (!frame) return null;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const part = this.parts[i]!;
      if (!part.object.visible) continue;
      const id = part.pick?.(frame, x, y);
      if (id) return { part, id };
    }
    return null;
  }

  private updateHover() {
    this.lastHover = performance.now();
    const hit = this.mouse ? this.pick(this.mouse.x, this.mouse.y) : null;
    this.setHover(hit?.part ?? null, hit?.id ?? null);
  }

  private setHover(part: StagePart | null, id: string | null) {
    for (const p of this.parts) {
      const was = this.hovering.get(p) ?? null;
      const now = p === part ? id : null;
      if (was === now) continue;
      this.hovering.set(p, now);
      p.hover?.(now);
    }
    // On the container, not the canvas: the app sets and clears the canvas' cursor for its own layers.
    this.map.getCanvasContainer().style.cursor = part ? 'pointer' : '';
  }

  private renderTarget(w: number, h: number) {
    if (!this.target) {
      this.target = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.HalfFloatType,
        samples: 4,
        depthBuffer: true,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        generateMipmaps: false,
      });
    } else if (this.target.width !== w || this.target.height !== h) {
      this.target.setSize(w, h);
    }
    return this.target;
  }
}
