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
