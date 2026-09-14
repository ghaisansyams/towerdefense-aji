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
