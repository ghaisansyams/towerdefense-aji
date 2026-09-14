import { create } from 'zustand';
import {
  ABILITIES,
  ECONOMY,
  ENEMIES,
  GRID_MAP,
  PATH,
  towerBuyCost,
  towerMaxLevel,
  upgradeCost,
  WAVES,
  WORLD,
  type AbilityId,
  type EnemyTypeId,
  type TargetMode,
  type TileType,
  type TowerTypeId,
} from '../config/gameData';

export interface Tower {
  id: string;
  type: TowerTypeId;
  /** grid coords; world position is (x, _, z) * tileSize */
  x: number;
  z: number;
  /** seconds until this tower may fire again; ticked down by GameLoop */
  cooldown: number;
  /** 1-based upgrade level, capped at TOWER_MAX_LEVEL */
  level: number;
  /** total money sunk into this tower: purchase + every upgrade.
   *  Selling refunds a fraction of THIS, not of the base price. */
  invested: number;
  /** which enemy in range this tower prefers */
  targetMode: TargetMode;
}

/**
 * An enemy in flight.
 *
 * `seg`, `distInSeg`, `x`, `z`, `hp` and `speedMul` are MUTATED IN PLACE by
 * GameLoop every frame and are deliberately NOT reactive: pushing 50 enemy
 * positions through `set()` at 60fps would re-render the whole tree 60 times
 * a second. React only re-renders when the roster changes (spawn / removal),
 * which is what `set()` is used for.
 */
export interface Enemy {
  id: string;
  type: EnemyTypeId;
  hp: number;
  maxHp: number;
  /** index into PATH.segs */
  seg: number;
  /** distance travelled into the current segment */
  distInSeg: number;
  /** current world position on the path plane */
  x: number;
  z: number;
  /** speed multiplier, recomputed each frame from slowUntil */
  speedMul: number;
  /** ms timestamp (performance.now) until which the Frost slow applies */
  slowUntil: number;
  /** true once hp hits 0: plays the death effect, then gets removed */
  dying: boolean;
  /** death animation progress, 0..1 */
  deathT: number;
  /** healers only: ms until the next area heal fires */
  healTimer: number;
  /** poison: ms timestamp the DoT runs until, and its damage per second.
   *  A fresh hit REFRESHES the window; it never adds another stack. */
  poisonUntil: number;
  poisonDps: number;
}

/**
 * An in-flight projectile. Like Enemy, its position is mutated in place by
 * GameLoop and is not reactive.
 */
export interface Projectile {
  id: string;
  towerType: TowerTypeId;
  targetId: string;
  x: number;
  y: number;
  z: number;
  damage: number;
  speed: number;
  /** seconds alive, for culling strays */
  life: number;
  /** frost slow captured at fire time, so upgrading mid-flight can't alter
   *  a shot already in the air */
  slowAmount?: number;
  slowDurationMs?: number;
  /** poison payload, captured at fire time for the same reason */
  poisonDps?: number;
  poisonMs?: number;
  /** mortar: detonates on arrival, damaging everything inside this radius */
  aoeRadius?: number;
  /**
   * Mortar shells are BALLISTIC, not homing: they are lobbed at the point the
   * target occupied when fired and detonate there, so a fast mover can walk
   * out of the blast. Homing shots leave this undefined.
   */
  ballistic?: {
    ox: number; oy: number; oz: number;   // launch point
    ix: number; iz: number;               // impact point on the ground
    dist: number;                         // ground distance, for flight time
    t: number;                            // 0..1 along the arc
    arc: number;                          // peak height
  };
}

/**
 * Progress through the wave currently being spawned. Like Enemy, its fields
 * are mutated in place by GameLoop each frame rather than pushed through
 * set() — only the phase transitions at either end are reactive.
 */
export interface WaveRunner {
  groupIndex: number;
  spawnedInGroup: number;
  /** ms until the next spawn */
  timerMs: number;
  /** true once every group in the wave has been fully spawned */
  done: boolean;
}

/** everything one frame of the game loop wants to change in the store */
export interface FrameCommit {
  /** enemies born mid-frame, e.g. a Splitter's halves */
  addEnemies?: Enemy[];
  addProjectiles?: Projectile[];
  removeProjectileIds?: string[];
  removeEnemyIds?: string[];
  moneyDelta?: number;
}

export interface TileRef {
  x: number;
  z: number;
}

export type GamePhase = 'building' | 'wave' | 'won' | 'lost';

/** the store owns a mutable copy; GRID_MAP itself stays pristine */
const cloneGrid = (): TileType[][] => GRID_MAP.map((row) => [...row]);

let nextTowerId = 1;
let nextEnemyId = 1;
let nextProjectileId = 1;
export const newProjectileId = () => `p${nextProjectileId++}`;

/**
 * The single place an Enemy is constructed. Used by the wave spawner (at the
 * path start) and by GameLoop when a Splitter breaks apart mid-path, so both
 * always agree on the shape of a new enemy.
 */
export const makeEnemy = (
  type: EnemyTypeId,
  seg = 0,
  distInSeg = 0,
): Enemy => {
  const def = ENEMIES[type];
  const s = PATH.segs[seg];
  const t = s.len === 0 ? 0 : distInSeg / s.len;
  return {
    id: `e${nextEnemyId++}`,
    type,
    hp: def.hp,
    maxHp: def.hp,
    seg,
    distInSeg,
    x: s.ax + (s.bx - s.ax) * t,
    z: s.az + (s.bz - s.az) * t,
    speedMul: 1,
    slowUntil: 0,
    dying: false,
    deathT: 0,
    healTimer: def.healIntervalMs ?? 0,
    poisonUntil: 0,
    poisonDps: 0,
  };
};

interface GameState {
  money: number;
  lives: number;
  phase: GamePhase;
  currentWave: number;
  selectedTowerType: TowerTypeId | null;
  selectedTowerId: string | null;
  hoveredTile: TileRef | null;
  towers: Tower[];
  enemies: Enemy[];
  projectiles: Projectile[];
  waveRunner: WaveRunner | null;
  grid: TileType[][];
  /** render quality switches — presentation only, no gameplay effect */
  quality: { bloom: boolean; shadows: boolean };
  /**
   * Ability cooldowns as performance.now() timestamps, so the HUD and the
   * game loop can both read them without sharing a clock.
   */
  abilityReadyAt: Record<AbilityId, number>;
  /** airstrike waits for a tile click; this is the armed state */
  armedAbility: AbilityId | null;
  /** set by the UI, consumed by GameLoop on the next frame */
  pendingAbility: { kind: AbilityId; x?: number; z?: number } | null;

  // ---- actions
  setSelectedTowerType: (type: TowerTypeId | null) => void;
  selectTower: (id: string | null) => void;
  setHoveredTile: (tile: TileRef | null) => void;
  /** true only if the tile is in bounds, buildable, and affordable */
  canPlaceAt: (x: number, z: number) => boolean;
  placeTower: (x: number, z: number) => void;
  /** spend the next level's cost and bump the tower a level */
  upgradeTower: (id: string) => void;
  setTargetMode: (id: string, mode: TargetMode) => void;
  setQuality: (q: Partial<{ bloom: boolean; shadows: boolean }>) => void;
  /** arm the airstrike so the next tile click places it */
  armAbility: (id: AbilityId | null) => void;
  /** returns true if the ability actually fired */
  useAbility: (id: AbilityId, x?: number, z?: number) => boolean;
  clearPendingAbility: () => void;
  sellTower: (id: string) => void;
  /** called by GameLoop's spawn timer */
  spawnEnemy: (type: EnemyTypeId) => void;
  /** called by GameLoop when enemies cross the base tile */
  enemiesReachedBase: (ids: string[]) => void;
  /**
   * One batched store write per frame. Firing 10 towers would otherwise mean
   * a dozen separate set() calls (and re-renders) every frame.
   */
  commitFrame: (c: FrameCommit) => void;
  /** building -> wave */
  startWave: () => void;
  /** wave -> building, or -> won after the last wave */
  completeWave: () => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  money: ECONOMY.startMoney,
  lives: ECONOMY.startLives,
  phase: 'building',
  currentWave: 0,
  selectedTowerType: null,
  selectedTowerId: null,
  hoveredTile: null,
  towers: [],
  enemies: [],
  projectiles: [],
  waveRunner: null,
  grid: cloneGrid(),
  quality: { bloom: false, shadows: true },
  abilityReadyAt: { airstrike: 0, deepFreeze: 0 },
  armedAbility: null,
  pendingAbility: null,

  setSelectedTowerType: (type) =>
    set((s) => ({
      // clicking the active button again clears it
      selectedTowerType: s.selectedTowerType === type ? null : type,
      selectedTowerId: null,
    })),

  selectTower: (id) => set({ selectedTowerId: id, selectedTowerType: null }),

  setHoveredTile: (tile) => {
    const cur = get().hoveredTile;
    // pointermove fires constantly; only write when the tile actually changes
    if (cur?.x === tile?.x && cur?.z === tile?.z) return;
    set({ hoveredTile: tile });
  },

  canPlaceAt: (x, z) => {
    const { grid, money, selectedTowerType } = get();
    if (!selectedTowerType) return false;
    if (x < 0 || z < 0 || x >= WORLD.gridW || z >= WORLD.gridH) return false;
    if (grid[z][x] !== 'buildable') return false;
    return money >= towerBuyCost(selectedTowerType);
  },

  placeTower: (x, z) => {
    const { canPlaceAt, selectedTowerType, grid, towers, money } = get();
    if (!selectedTowerType || !canPlaceAt(x, z)) return;

    const price = towerBuyCost(selectedTowerType);
    const nextGrid = grid.map((row, rz) =>
      rz === z ? row.map((t, rx) => (rx === x ? ('occupied' as TileType) : t)) : row,
    );

    set({
      money: money - price,
      grid: nextGrid,
      towers: [
        ...towers,
        {
          id: `t${nextTowerId++}`,
          type: selectedTowerType,
          x,
          z,
          cooldown: 0,
          level: 1,
          invested: price,
          targetMode: 'first',
        },
      ],
    });
  },

  upgradeTower: (id) => {
    const { towers, money } = get();
    const tower = towers.find((t) => t.id === id);
    if (!tower || tower.level >= towerMaxLevel(tower.type)) return;

    const price = upgradeCost(tower.type, tower.level);
    if (price == null || money < price) return;

    set({
      money: money - price,
      towers: towers.map((t) =>
        t.id === id
          ? { ...t, level: t.level + 1, invested: t.invested + price }
          : t,
      ),
    });
  },

  setQuality: (q) => set((s) => ({ quality: { ...s.quality, ...q } })),

  armAbility: (id) =>
    set((s) => ({
      armedAbility: s.armedAbility === id ? null : id,
      // arming an ability cancels a pending tower placement
      selectedTowerType: id ? null : s.selectedTowerType,
    })),

  useAbility: (id, x, z) => {
    const { abilityReadyAt, phase } = get();
    if (phase === 'won' || phase === 'lost') return false;
    if (performance.now() < abilityReadyAt[id]) return false;
    set((s) => ({
      abilityReadyAt: {
        ...s.abilityReadyAt,
        [id]: performance.now() + ABILITIES[id].cooldownMs,
      },
      pendingAbility: { kind: id, x, z },
      armedAbility: null,
    }));
    return true;
  },

  clearPendingAbility: () => set({ pendingAbility: null }),

  setTargetMode: (id, mode) =>
    set((s) => ({
      towers: s.towers.map((t) => (t.id === id ? { ...t, targetMode: mode } : t)),
    })),

  sellTower: (id) => {
    const { towers, grid, money, selectedTowerId } = get();
    const tower = towers.find((t) => t.id === id);
    if (!tower) return;

    // refund a share of everything sunk in, not just the purchase price
    const refund = Math.floor(tower.invested * ECONOMY.sellRefund);
    const nextGrid = grid.map((row, rz) =>
      rz === tower.z
        ? row.map((t, rx) => (rx === tower.x ? ('buildable' as TileType) : t))
        : row,
    );

    set({
      money: money + refund,
      grid: nextGrid,
      towers: towers.filter((t) => t.id !== id),
      selectedTowerId: selectedTowerId === id ? null : selectedTowerId,
    });
  },

  spawnEnemy: (type) => {
    set((s) => ({ enemies: [...s.enemies, makeEnemy(type)] }));
  },

  enemiesReachedBase: (ids) => {
    if (ids.length === 0) return;
    const { enemies, lives } = get();
    const drop = new Set(ids);
    // a Colossus costs 5 lives, everything else 1
    const cost = enemies.reduce(
      (n, e) => (drop.has(e.id) ? n + (ENEMIES[e.type].livesCost ?? 1) : n),
      0,
    );
    const remaining = lives - cost;
    set({
      enemies: enemies.filter((e) => !drop.has(e.id)),
      lives: Math.max(0, remaining),
      ...(remaining <= 0 ? { phase: 'lost' as GamePhase } : null),
    });
  },

  commitFrame: ({
    addEnemies,
    addProjectiles,
    removeProjectileIds,
    removeEnemyIds,
    moneyDelta,
  }) => {
    const s = get();
    const next: Partial<GameState> = {};

    if (addProjectiles?.length || removeProjectileIds?.length) {
      const drop = new Set(removeProjectileIds ?? []);
      const kept = drop.size ? s.projectiles.filter((p) => !drop.has(p.id)) : s.projectiles;
      next.projectiles = addProjectiles?.length ? [...kept, ...addProjectiles] : kept;
    }
    if (removeEnemyIds?.length || addEnemies?.length) {
      const drop = new Set(removeEnemyIds ?? []);
      const kept = drop.size ? s.enemies.filter((e) => !drop.has(e.id)) : s.enemies;
      next.enemies = addEnemies?.length ? [...kept, ...addEnemies] : kept;
      // a removed enemy's projectiles have nothing left to hit
      if (drop.size) {
        const survivors = next.projectiles ?? s.projectiles;
        next.projectiles = survivors.filter((p) => !drop.has(p.targetId));
      }
    }
    if (moneyDelta) next.money = s.money + moneyDelta;

    if (Object.keys(next).length) set(next);
  },

  startWave: () => {
    const { phase, currentWave } = get();
    if (phase !== 'building' || currentWave >= WAVES.length) return;
    set({
      phase: 'wave',
      waveRunner: { groupIndex: 0, spawnedInGroup: 0, timerMs: 0, done: false },
    });
  },

  completeWave: () => {
    const { phase, currentWave, money } = get();
    if (phase !== 'wave') return;
    const next = currentWave + 1;
    set({
      money: money + ECONOMY.waveClearBonus,
      currentWave: next,
      waveRunner: null,
      phase: next >= WAVES.length ? 'won' : 'building',
    });
  },

  reset: () =>
    set({
      money: ECONOMY.startMoney,
      lives: ECONOMY.startLives,
      phase: 'building',
      currentWave: 0,
      selectedTowerType: null,
      selectedTowerId: null,
      hoveredTile: null,
      towers: [],
      enemies: [],
      projectiles: [],
      waveRunner: null,
      abilityReadyAt: { airstrike: 0, deepFreeze: 0 },
      armedAbility: null,
      pendingAbility: null,
      grid: cloneGrid(),
    }),
}));
