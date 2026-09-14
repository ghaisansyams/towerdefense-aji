/**
 * ALL gameplay + world numbers live in this file.
 * Never hardcode a balance or layout number inside a component.
 */

// ---------------------------------------------------------------- world
export const WORLD = {
  /** grid is gridW x gridH tiles, each tileSize units on the XZ plane */
  gridW: 16,
  gridH: 16,
  tileSize: 1,
  /** tiles are drawn slightly smaller than tileSize so seams read as a grid */
  tileInset: 0.06,
  /** every tile box sits on this floor; differing heights make the road sink */
  tileFloorY: -0.3,
  groundColor: '#171d18',
} as const;

/** world-space centre of the grid, used as camera + orbit target */
export const GRID_CENTER: [number, number, number] = [
  ((WORLD.gridW - 1) * WORLD.tileSize) / 2,
  0,
  ((WORLD.gridH - 1) * WORLD.tileSize) / 2,
];

// ----------------------------------------------------------------- tiles
export type TileType =
  | 'buildable'
  | 'path'
  | 'spawn'
  | 'base'
  | 'occupied'
  /** border tile holding scenery: decorative, and not buildable */
  | 'scenery';

/**
 * THE MAP. Row-major: MAP_ROWS[z] is the row at grid-z, char index is grid-x.
 * Written as string art so the S-path is visible in the source itself.
 *
 *   .  buildable (grass)      S  spawn   (top edge, x=1)
 *   #  path      (dirt road)  B  base    (bottom edge, x=1)
 *
 *          x= 0123456789AB
 */
const MAP_ROWS = [
  /* z= 0 */ '..S.............',
  /* z= 1 */ '..#.............',
  /* z= 2 */ '..############..',
  /* z= 3 */ '.............#..',
  /* z= 4 */ '.............#..',
  /* z= 5 */ '..############..',
  /* z= 6 */ '..#.............',
  /* z= 7 */ '..#.............',
  /* z= 8 */ '..############..',
  /* z= 9 */ '.............#..',
  /* z=10 */ '.............#..',
  /* z=11 */ '..############..',
  /* z=12 */ '..#.............',
  /* z=13 */ '..#.............',
  /* z=14 */ '..#.............',
  /* z=15 */ '..B.............',
];

const CODE_TO_TILE: Record<string, TileType> = {
  '.': 'buildable',
  '#': 'path',
  S: 'spawn',
  B: 'base',
};

/** The hardcoded 2D array the game reads: GRID_MAP[z][x] -> TileType */
export const GRID_MAP: TileType[][] = MAP_ROWS.map((row, z) => {
  if (row.length !== WORLD.gridW) {
    throw new Error(`map row ${z} is ${row.length} chars, expected ${WORLD.gridW}`);
  }
  return [...row].map((code, x) => {
    const tile = CODE_TO_TILE[code];
    if (!tile) throw new Error(`unknown tile code '${code}' at (x=${x}, z=${z})`);
    return tile;
  });
});

/**
 * Corner points of the route, in grid coords. Enemies lerp waypoint -> waypoint
 * (Phase 3). Every segment is axis-aligned and lies on path tiles.
 */
export const WAYPOINTS: Array<[number, number]> = [
  [2, 0],   // spawn, top edge
  [2, 2],
  [13, 2],  // ─┐
  [13, 5],  //  │
  [2, 5],   // ─┘  four switchbacks in all
  [2, 8],
  [13, 8],
  [13, 11],
  [2, 11],
  [2, 15],  // base, bottom edge
];

/**
 * Decorative scenery on the outer border.
 *
 * Generated from a FIXED seed rather than Math.random, so the board is
 * identical on every load and a test can assert against it. The tiles it
 * claims become 'scenery' — decorative, and not buildable, because a tower
 * cannot stand inside a boulder.
 */
export type DecorKind = 'rock' | 'tree';

export interface DecorItem {
  x: number;
  z: number;
  kind: DecorKind;
  scale: number;
  rot: number;
}

/** mulberry32: tiny deterministic PRNG */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const DECOR_SEED = 20260911;
/** how thick the decorated border band is, in tiles */
export const DECOR_BAND = 2;
/** share of eligible border tiles that get scenery */
export const DECOR_DENSITY = 0.5;

export const DECOR: DecorItem[] = (() => {
  const rnd = seeded(DECOR_SEED);
  const out: DecorItem[] = [];
  for (let z = 0; z < WORLD.gridH; z++) {
    for (let x = 0; x < WORLD.gridW; x++) {
      const onBorder =
        x < DECOR_BAND || x >= WORLD.gridW - DECOR_BAND ||
        z < DECOR_BAND || z >= WORLD.gridH - DECOR_BAND;
      if (!onBorder) continue;
      if (GRID_MAP[z][x] !== 'buildable') continue;   // never touch the route
      // never claim a tile touching the route either: those are the prime
      // tower spots and scenery would quietly steal the best real estate
      let nextToPath = false;
      for (let dz = -1; dz <= 1 && !nextToPath; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = GRID_MAP[z + dz]?.[x + dx];
          if (n === 'path' || n === 'spawn' || n === 'base') { nextToPath = true; break; }
        }
      }
      if (nextToPath) continue;
      if (rnd() > DECOR_DENSITY) continue;
      const kind: DecorKind = rnd() < 0.45 ? 'rock' : 'tree';
      out.push({
        x, z, kind,
        scale: 0.72 + rnd() * 0.62,
        rot: rnd() * Math.PI * 2,
      });
      GRID_MAP[z][x] = 'scenery';
    }
  }
  return out;
})();

/** colour + box height per tile type. Height differences sink the road. */
export const TILE_STYLE: Record<TileType, { color: string; height: number }> = {
  // tileFloorY is -0.3, so height 0.3 puts the grass surface exactly at y=0
  buildable: { color: '#5cae42', height: 0.3 },
  path: { color: '#c8a063', height: 0.14 },      // dirt, 0.16 below the grass
  spawn: { color: '#e0392b', height: 0.36 },     // red, raised above the grass
  base: { color: '#2f86e0', height: 0.36 },      // blue, raised
  occupied: { color: '#3c6f2e', height: 0.3 },   // darker grass under a tower
  scenery: { color: '#4e9a38', height: 0.3 },    // grass holding a rock or tree
};

// ---------------------------------------------------------------- economy
export const ECONOMY = {
  startMoney: 100,
  startLives: 20,
  /** selling refunds this fraction of the tower's purchase cost */
  sellRefund: 0.6,
  /** paid out each time a wave is cleared */
  waveClearBonus: 25,
} as const;

// ----------------------------------------------------------------- towers
export type TowerTypeId =
  | 'arrow'
  | 'cannon'
  | 'frost'
  | 'mortar'
  | 'poison'
  | 'support';

/** stats at one upgrade level */
export interface TowerLevel {
  /** money spent to REACH this level; level 1's cost is the purchase price */
  cost: number;
  damage: number;
  /** radius in world units */
  range: number;
  /** shots per second; 0 for towers that never fire */
  fireRate: number;
  projectileSpeed: number;
  /** frost only: fraction of speed REMOVED (0.4 => enemy moves at 60%) */
  slowAmount?: number;
  slowDurationMs?: number;
  /** mortar only: shell detonates, damaging everything within this radius */
  aoeRadius?: number;
  /** mortar only: peak height of the lobbed arc */
  arcHeight?: number;
  /** poison only: damage per second, and how long it lasts from the last hit */
  poisonDps?: number;
  poisonMs?: number;
  /** support only: fractional bonuses granted to attack towers in range */
  buffDamage?: number;
  buffFireRate?: number;
}

export interface TowerDef {
  id: TowerTypeId;
  name: string;
  blurb: string;
  /** 'support' towers never acquire targets or fire */
  role: 'attack' | 'support';
  /** body + trim colours for the primitive build */
  color: string;
  accent: string;
  /** projectile tint — deliberately NOT the body colour: a grey cannon shell
   *  is invisible against a grey Tank. Bright and distinct from every enemy. */
  projectileColor: string;
  /** at least one entry, level 1 first. Length is that tower's max level, so
   *  a type can ship with fewer tiers than another. */
  levels: TowerLevel[];
}

export const TOWERS: Record<TowerTypeId, TowerDef> = {
  arrow: {
    id: 'arrow', name: 'Arrow', blurb: 'Cheap all-rounder', role: 'attack',
    color: '#e2dccb', accent: '#8a6a44', projectileColor: '#fff3b0',
    levels: [
      { cost: 50, damage: 10, range: 3.0, fireRate: 1.5, projectileSpeed: 12 },
      { cost: 60, damage: 18, range: 3.0, fireRate: 2.2, projectileSpeed: 12 },
      { cost: 120, damage: 32, range: 3.6, fireRate: 2.2, projectileSpeed: 12 },
    ],
  },
  cannon: {
    id: 'cannon', name: 'Cannon', blurb: 'Slow, heavy damage', role: 'attack',
    color: '#767c84', accent: '#343940', projectileColor: '#ff9d3d',
    levels: [
      { cost: 100, damage: 40, range: 2.5, fireRate: 0.6, projectileSpeed: 7 },
      { cost: 120, damage: 75, range: 3.0, fireRate: 0.6, projectileSpeed: 7 },
      { cost: 220, damage: 140, range: 3.0, fireRate: 0.8, projectileSpeed: 7 },
    ],
  },
  frost: {
    id: 'frost', name: 'Frost', blurb: 'Slows what it hits', role: 'attack',
    color: '#63c4f2', accent: '#24688f', projectileColor: '#9beeff',
    levels: [
      { cost: 75, damage: 5, range: 2.5, fireRate: 1.0, projectileSpeed: 11,
        slowAmount: 0.4, slowDurationMs: 2000 },
      { cost: 90, damage: 5, range: 3.0, fireRate: 1.0, projectileSpeed: 11,
        slowAmount: 0.55, slowDurationMs: 2000 },
      { cost: 160, damage: 13, range: 3.0, fireRate: 1.0, projectileSpeed: 11,
        slowAmount: 0.7, slowDurationMs: 2000 },
    ],
  },
  mortar: {
    id: 'mortar', name: 'Mortar', blurb: 'Lobbed splash damage', role: 'attack',
    color: '#8f9478', accent: '#3d4235', projectileColor: '#ffb347',
    levels: [
      { cost: 120, damage: 35, range: 3.5, fireRate: 0.5, projectileSpeed: 5,
        aoeRadius: 1.2, arcHeight: 1.7 },
    ],
  },
  poison: {
    id: 'poison', name: 'Poison', blurb: 'Damage over time', role: 'attack',
    color: '#6fbf3f', accent: '#2c5c18', projectileColor: '#c2ff5c',
    // damage 0: all of its damage is the DoT
    levels: [
      { cost: 90, damage: 0, range: 2.8, fireRate: 1.0, projectileSpeed: 10,
        poisonDps: 6, poisonMs: 4000 },
    ],
  },
  support: {
    id: 'support', name: 'Support', blurb: 'Buffs nearby towers', role: 'support',
    color: '#e8c25a', accent: '#8a6d20', projectileColor: '#ffe9a8',
    levels: [
      { cost: 100, damage: 0, range: 2.0, fireRate: 0, projectileSpeed: 0,
        buffDamage: 0.25, buffFireRate: 0.15 },
    ],
  },
};

/** how a tower picks among the enemies inside its range */
export type TargetMode = 'first' | 'last' | 'strongest' | 'closest';

export const TARGET_MODES: Array<{ id: TargetMode; label: string; hint: string }> = [
  { id: 'first', label: 'First', hint: 'Furthest along the path' },
  { id: 'last', label: 'Last', hint: 'Least far along the path' },
  { id: 'strongest', label: 'Strong', hint: 'Highest current HP' },
  { id: 'closest', label: 'Close', hint: 'Nearest to this tower' },
];

/** how many upgrade tiers this tower type ships with */
export const towerMaxLevel = (type: TowerTypeId): number =>
  TOWERS[type].levels.length;

/** stats for a tower at a given 1-based level */
export const towerStats = (type: TowerTypeId, level: number): TowerLevel =>
  TOWERS[type].levels[
    Math.min(Math.max(level, 1), towerMaxLevel(type)) - 1
  ];

/** price to go from `level` to `level + 1`, or null when maxed */
export const upgradeCost = (type: TowerTypeId, level: number): number | null =>
  level >= towerMaxLevel(type) ? null : TOWERS[type].levels[level].cost;

/** what a tower costs to buy */
export const towerBuyCost = (type: TowerTypeId): number =>
  TOWERS[type].levels[0].cost;

/** display order in the picker */
export const TOWER_ORDER: TowerTypeId[] = [
  'arrow', 'cannon', 'frost', 'mortar', 'poison', 'support',
];

/** translucent range-ring styling. The edge carries the signal — a soft
 *  fill alone washes out against the grass, so keep it bright and thick. */
export const RANGE_RING = {
  valid: '#2bff6d',
  invalid: '#ff2f1c',
  selected: '#ffc32e',
  fillOpacity: 0.16,
  edgeOpacity: 0.95,
  edgeWidth: 0.11,
} as const;

// ---------------------------------------------------------------- enemies
export type EnemyTypeId =
  | 'grunt'
  | 'runner'
  | 'tank'
  | 'armored'
  | 'splitter'
  | 'splitterMini'
  | 'healer'
  | 'boss';

export interface EnemyDef {
  id: EnemyTypeId;
  name: string;
  hp: number;
  /** world units per second */
  speed: number;
  /** money granted on kill */
  reward: number;
  color: string;
  shape: 'box' | 'cone' | 'sphere' | 'cylinder' | 'octa';
  /** footprint width and total height, in world units */
  size: number;
  height: number;

  /** flat damage reduction applied to EVERY incoming hit, before it lands.
   *  Many small hits are blunted; one big hit barely notices. */
  armor?: number;

  /** on death, spawn `count` of `type` at this enemy's position */
  splitInto?: { type: EnemyTypeId; count: number };

  /** ignores every slow effect. Frost still deals its flat damage. */
  slowImmune?: boolean;
  /** lives lost when this reaches the base (default 1) */
  livesCost?: number;
  /** draws the big dedicated bar at the top of the screen while alive */
  isBoss?: boolean;

  /** periodic area heal of OTHER enemies (never itself) */
  healRadius?: number;
  healAmount?: number;
  healIntervalMs?: number;
}

export const ENEMIES: Record<EnemyTypeId, EnemyDef> = {
  grunt: {
    id: 'grunt', name: 'Grunt', hp: 40, speed: 1.5, reward: 8,
    color: '#e2402f', shape: 'box', size: 0.42, height: 0.42,
  },
  runner: {
    id: 'runner', name: 'Runner', hp: 20, speed: 3.0, reward: 12,
    color: '#f5d442', shape: 'cone', size: 0.28, height: 0.58,
  },
  tank: {
    id: 'tank', name: 'Tank', hp: 200, speed: 0.8, reward: 30,
    color: '#9aa3ad', shape: 'box', size: 0.68, height: 0.68,
  },
  armored: {
    id: 'armored', name: 'Armored', hp: 120, speed: 1.2, reward: 20,
    color: '#2f4a8c', shape: 'box', size: 0.5, height: 0.5,
    armor: 15,
  },
  splitter: {
    id: 'splitter', name: 'Splitter', hp: 60, speed: 1.6, reward: 15,
    color: '#3fbf6a', shape: 'sphere', size: 0.5, height: 0.5,
    splitInto: { type: 'splitterMini', count: 2 },
  },
  splitterMini: {
    id: 'splitterMini', name: 'Splitter Mini', hp: 20, speed: 2.5, reward: 5,
    color: '#7fe0a0', shape: 'sphere', size: 0.3, height: 0.3,
    // no splitInto: minis do not split again
  },
  boss: {
    id: 'boss', name: 'Colossus', hp: 1500, speed: 0.7, reward: 200,
    color: '#b537e8', shape: 'octa', size: 1.15, height: 1.25,
    slowImmune: true, livesCost: 5, isBoss: true,
  },
  healer: {
    id: 'healer', name: 'Healer', hp: 90, speed: 1.0, reward: 25,
    color: '#ee74c8', shape: 'cylinder', size: 0.44, height: 0.62,
    healRadius: 2.5, healAmount: 12, healIntervalMs: 1500,
  },
};

/** the two halves of a split are nudged apart along the path by this much so
 *  they read as two enemies instead of one; they stay centred on the parent */
export const SPLIT_SPREAD = 0.24;

// ----------------------------------------------------------------- waves
export interface WaveGroup {
  enemyType: EnemyTypeId;
  count: number;
  /** gap between spawns within this group */
  spawnIntervalMs: number;
}

export interface Wave {
  /** groups run in order; the next starts once the previous is fully spawned */
  groups: WaveGroup[];
}

/** 8 waves, escalating in count, speed and toughness */
export const WAVES: Wave[] = [
  // 1 — a gentle read of the path
  { groups: [{ enemyType: 'grunt', count: 6, spawnIntervalMs: 900 }] },
  // 2 — more of the same, tighter
  { groups: [{ enemyType: 'grunt', count: 10, spawnIntervalMs: 700 }] },
  // 3 — first runners
  {
    groups: [
      { enemyType: 'grunt', count: 8, spawnIntervalMs: 650 },
      { enemyType: 'runner', count: 4, spawnIntervalMs: 550 },
    ],
  },
  // 4 — first armour: flat 15 blunts Arrow, Cannon shrugs it off
  {
    groups: [
      { enemyType: 'grunt', count: 12, spawnIntervalMs: 550 },
      { enemyType: 'runner', count: 6, spawnIntervalMs: 450 },
      { enemyType: 'armored', count: 3, spawnIntervalMs: 900 },
    ],
  },
  // 5 — first tanks and splitters, then the first Colossus
  {
    groups: [
      { enemyType: 'runner', count: 10, spawnIntervalMs: 400 },
      { enemyType: 'splitter', count: 3, spawnIntervalMs: 800 },
      { enemyType: 'tank', count: 2, spawnIntervalMs: 1500 },
      { enemyType: 'boss', count: 1, spawnIntervalMs: 2000 },
    ],
  },
  // 6 — first healer, escorted
  {
    groups: [
      { enemyType: 'grunt', count: 15, spawnIntervalMs: 420 },
      { enemyType: 'armored', count: 4, spawnIntervalMs: 700 },
      { enemyType: 'healer', count: 1, spawnIntervalMs: 1000 },
      { enemyType: 'tank', count: 3, spawnIntervalMs: 1200 },
    ],
  },
  // 7 — speed, armour and a healer keeping it all alive
  {
    groups: [
      { enemyType: 'runner', count: 12, spawnIntervalMs: 280 },
      { enemyType: 'splitter', count: 4, spawnIntervalMs: 600 },
      { enemyType: 'healer', count: 2, spawnIntervalMs: 900 },
      { enemyType: 'tank', count: 5, spawnIntervalMs: 1000 },
    ],
  },
  // 8 — the wall
  {
    groups: [
      { enemyType: 'grunt', count: 20, spawnIntervalMs: 300 },
      { enemyType: 'runner', count: 12, spawnIntervalMs: 260 },
      { enemyType: 'armored', count: 6, spawnIntervalMs: 500 },
      { enemyType: 'splitter', count: 5, spawnIntervalMs: 550 },
      { enemyType: 'healer', count: 2, spawnIntervalMs: 800 },
      { enemyType: 'tank', count: 6, spawnIntervalMs: 900 },
      { enemyType: 'boss', count: 1, spawnIntervalMs: 2500 },
    ],
  },
];

/** total enemies in a wave, for the HUD. Splitter minis are not counted:
 *  they do not exist until something dies. */
export const waveSize = (i: number) =>
  WAVES[i] ? WAVES[i].groups.reduce((n, g) => n + g.count, 0) : 0;

/** top surface of a path tile: enemies walk on this plane */
export const PATH_SURFACE_Y = WORLD.tileFloorY + TILE_STYLE.path.height;

/**
 * Waypoints in world space plus per-segment lengths, precomputed once so the
 * game loop never recomputes path geometry per frame.
 */
export const PATH = (() => {
  const pts = WAYPOINTS.map(([x, z]) => ({
    x: x * WORLD.tileSize,
    z: z * WORLD.tileSize,
  }));
  const segs: Array<{
    ax: number; az: number; bx: number; bz: number; len: number;
    /** distance from spawn to the start of this segment */
    start: number;
  }> = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    segs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, len, start: total });
    total += len;
  }
  return { pts, segs, total };
})();

/**
 * Purely cosmetic tuning. Nothing here feeds targeting, damage or timing —
 * changing any of it must not alter how the game plays.
 */
export const FX = {
  /** bright puff at the muzzle when a tower fires; animated by SCALE so the
   *  one shared material is never mutated per tower */
  flashMs: 110,
  flashSize: 0.185,
  /** warm yellow, not cream: a pale puff is invisible on the cream Arrow cone */
  flashColor: '#ffd24a',
  /** height of the puff per tower type: just clear of each silhouette. At the
   *  projectile spawn height it renders INSIDE the barrel and is invisible. */
  flashY: {
    arrow: 1.02, cannon: 0.74, frost: 1.28,
    mortar: 0.86, poison: 1.12, support: 0,
  } as Record<string, number>,
  /** Support aura: always on, deliberately faint so it never competes with
   *  the range ring of a selected tower */
  auraColor: '#f0cf6a',
  auraFill: 0.07,
  auraEdge: 0.34,
  /** gold thread drawn from a pylon to each tower it is buffing */
  linkColor: '#f5d97a',
  linkRadius: 0.028,
  linkY: 0.34,
  /** per-tower-type projectile size multiplier; a mortar shell is heavier */
  projectileScale: { mortar: 1.7 } as Record<string, number>,
  /** streak drawn behind a projectile, oriented along its direction */
  trailLength: 0.5,
  trailRadius: 0.075,
  trailOpacity: 0.45,
  /** hover plate on a buildable tile when nothing is being placed */
  hoverColor: '#eaf7ff',
  hoverOpacity: 0.18,
  /** a selected tower eases up to this scale */
  selectedScale: 1.1,
  /** per-level size, indexed by level-1: upgrades read as physically bigger */
  levelScale: [1, 1.14, 1.3] as number[],
  /** collar at the base marking an upgraded tower (level 2 and 3) */
  levelBandColor: ['#c8d2dc', '#ffd24a'] as string[],
  /** healer's area-heal pulse: expands to the heal radius, then vanishes */
  healPulseMs: 480,
  healPulseColor: '#ff8fd8',
  /** descending opacities the pulse steps through as it expands */
  healPulseOpacity: [0.75, 0.6, 0.45, 0.3, 0.15] as number[],
  /** lerp rate per second for the pop and for scale settling */
  popEase: 14,
  /** one-shot camera settle on load */
  introMs: 1100,
  introLift: 4.5,
  introPull: 3.5,
} as const;

/** combat tuning: projectiles, hit detection, death animation */
export const COMBAT = {
  /** a projectile within this distance of its target counts as a hit */
  hitRadius: 0.2,
  projectileRadius: 0.13,
  /** height projectiles fly at, above the path surface */
  muzzleY: 0.55,
  /** seconds the scale-down + fade runs before the corpse is removed */
  deathDuration: 0.35,
  /** projectiles are culled after this many seconds (lost target, stray) */
  maxLifetime: 3,
  /** armour can never fully absorb a hit: every hit lands at least this much */
  minDamage: 1,
} as const;

/** turn an absolute distance-from-spawn back into a path segment + offset */
export const progressToSeg = (progress: number): { seg: number; distInSeg: number } => {
  const clamped = Math.max(0, Math.min(progress, PATH.total - 0.001));
  for (let i = PATH.segs.length - 1; i >= 0; i--) {
    if (clamped >= PATH.segs[i].start) {
      return { seg: i, distInSeg: clamped - PATH.segs[i].start };
    }
  }
  return { seg: 0, distInSeg: 0 };
};

/** floating health bar above each enemy */
export const HEALTH_BAR = {
  width: 0.56,
  height: 0.07,
  /** gap between the enemy's top and the bar */
  yOffset: 0.22,
  bgColor: '#16101a',
  /** green -> yellow -> red ramp, walked as health falls. Discrete shared
   *  materials rather than a per-enemy one, so nothing is ever mutated. */
  ramp: ['#4ade5b', '#8fe04a', '#d8dc42', '#f5b23c', '#f07838', '#ef4444'],
  /** a bar only appears once the enemy has actually taken a hit */
  hideWhenFull: true,
} as const;

/** red plate that pulses on a tile when placement is refused */
export const INVALID_FLASH = {
  color: '#ff2f1c',
  ms: 420,
  opacity: 0.55,
} as const;

// --------------------------------------------------------------- camera
const PITCH_DEG = 50; // angled top-down
const CAM_DIST = 23.5;   // scaled with the 16x16 board

export const CAMERA = {
  fov: 45,
  near: 0.1,
  far: 200,
  position: [
    GRID_CENTER[0],
    CAM_DIST * Math.sin((PITCH_DEG * Math.PI) / 180),
    GRID_CENTER[2] + CAM_DIST * Math.cos((PITCH_DEG * Math.PI) / 180),
  ] as [number, number, number],
  target: GRID_CENTER,
  /** polar angle: 0 = straight overhead, PI/2 = horizon. Clamped so the
   *  player can never orbit under the map. */
  minPolarAngle: 0.15,
  maxPolarAngle: 1.35,
  minDistance: 8,
  maxDistance: 42,
} as const;

// ---------------------------------------------------------- abilities
/** player-activated powers, on their own cooldowns */
export const ABILITIES = {
  airstrike: {
    name: 'Airstrike',
    blurb: 'Click a tile',
    cooldownMs: 25000,
    damage: 120,
    radius: 2,
    color: '#ff9d3d',
  },
  deepFreeze: {
    name: 'Deep Freeze',
    blurb: 'Slows everything',
    cooldownMs: 30000,
    /** fraction of speed removed, for durationMs */
    slowAmount: 0.6,
    durationMs: 4000,
    color: '#9beeff',
  },
} as const;

export type AbilityId = keyof typeof ABILITIES;
