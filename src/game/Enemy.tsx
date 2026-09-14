import { memo, useEffect, useRef } from 'react';
import type * as THREE from 'three';
import { ENEMIES, HEALTH_BAR, PATH_SURFACE_Y } from '../config/gameData';
import type { Enemy as EnemyData } from '../store/gameStore';
import {
  barBgMat,
  barFillRamp,
  barGeo,
  bodyGeo,
  bodyMat,
  pulseGeo,
  pulseMats,
} from './enemyAssets';
import { enemyNodes } from './entityRegistry';

function EnemyView({ enemy }: { enemy: EnemyData }) {
  const root = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Mesh>(null!);
  const bar = useRef<THREE.Group>(null!);
  const fill = useRef<THREE.Mesh>(null!);
  const pulse = useRef<THREE.Mesh>(null);
  const def = ENEMIES[enemy.type];
  const isHealer = def.healRadius != null;

  useEffect(() => {
    const mesh = body.current;
    enemyNodes.set(enemy.id, {
      root: root.current,
      body: mesh,
      bar: bar.current,
      fill: fill.current,
      pulse: pulse.current,
    });
    return () => {
      enemyNodes.delete(enemy.id);
      // GameLoop swaps in a private material to fade the corpse; the shared
      // per-type material must never be disposed along with it
      const mat = mesh.material as THREE.Material;
      if (mat !== bodyMat[enemy.type]) mat.dispose();
    };
  }, [enemy.id, enemy.type]);

  // the body sits on the path surface; scale the unit primitive to size
  const bodyY = PATH_SURFACE_Y + def.height / 2;
  const barY = PATH_SURFACE_Y + def.height + HEALTH_BAR.yOffset;

  return (
    <group ref={root} position={[enemy.x, 0, enemy.z]}>
      <mesh
        castShadow
        ref={body}
        geometry={bodyGeo[enemy.type]}
        material={bodyMat[enemy.type]}
        position={[0, bodyY, 0]}
        scale={[def.size, def.height, def.size]}
      />
      {isHealer && (
        // flat on the ground, expanded by GameLoop on each heal tick
        <mesh
          ref={pulse}
          geometry={pulseGeo}
          material={pulseMats[0]}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, PATH_SURFACE_Y + 0.03, 0]}
          scale={0}
          visible={false}
          renderOrder={5}
        />
      )}
      {/* billboarded by GameLoop (quaternion copied from the camera) */}
      <group ref={bar} position={[0, barY, 0]} visible={false}>
        <mesh geometry={barGeo} material={barBgMat} renderOrder={10} />
        <mesh
          ref={fill}
          geometry={barGeo}
          material={barFillRamp[0]}
          position={[0, 0, 0.001]}
          renderOrder={11}
        />
      </group>
    </group>
  );
}

/** memoised: the roster re-renders on every spawn, the bodies need not */
export default memo(EnemyView, (a, b) => a.enemy.id === b.enemy.id);
