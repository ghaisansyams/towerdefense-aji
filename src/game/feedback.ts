import type * as THREE from 'three';

/**
 * Transient "you can't build there" flash.
 *
 * Presentation only and single-instance, so unlike the shared-material cases
 * elsewhere this one can own its material and fade by opacity directly.
 */
export const invalidFlash = { x: 0, z: 0, t: 0 };

export const flashInvalid = (x: number, z: number) => {
  invalidFlash.x = x;
  invalidFlash.z = z;
  invalidFlash.t = 1;
};

export const flashNode: { mesh: THREE.Mesh | null } = { mesh: null };
