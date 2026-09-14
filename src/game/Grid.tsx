import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  ABILITIES,
  FX,
  GRID_CENTER,
  RANGE_RING,
  INVALID_FLASH,
  RENDER,
  TILE_STYLE,
  towerStats,
  WORLD,
  type TileType,
} from '../config/gameData';
import { useGameStore } from '../store/gameStore';
import { flashInvalid, flashNode } from './feedback';
import { RangeRing, TowerMesh } from './Tower';

/** red plate that pulses where a placement was refused */
function InvalidFlash() {
  const ref = useRef<THREE.Mesh>(null!);
  useEffect(() => {
    flashNode.mesh = ref.current;
    return () => { flashNode.mesh = null; };
  }, []);
  return (
    <mesh
      ref={ref}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.02, 0]}
      visible={false}
      renderOrder={3}
      raycast={() => null}
    >
      <planeGeometry
        args={[WORLD.tileSize - WORLD.tileInset, WORLD.tileSize - WORLD.tileInset]}
      />
      <meshBasicMaterial
        color={INVALID_FLASH.color}
        transparent
        opacity={0}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * Thin plate over the hovered buildable tile. Deliberately its own component:
 * it subscribes to hoveredTile alone, so mouse movement re-renders one mesh
 * rather than the whole 144-tile board.
 */
function TileHighlight() {
  const hoveredTile = useGameStore((s) => s.hoveredTile);
  const selectedTowerType = useGameStore((s) => s.selectedTowerType);
  const tileType = useGameStore((s) =>
    s.hoveredTile ? s.grid[s.hoveredTile.z]?.[s.hoveredTile.x] : null,
  );

  // while placing, the range ring already marks the tile
  if (!hoveredTile || selectedTowerType || tileType !== 'buildable') return null;

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[
        hoveredTile.x * WORLD.tileSize,
        TILE_STYLE.buildable.height + WORLD.tileFloorY + 0.012,
        hoveredTile.z * WORLD.tileSize,
      ]}
    >
      <planeGeometry
        args={[
          WORLD.tileSize - WORLD.tileInset,
          WORLD.tileSize - WORLD.tileInset,
        ]}
      />
      <meshBasicMaterial
        color={FX.hoverColor}
        transparent
        opacity={FX.hoverOpacity}
        depthWrite={false}
      />
    </mesh>
  );
}

/** blast preview while the airstrike is armed */
function AirstrikePreview() {
  const armed = useGameStore((s) => s.armedAbility);
  const hoveredTile = useGameStore((s) => s.hoveredTile);
  if (armed !== 'airstrike' || !hoveredTile) return null;
  return (
    <group
      position={[hoveredTile.x * WORLD.tileSize, 0, hoveredTile.z * WORLD.tileSize]}
    >
      <RangeRing radius={ABILITIES.airstrike.radius} color={ABILITIES.airstrike.color} />
    </group>
  );
}

/** ghost tower + range ring on the hovered tile while a type is selected */
function PlacementGhost() {
  const selectedTowerType = useGameStore((s) => s.selectedTowerType);
  const hoveredTile = useGameStore((s) => s.hoveredTile);
  const canPlaceAt = useGameStore((s) => s.canPlaceAt);

  if (!selectedTowerType || !hoveredTile) return null;

  const ok = canPlaceAt(hoveredTile.x, hoveredTile.z);
  const def = towerStats(selectedTowerType, 1); // ghost always previews L1

  return (
    <group
      position={[
        hoveredTile.x * WORLD.tileSize,
        0,
        hoveredTile.z * WORLD.tileSize,
      ]}
    >
      <RangeRing
        radius={def.range}
        color={ok ? RANGE_RING.valid : RANGE_RING.invalid}
      />
      {ok && <TowerMesh type={selectedTowerType} isGhost />}
    </group>
  );
}

/**
 * A single invisible plane over the board handles hover + click, instead of
 * 144 per-tile event handlers: one raycast target, and the grid coords fall
 * out of rounding the hit point.
 */
function InteractionPlane() {
  const setHoveredTile = useGameStore((s) => s.setHoveredTile);
  const placeTower = useGameStore((s) => s.placeTower);

  const toTile = (p: THREE.Vector3) => ({
    x: Math.round(p.x / WORLD.tileSize),
    z: Math.round(p.z / WORLD.tileSize),
  });

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[GRID_CENTER[0], 0, GRID_CENTER[2]]}
      onPointerMove={(e) => {
        e.stopPropagation();
        setHoveredTile(toTile(e.point));
      }}
      onPointerLeave={() => setHoveredTile(null)}
      onClick={(e) => {
        e.stopPropagation();
        const { x, z } = toTile(e.point);
        const s = useGameStore.getState();
        if (s.armedAbility === 'airstrike') {
          s.useAbility('airstrike', x, z);
          return;
        }
        if (s.selectedTowerType && !s.canPlaceAt(x, z)) {
          flashInvalid(x, z);   // refused: say so instead of doing nothing
          return;
        }
        placeTower(x, z);
      }}
    >
      <planeGeometry
        args={[WORLD.gridW * WORLD.tileSize, WORLD.gridH * WORLD.tileSize]}
      />
      {/* invisible but still raycastable */}
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/**
 * One InstancedMesh per tile type.
 *
 * The board is 16x16 = 256 tiles. As individual meshes that is 256 draw calls
 * before a single enemy is on screen; instanced it is one per type. Tiles
 * carry no click handlers (a single InteractionPlane does all picking), so
 * there is nothing to lose by instancing them.
 *
 * Each layer is allocated at full board capacity once and only its `count`
 * changes, so a tower placement never forces a reallocation.
 */
const CAPACITY = WORLD.gridW * WORLD.gridH;
const tileGeo = new THREE.BoxGeometry(1, 1, 1);

/** spawn and base glow so the two ends of the route read at a glance */
const tileGlow: Partial<Record<TileType, number>> = {
  spawn: RENDER.emissive.spawn,
  base: RENDER.emissive.base,
};

const tileMats = Object.fromEntries(
  (Object.keys(TILE_STYLE) as TileType[]).map((type) => {
    const glow = tileGlow[type] ?? 0;
    return [
      type,
      new THREE.MeshLambertMaterial({
        color: TILE_STYLE[type].color,
        emissive: new THREE.Color(glow > 0 ? TILE_STYLE[type].color : '#000000'),
        emissiveIntensity: glow,
      }),
    ];
  }),
) as Record<TileType, THREE.MeshLambertMaterial>;

function TileLayer({ type, cells }: { type: TileType; cells: Array<[number, number]> }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const style = TILE_STYLE[type];

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const tileW = WORLD.tileSize - WORLD.tileInset;
    const scale = new THREE.Vector3(tileW, style.height, tileW);
    cells.forEach(([x, z], i) => {
      pos.set(
        x * WORLD.tileSize,
        WORLD.tileFloorY + style.height / 2,
        z * WORLD.tileSize,
      );
      ref.current.setMatrixAt(i, m.compose(pos, quat, scale));
    });
    ref.current.count = cells.length;
    ref.current.instanceMatrix.needsUpdate = true;
  }, [cells, style]);

  return (
    <instancedMesh
      ref={ref}
      args={[tileGeo, tileMats[type], CAPACITY]}
      receiveShadow
      raycast={() => null}
      frustumCulled={false}
    />
  );
}

export default function Grid() {
  const grid = useGameStore((s) => s.grid);

  const layers = useMemo(() => {
    const byType = new Map<TileType, Array<[number, number]>>();
    grid.forEach((row, z) =>
      row.forEach((type, x) => {
        let list = byType.get(type);
        if (!list) byType.set(type, (list = []));
        list.push([x, z]);
      }),
    );
    return [...byType.entries()];
  }, [grid]);

  return (
    <group>
      {layers.map(([type, cells]) => (
        <TileLayer key={type} type={type} cells={cells} />
      ))}
      <InteractionPlane />
      <TileHighlight />
      <InvalidFlash />
      <AirstrikePreview />
      <PlacementGhost />
    </group>
  );
}
