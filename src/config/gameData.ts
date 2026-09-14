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
