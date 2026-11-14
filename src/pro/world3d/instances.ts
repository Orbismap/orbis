import * as THREE from 'three';
import type { GeoFrame, Vec3 } from './frame';

// Thousands of the same few models, drawn by the GPU in one go. Their matrices come from GeoFrame.place and are
// relative to the map centre of that moment; `update` shifts the group when the centre moved since, so the matrices
// do not have to be worked out anew in every frame. Colour per instance (the material's colour is white).

interface Slot {
  mesh: THREE.InstancedMesh;
  count: number;
}

export class GeoInstances {
  readonly object = new THREE.Group();
  private slots = new Map<string, Slot>();
  private base: Vec3 = [0, 0, 0];
  private capacity = 0;
  private colour = new THREE.Color();

  /** materials of single keys (models loaded later, with their own textures); the others use the shared one */
  private materials = new Map<string, THREE.Material>();

  constructor(
    private geometries: Record<string, THREE.BufferGeometry>,
    private material: THREE.Material = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
  ) {}

  /** A model that arrives after construction; owned from now on (disposed with the rest). */
  addGeometry(key: string, geometry: THREE.BufferGeometry, material?: THREE.Material) {
    this.geometries[key] = geometry;
    if (material) this.materials.set(key, material);
  }

  /** A new set of up to `count` objects, with matrices of this frame. */
  start(frame: GeoFrame, count: number) {
    this.base = [frame.origin[0], frame.origin[1], frame.origin[2]];
    if (count > this.capacity) {
      this.capacity = Math.ceil(count * 1.5) + 16;
      for (const slot of this.slots.values()) {
        this.object.remove(slot.mesh);
        slot.mesh.dispose();
      }
      this.slots.clear();
    }
    for (const slot of this.slots.values()) slot.count = 0;
  }

  add(key: string, matrix: THREE.Matrix4, color: number) {
    let slot = this.slots.get(key);
    if (!slot) {
      const geometry = this.geometries[key];
      if (!geometry) return;
      const mesh = new THREE.InstancedMesh(geometry, this.materials.get(key) ?? this.material, this.capacity);
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.object.add(mesh);
      slot = { mesh, count: 0 };
      this.slots.set(key, slot);
    }
    if (slot.count >= this.capacity) return;
    slot.mesh.setMatrixAt(slot.count, matrix);
    slot.mesh.setColorAt(slot.count, this.colour.set(color));
    slot.count++;
  }

  finish() {
    for (const { mesh, count } of this.slots.values()) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /** Total instances of the last set. */
  get count() {
    let n = 0;
    for (const s of this.slots.values()) n += s.count;
    return n;
  }

  /** Every frame: the matrices stay right when the map centre moved since they were worked out. */
  update(frame: GeoFrame) {
    const [b, o] = [this.base, frame.origin];
    for (const { mesh } of this.slots.values()) mesh.position.set(b[0] - o[0], b[1] - o[1], b[2] - o[2]);
  }

  dispose() {
    for (const { mesh } of this.slots.values()) mesh.dispose();
    for (const geometry of Object.values(this.geometries)) geometry.dispose();
    this.material.dispose();
    for (const m of this.materials.values()) m.dispose();
  }
}
