import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useMemo } from 'react';
import {
  FX,
  PATH_SURFACE_Y,
  RANGE_RING,
  RENDER,
  TOWERS,
  towerStats,
  WORLD,
  type TowerTypeId,
} from '../config/gameData';
import { useGameStore, type Tower as TowerData } from '../store/gameStore';
import { towerFlash, towerNodes } from './entityRegistry';
import { computeBuffs } from './support';

/* ------------------------------------------------------------------ *
 * Shared geometry + material singletons. Towers are built from these  *
 * every render, so placing 10 towers allocates nothing new.           *
 * ------------------------------------------------------------------ */

const GEO = {
  arrowShaft: new THREE.CylinderGeometry(0.2, 0.24, 0.5, 12),
  arrowTip: new THREE.ConeGeometry(0.26, 0.45, 12),
  cannonBase: new THREE.BoxGeometry(0.6, 0.34, 0.6),
  cannonBarrel: new THREE.CylinderGeometry(0.22, 0.24, 0.3, 14),
  frostColumn: new THREE.CylinderGeometry(0.17, 0.22, 0.95, 12),
  frostCap: new THREE.OctahedronGeometry(0.19),
  mortarBase: new THREE.BoxGeometry(0.72, 0.26, 0.72),
  mortarBarrel: new THREE.CylinderGeometry(0.15, 0.19, 0.62, 12),
  poisonDrum: new THREE.CylinderGeometry(0.23, 0.26, 0.78, 14),
  poisonCap: new THREE.SphereGeometry(0.2, 12, 8),
  /** 4-sided cone = a pylon */
  supportPylon: new THREE.ConeGeometry(0.3, 1.0, 4),
  supportOrb: new THREE.OctahedronGeometry(0.16),
};

/** emissive bodies are what make the towers read as neon under bloom */
const solid = (c: string, glow = 0) =>
  new THREE.MeshLambertMaterial({
    color: c,
    emissive: glow > 0 ? new THREE.Color(c) : new THREE.Color('#000000'),
    emissiveIntensity: glow,
  });

const glowFor = (id: TowerTypeId) =>
  id === 'frost' ? RENDER.emissive.frost
  : id === 'poison' ? RENDER.emissive.poison
  : id === 'support' ? RENDER.emissive.support
  : RENDER.emissive.towerBarrel;
const ghost = (c: string) =>
  new THREE.MeshLambertMaterial({
    color: c,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });

const MAT = {
  solid: {} as Record<TowerTypeId, { body: THREE.Material; accent: THREE.Material }>,
  ghost: {} as Record<TowerTypeId, { body: THREE.Material; accent: THREE.Material }>,
};
(Object.keys(TOWERS) as TowerTypeId[]).forEach((id) => {
  const def = TOWERS[id];
  MAT.solid[id] = { body: solid(def.color, glowFor(id)), accent: solid(def.accent) };
  MAT.ghost[id] = { body: ghost(def.color), accent: ghost(def.accent) };
});

/** ring geometries are cached per radius — only 2 distinct radii exist */
/** muzzle flash: one geometry + one material for every tower. It is animated
 *  by SCALE, never by opacity, so the shared material is never mutated. */
const flashGeo = new THREE.SphereGeometry(FX.flashSize, 8, 6);
const flashMat = new THREE.MeshBasicMaterial({
  toneMapped: false,   // stay hot so bloom catches the flash
  color: FX.flashColor,
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
  depthTest: false, // a 110ms puff should never be swallowed by the barrel
});

/** collar at the tower base marking an upgraded tower; one shared material
 *  per level, never mutated */
const bandGeo = new THREE.CylinderGeometry(0.37, 0.42, 0.08, 18);
const bandMats = FX.levelBandColor.map(
  (c) => new THREE.MeshLambertMaterial({ color: c }),
);

const ringCache = new Map<number, THREE.RingGeometry>();
function ringGeo(radius: number) {
  let g = ringCache.get(radius);
  if (!g) {
    g = new THREE.RingGeometry(radius - RANGE_RING.edgeWidth, radius, 64);
    ringCache.set(radius, g);
  }
  return g;
}

const diskCache = new Map<number, THREE.CircleGeometry>();
function diskGeo(radius: number) {
  let g = diskCache.get(radius);
  if (!g) {
    g = new THREE.CircleGeometry(radius, 56);
    diskCache.set(radius, g);
  }
  return g;
}

/* ------------------------------------------------------------------ */

/** flat translucent disk + brighter edge, laid on the ground */
export function RangeRing({ radius, color }: { radius: number; color: string }) {
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      <mesh geometry={diskGeo(radius)} renderOrder={1}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={RANGE_RING.fillOpacity}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={ringGeo(radius)} renderOrder={2}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={RANGE_RING.edgeOpacity}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/** faint permanent aura marking a Support pylon's reach */
export function SupportAura({ radius }: { radius: number }) {
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
      <mesh geometry={diskGeo(radius)} renderOrder={0}>
        <meshBasicMaterial
          color={FX.auraColor}
          transparent
          opacity={FX.auraFill}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={ringGeo(radius)} renderOrder={1}>
        <meshBasicMaterial
          color={FX.auraColor}
          transparent
          opacity={FX.auraEdge}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * Gold threads from each pylon to the towers it is buffing.
 *
 * Rebuilt only when the tower list changes — never per frame — and it reads
 * the SAME computeBuffs() the game loop uses, so what you see linked is
 * exactly what is being buffed.
 */
const linkGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
const linkMat = new THREE.MeshBasicMaterial({
  color: FX.linkColor,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
});
const UP = new THREE.Vector3(0, 1, 0);

export function SupportLinks() {
  const towers = useGameStore((s) => s.towers);

  const links = useMemo(() => {
    const pairs: Array<[typeof towers[number], typeof towers[number]]> = [];
    computeBuffs(towers, new Map(), pairs);
    return pairs.map(([sup, tw], i) => {
      const ax = sup.x * WORLD.tileSize;
      const az = sup.z * WORLD.tileSize;
      const bx = tw.x * WORLD.tileSize;
      const bz = tw.z * WORLD.tileSize;
      const dir = new THREE.Vector3(bx - ax, 0, bz - az);
      const len = dir.length();
      const quat = new THREE.Quaternion().setFromUnitVectors(
        UP,
        dir.clone().normalize(),
      );
      return {
        key: `${sup.id}-${tw.id}-${i}`,
        position: [(ax + bx) / 2, FX.linkY, (az + bz) / 2] as [number, number, number],
        quaternion: quat,
        scale: [FX.linkRadius, len, FX.linkRadius] as [number, number, number],
      };
    });
  }, [towers]);

  return (
    <>
      {links.map((l) => (
        <mesh
          key={l.key}
          geometry={linkGeo}
          material={linkMat}
          position={l.position}
          quaternion={l.quaternion}
          scale={l.scale}
        />
      ))}
    </>
  );
}

/** the primitive body only — reused by placed towers and the hover ghost */
export function TowerMesh({
  type,
  isGhost = false,
}: {
  type: TowerTypeId;
  isGhost?: boolean;
}) {
  const m = isGhost ? MAT.ghost[type] : MAT.solid[type];

  if (type === 'arrow') {
    return (
      <group>
        <mesh castShadow geometry={GEO.arrowShaft} material={m.accent} position={[0, 0.25, 0]} />
        <mesh castShadow geometry={GEO.arrowTip} material={m.body} position={[0, 0.72, 0]} />
      </group>
    );
  }

  if (type === 'cannon') {
    return (
      <group>
        <mesh castShadow geometry={GEO.cannonBase} material={m.accent} position={[0, 0.17, 0]} />
        <mesh castShadow geometry={GEO.cannonBarrel} material={m.body} position={[0, 0.49, 0]} />
      </group>
    );
  }

  if (type === 'frost') {
    return (
      <group>
        <mesh castShadow geometry={GEO.frostColumn} material={m.body} position={[0, 0.48, 0]} />
        <mesh castShadow geometry={GEO.frostCap} material={m.accent} position={[0, 1.1, 0]} />
      </group>
    );
  }

  if (type === 'mortar') {
    return (
      <group>
        <mesh castShadow geometry={GEO.mortarBase} material={m.accent} position={[0, 0.13, 0]} />
        {/* barrel cocked back ~35 degrees: it lobs rather than shoots flat */}
        <mesh
          castShadow
          geometry={GEO.mortarBarrel}
          material={m.body}
          position={[0, 0.46, -0.04]}
          rotation={[-Math.PI / 5.1, 0, 0]}
        />
      </group>
    );
  }

  if (type === 'poison') {
    return (
      <group>
        <mesh castShadow geometry={GEO.poisonDrum} material={m.body} position={[0, 0.39, 0]} />
        <mesh castShadow geometry={GEO.poisonCap} material={m.accent} position={[0, 0.85, 0]} />
      </group>
    );
  }

  return (
    <group>
      <mesh castShadow geometry={GEO.supportPylon} material={m.body} position={[0, 0.5, 0]} />
      <mesh castShadow geometry={GEO.supportOrb} material={m.accent} position={[0, 1.16, 0]} />
    </group>
  );
}

/** one placed tower: body, click-to-select, range ring while selected */
export default function Tower({ tower }: { tower: TowerData }) {
  const selectTower = useGameStore((s) => s.selectTower);
  const isSelected = useGameStore((s) => s.selectedTowerId === tower.id);
  const stats = towerStats(tower.type, tower.level);

  const body = useRef<THREE.Group>(null!);
  const flash = useRef<THREE.Mesh>(null!);

  useEffect(() => {
    towerNodes.set(tower.id, { root: body.current, flash: flash.current });
    return () => {
      towerNodes.delete(tower.id);
      towerFlash.delete(tower.id);
    };
  }, [tower.id]);

  return (
    <group position={[tower.x * WORLD.tileSize, 0, tower.z * WORLD.tileSize]}>
      <group
        ref={body}
        onClick={(e) => {
          e.stopPropagation();
          selectTower(tower.id);
        }}
      >
        <TowerMesh type={tower.type} />
        {tower.level > 1 && (
          <mesh
            castShadow
            geometry={bandGeo}
            material={bandMats[tower.level - 2]}
            position={[0, 0.04, 0]}
          />
        )}
      </group>
      {/* starts collapsed; GameLoop pops the scale on each shot */}
      <mesh
        ref={flash}
        geometry={flashGeo}
        material={flashMat}
        position={[0, PATH_SURFACE_Y + FX.flashY[tower.type], 0]}
        renderOrder={20}
        scale={0}
        visible={false}
      />
      {TOWERS[tower.type].role === 'support' && (
        <SupportAura radius={stats.range} />
      )}
      {isSelected && <RangeRing radius={stats.range} color={RANGE_RING.selected} />}
    </group>
  );
}
