import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLB_MODELS } from './aircraft-models';

// Loads one of the detailed aircraft models (see aircraft-models.ts) into the geometry convention of models.ts:
// x east, y nose, z up, metres, wheels at z = 0. The files are y up and nose towards +z, so the axes y and z swap and x flips
// (a proper rotation: the winding stays). One part per mesh primitive: each keeps its own material (textured or plain).

export interface GlbPart {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshLambertMaterial;
}

/** y up / nose +z → z up / nose +y, a rotation (determinant +1) */
const TO_MODEL = new THREE.Matrix4().set(-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

/** meshopt-quantised attributes are normalised integers; matrices need floats */
function floats(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): THREE.BufferAttribute {
  const out = new Float32Array(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++) {
    out[i * a.itemSize] = a.getX(i);
    out[i * a.itemSize + 1] = a.getY(i);
    if (a.itemSize > 2) out[i * a.itemSize + 2] = a.getZ(i);
  }
  return new THREE.BufferAttribute(out, a.itemSize);
}

export async function loadGlb(id: string): Promise<GlbPart[]> {
  const spec = GLB_MODELS[id];
  if (!spec) throw new Error(`unknown aircraft model ${id}`);
  const base = (import.meta.env?.VITE_ASSETS_BASE && String(import.meta.env.VITE_ASSETS_BASE).trim()) || 'https://orbis-assets.maltee.dev/';
  const root = base.endsWith('/') ? base : base + '/';
  const gltf = await loader.loadAsync(root + `models/aircraft/${spec.file}`);
  gltf.scene.updateMatrixWorld(true);
  const parts: GlbPart[] = [];
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.geometry;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', floats(src.getAttribute('position')));
    if (src.getAttribute('normal')) g.setAttribute('normal', floats(src.getAttribute('normal')));
    if (src.getAttribute('uv')) g.setAttribute('uv', floats(src.getAttribute('uv')));
    if (src.index) g.setIndex(src.index.clone());
    g.applyMatrix4(mesh.matrixWorld).applyMatrix4(TO_MODEL);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const m = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const material = new THREE.MeshLambertMaterial({ color: m.color ?? 0xffffff, map: m.map ?? null, side: THREE.DoubleSide });
    parts.push({ geometry: g, material });
    src.dispose();
    m.dispose();
  });
  return parts;
}
