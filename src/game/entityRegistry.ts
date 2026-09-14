import type { Group, Mesh } from 'three';

/**
 * Three.js nodes for a live enemy, registered by <Enemy> on mount.
 *
 * GameLoop writes transforms straight into these objects instead of routing
 * positions through React state — that is what keeps 50 moving enemies at
 * 60fps. Deliberately a plain module-level Map: these are non-serialisable
 * scene objects and must never trigger a re-render.
 */
export interface EnemyNodes {
  root: Group;
  /** the body mesh; its material is swapped for a fading clone on death */
  body: Mesh;
  bar: Group;
  fill: Mesh;
  /** healers only: the expanding area-heal ring */
  pulse: Mesh | null;
}

export const enemyNodes = new Map<string, EnemyNodes>();

/** projectile groups (head + trail), oriented along their flight direction */
export const projectileNodes = new Map<string, Group>();

/** cosmetic-only nodes for a placed tower */
export interface TowerNodes {
  /** scaled for the selected "pop" */
  root: Group;
  /** muzzle flash; shown by scaling up, then eased back to 0 */
  flash: Mesh;
}

export const towerNodes = new Map<string, TowerNodes>();

/** seconds of muzzle flash left per tower id — presentation state only, kept
 *  out of the store so gameplay state is untouched by polish */
export const towerFlash = new Map<string, number>();
