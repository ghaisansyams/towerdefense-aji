import { memo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { COMBAT, FX, TOWERS, type TowerTypeId } from '../config/gameData';
import type { Projectile as ProjectileData } from '../store/gameStore';
import { projectileNodes } from './entityRegistry';

/** shared head + trail geometry, one material pair per firing tower type */
const headGeo = new THREE.SphereGeometry(COMBAT.projectileRadius, 10, 8);

/** cone pointing back down -Z; GameLoop aims the group's +Z along the flight */
const trailGeo = new THREE.ConeGeometry(FX.trailRadius, FX.trailLength, 8);
trailGeo.rotateX(Math.PI / 2); // tip toward +Z
trailGeo.translate(0, 0, -FX.trailLength / 2);

const headMats = Object.fromEntries(
  (Object.keys(TOWERS) as TowerTypeId[]).map((id) => [
    id,
    new THREE.MeshBasicMaterial({ color: TOWERS[id].projectileColor, toneMapped: false }),
  ]),
) as Record<TowerTypeId, THREE.MeshBasicMaterial>;

const trailMats = Object.fromEntries(
  (Object.keys(TOWERS) as TowerTypeId[]).map((id) => [
    id,
    new THREE.MeshBasicMaterial({
      color: TOWERS[id].projectileColor,
      toneMapped: false,
      transparent: true,
      opacity: FX.trailOpacity,
      depthWrite: false,
    }),
  ]),
) as Record<TowerTypeId, THREE.MeshBasicMaterial>;

function ProjectileView({ projectile }: { projectile: ProjectileData }) {
  const ref = useRef<THREE.Group>(null!);

  useEffect(() => {
    projectileNodes.set(projectile.id, ref.current);
    return () => {
      projectileNodes.delete(projectile.id);
    };
  }, [projectile.id]);

  return (
    <group
      ref={ref}
      position={[projectile.x, projectile.y, projectile.z]}
      scale={FX.projectileScale[projectile.towerType] ?? 1}
    >
      <mesh geometry={headGeo} material={headMats[projectile.towerType]} />
      <mesh geometry={trailGeo} material={trailMats[projectile.towerType]} />
    </group>
  );
}

export default memo(ProjectileView, (a, b) => a.projectile.id === b.projectile.id);
