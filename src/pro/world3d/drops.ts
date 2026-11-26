import * as THREE from 'three';

// Thin plumb lines from things in the air down to the ground, all in one draw call. The positions are in render space
// (GeoFrame.position), six numbers per line, and set anew in every frame.

export class DropLines {
  private mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
  readonly object = new THREE.LineSegments(new THREE.BufferGeometry(), this.mat);
  private capacity = 0;

  constructor() {
    this.object.frustumCulled = false;
    this.object.renderOrder = 2;
  }

  set(pos: number[]) {
    const g = this.object.geometry;
    if (pos.length > this.capacity * 3) {
      g.dispose();
      this.capacity = Math.ceil(pos.length / 3 * 1.5) + 64;
      this.object.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.capacity * 3), 3).setUsage(THREE.DynamicDrawUsage));
    }
    const attr = this.object.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!attr) return;
    (attr.array as Float32Array).set(pos);
    attr.needsUpdate = true;
    this.object.geometry.setDrawRange(0, pos.length / 3);
  }

  dispose() {
    this.object.geometry.dispose();
    this.mat.dispose();
  }
}
