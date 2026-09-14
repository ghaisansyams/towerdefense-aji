import * as THREE from 'three';
import { DAMAGE_TEXT } from '../config/gameData';

export type DamageKind = 'hit' | 'splash' | 'poison';

interface D {
  x: number; y: number; z: number;
  vy: number;
  life: number;
  max: number;
  amount: number;
  kind: DamageKind;
}

/**
 * Floating damage numbers, drawn as pooled DOM spans rather than 3D text.
 *
 * troika text meshes would mean a geometry build per number; a fixed pool of
 * absolutely-positioned spans costs a transform write per frame instead, and
 * stays crisp at any zoom. The pool is a hard cap — extra hits simply do not
 * get a number.
 */
/** scratch vector reused for every projection */
const _v = new THREE.Vector3();

const pool: D[] = Array.from({ length: DAMAGE_TEXT.max }, () => ({
  x: 0, y: 0, z: 0, vy: 0, life: 0, max: 1, amount: 0, kind: 'hit',
}));
let live = 0;

/** spans registered by <DamageNumbers> */
export const dmgNodes: HTMLElement[] = [];

export function emitDamage(
  x: number, y: number, z: number,
  amount: number,
  kind: DamageKind = 'hit',
) {
  if (amount < DAMAGE_TEXT.minAmount) return;
  if (live >= pool.length) return;          // pool full: drop it
  const d = pool[live++];
  d.x = x + (Math.random() - 0.5) * 0.22;
  d.y = y;
  d.z = z + (Math.random() - 0.5) * 0.22;
  d.vy = DAMAGE_TEXT.rise;
  d.max = d.life = DAMAGE_TEXT.life;
  d.amount = amount;
  d.kind = kind;
}

/** advance, project to screen, and write straight into the pooled spans */
export function stepDamageNumbers(
  dt: number,
  camera: THREE.Camera,
  width: number,
  height: number,
) {
  for (let i = 0; i < live; i++) {
    const d = pool[i];
    d.life -= dt;
    if (d.life <= 0) {
      const last = pool[--live];
      pool[live] = d;
      pool[i] = last;
      i--;
      continue;
    }
    d.y += d.vy * dt;
    d.vy *= 1 - Math.min(1, DAMAGE_TEXT.drag * dt);
  }

  for (let i = 0; i < dmgNodes.length; i++) {
    const el = dmgNodes[i];
    if (i >= live) {
      if (el.style.opacity !== '0') el.style.opacity = '0';
      continue;
    }
    const d = pool[i];
    // project world -> normalised device -> pixels
    const v = _v.set(d.x, d.y, d.z).project(camera);
    if (v.z > 1) { el.style.opacity = '0'; continue; }
    const t = d.life / d.max;
    el.textContent = String(Math.max(1, Math.round(d.amount)));
    el.style.transform =
      `translate3d(${((v.x * 0.5 + 0.5) * width).toFixed(1)}px,` +
      `${((-v.y * 0.5 + 0.5) * height).toFixed(1)}px,0) ` +
      `scale(${(0.82 + t * 0.3).toFixed(2)})`;
    el.style.opacity = String(Math.min(1, t * 1.8).toFixed(2));
    el.style.color = DAMAGE_TEXT.colors[d.kind];
  }
}
