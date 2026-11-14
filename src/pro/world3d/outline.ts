import * as THREE from 'three';

// Outline of a selected object by the inverted hull technique: the same geometry drawn once more, back faces only,
// every vertex pushed out along its normal by a width that is constant on screen.

/**
 * The shapes for an outline: normals averaged over the corners that share a place, so that pushing every vertex out
 * along its normal keeps hard edges closed. The stored normals are used, not the winding: mirrored parts have the
 * opposite winding.
 */
export function hull(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  const key = (i: number) => `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
  const sums = new Map<string, THREE.Vector3>();
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const s = sums.get(k) ?? sums.set(k, new THREE.Vector3()).get(k)!;
    s.x += nor.getX(i);
    s.y += nor.getY(i);
    s.z += nor.getZ(i);
  }
  const out = g.clone();
  const n = out.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const s = sums.get(key(i))!.clone().normalize();
    n.setXYZ(i, s.x, s.y, s.z);
  }
  return out;
}

/** One outline geometry per model (see `hull`); the caller owns them, the sources are disposed. */
export function hullsOf<K extends string>(models: Record<K, THREE.BufferGeometry>): Record<K, THREE.BufferGeometry> {
  const out = {} as Record<K, THREE.BufferGeometry>;
  for (const k of Object.keys(models) as K[]) {
    out[k] = hull(models[k]);
    models[k].dispose();
  }
  return out;
}

/** The outline's material: `width.value` is the offset in model units (the instance matrix scales it with the model). */
export function outlineMaterial(width: { value: number }, color: number): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = width;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float uOutline;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normal * uOutline;');
  };
  return mat;
}
