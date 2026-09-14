import * as THREE from 'three';
import { PARTICLES } from '../config/gameData';

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** seconds remaining */
  life: number;
  max: number;
  size: number;
  cr: number; cg: number; cb: number;
  gravity: number;
  drag: number;
}

const blank = (): P => ({
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
  life: 0, max: 1, size: 1, cr: 1, cg: 1, cb: 1, gravity: 0, drag: 0,
});

/**
 * Two fixed pools with live particles compacted to the front, so a frame only
 * touches particles that actually exist. Emitting past the cap silently drops
 * the extra rather than allocating.
 */
class Pool {
  items: P[];
  live = 0;
  constructor(max: number) {
    this.items = Array.from({ length: max }, blank);
  }
  spawn(): P | null {
    if (this.live >= this.items.length) return null;
    return this.items[this.live++];
  }
  /** integrate, then swap-remove anything that expired */
  step(dt: number) {
    for (let i = 0; i < this.live; i++) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) {
        const last = this.items[--this.live];
        this.items[this.live] = p;
        this.items[i] = last;
        i--;
        continue;
      }
      const k = 1 - Math.min(1, p.drag * dt);
      p.vx *= k;
      p.vz *= k;
      p.vy = p.vy * k + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
  }
}

export const sparkPool = new Pool(PARTICLES.maxSparks);
export const cubePool = new Pool(PARTICLES.maxCubes);

/** InstancedMeshes registered by <Particles> */
export const particleNodes: {
  spark: THREE.InstancedMesh | null;
  cube: THREE.InstancedMesh | null;
} = { spark: null, cube: null };

const tmpColor = new THREE.Color();

function burst(
  pool: Pool,
  cfg: { count: number; speed: number; life: number; size: number; gravity: number; drag: number },
  x: number, y: number, z: number,
  color: string,
) {
  tmpColor.set(color);
  for (let i = 0; i < cfg.count; i++) {
    const p = pool.spawn();
    if (!p) return;             // pool full: drop the rest
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(1 - Math.random() * 1.25);   // biased upward
    const sp = cfg.speed * (0.55 + Math.random() * 0.7);
    p.x = x; p.y = y; p.z = z;
    p.vx = Math.sin(phi) * Math.cos(theta) * sp;
    p.vy = Math.abs(Math.cos(phi)) * sp;
    p.vz = Math.sin(phi) * Math.sin(theta) * sp;
    p.max = p.life = cfg.life * (0.7 + Math.random() * 0.6);
    p.size = cfg.size * (0.7 + Math.random() * 0.7);
    p.cr = tmpColor.r; p.cg = tmpColor.g; p.cb = tmpColor.b;
    p.gravity = cfg.gravity;
    p.drag = cfg.drag;
  }
}

export const emitSparks = (x: number, y: number, z: number, color: string) =>
  burst(sparkPool, PARTICLES.spark, x, y, z, color);

export const emitDeath = (x: number, y: number, z: number, color: string) =>
  burst(cubePool, PARTICLES.death, x, y, z, color);

const m = new THREE.Matrix4();
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const scl = new THREE.Vector3();

function draw(pool: Pool, mesh: THREE.InstancedMesh | null) {
  if (!mesh) return;
  for (let i = 0; i < pool.live; i++) {
    const p = pool.items[i];
    const t = p.life / p.max;               // 1 -> 0
    const s = p.size * (0.35 + t * 0.65);
    pos.set(p.x, p.y, p.z);
    scl.set(s, s, s);
    mesh.setMatrixAt(i, m.compose(pos, quat, scl));
    // additive material: fading the colour toward black IS the fade-out,
    // which avoids a per-particle material or a custom shader
    mesh.setColorAt(i, tmpColor.setRGB(p.cr * t, p.cg * t, p.cb * t));
  }
  mesh.count = pool.live;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/** advance and redraw every particle; called once per frame by GameLoop */
export function stepParticles(dt: number) {
  sparkPool.step(dt);
  cubePool.step(dt);
  draw(sparkPool, particleNodes.spark);
  draw(cubePool, particleNodes.cube);
}
