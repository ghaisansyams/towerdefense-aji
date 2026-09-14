import * as THREE from 'three';
import {
  ENEMIES,
  FX,
  HEALTH_BAR,
  type EnemyDef,
  type EnemyTypeId,
} from '../config/gameData';

/**
 * Shared enemy geometry + materials, allocated once.
 *
 * Health-bar colour is expressed as TWO materials that the loop swaps between,
 * not as one material whose colour it mutates: a single shared material would
 * make every bar on screen take the colour of whichever enemy was processed
 * last.
 */
/** one unit primitive per SHAPE, shared by every type that uses it */
const shapeGeo: Record<EnemyDef['shape'], THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cone: new THREE.ConeGeometry(0.5, 1, 14),
  sphere: new THREE.SphereGeometry(0.5, 12, 10),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
  /** hard-edged, for the boss */
  octa: new THREE.OctahedronGeometry(0.62, 0),
};

export const bodyGeo = Object.fromEntries(
  (Object.keys(ENEMIES) as EnemyTypeId[]).map((id) => [
    id,
    shapeGeo[ENEMIES[id].shape],
  ]),
) as Record<EnemyTypeId, THREE.BufferGeometry>;

export const bodyMat = Object.fromEntries(
  (Object.keys(ENEMIES) as EnemyTypeId[]).map((id) => [
    id,
    new THREE.MeshLambertMaterial({ color: ENEMIES[id].color }),
  ]),
) as Record<EnemyTypeId, THREE.MeshLambertMaterial>;

export const barGeo = new THREE.PlaneGeometry(HEALTH_BAR.width, HEALTH_BAR.height);

/**
 * All three bar materials are OPAQUE with depth testing off, layered by
 * renderOrder (bg 10, fill 11).
 *
 * renderOrder only sorts within a pass, so the bg and fill must share one.
 * Transparent was the obvious choice and it looked right, but it put 2 sorted
 * transparent quads on screen per enemy and cost ~10fps at 60 enemies. Opaque
 * + renderOrder gives identical layering for free; depthWrite is off so the
 * bars never disturb the depth buffer for anything drawn after them.
 */
export const barBgMat = new THREE.MeshBasicMaterial({
  color: HEALTH_BAR.bgColor,
  depthTest: false,
  depthWrite: false,
});

/**
 * Health-bar fills as a green -> red ramp of shared materials. The loop picks
 * the step matching the enemy's health; nothing is mutated, so one enemy's
 * damage can never recolour another's bar.
 */
export const barFillRamp = HEALTH_BAR.ramp.map(
  (c) =>
    new THREE.MeshBasicMaterial({
      color: c,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
);

/** ramp step for a health fraction (1 = full) */
export const rampFor = (frac: number) => {
  const i = Math.floor((1 - frac) * barFillRamp.length);
  return barFillRamp[Math.max(0, Math.min(barFillRamp.length - 1, i))];
};

/**
 * Heal pulse ring. Expanding is done by scale; the fade is done by SWAPPING
 * between a handful of shared materials at descending opacity — the same
 * trick the health bars use, so no per-healer material is ever allocated.
 */
export const pulseGeo = new THREE.RingGeometry(0.88, 1, 44);

export const pulseMats = FX.healPulseOpacity.map(
  (o) =>
    new THREE.MeshBasicMaterial({
      color: FX.healPulseColor,
      transparent: true,
      opacity: o,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
);
