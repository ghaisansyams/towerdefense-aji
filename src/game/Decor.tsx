import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DECOR, type DecorItem, WORLD } from '../config/gameData';

/**
 * Border scenery: rocks and trees.
 *
 * Purely decorative and never interactive — it is drawn as three
 * InstancedMeshes (rocks, trunks, foliage) so the whole border costs three
 * draw calls instead of one per object, and it is not part of the pointer
 * raycast at all.
 */
const rockGeo = new THREE.SphereGeometry(0.5, 8, 6);
const trunkGeo = new THREE.CylinderGeometry(0.5, 0.55, 1, 6);
const foliageGeo = new THREE.ConeGeometry(0.5, 1, 7);

const rockMat = new THREE.MeshLambertMaterial({ color: '#8d9199' });
const trunkMat = new THREE.MeshLambertMaterial({ color: '#6b4a2f' });
const foliageMat = new THREE.MeshLambertMaterial({ color: '#2f7d3a' });

function Layer({
  items,
  geometry,
  material,
  place,
}: {
  items: DecorItem[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** fills position + scale for one item */
  place: (d: DecorItem, pos: THREE.Vector3, scale: THREE.Vector3) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null!);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const axis = new THREE.Vector3(0, 1, 0);
    items.forEach((d, i) => {
      place(d, pos, scale);
      pos.x += d.x * WORLD.tileSize;
      pos.z += d.z * WORLD.tileSize;
      quat.setFromAxisAngle(axis, d.rot);
      ref.current.setMatrixAt(i, m.compose(pos, quat, scale));
    });
    ref.current.count = items.length;
    ref.current.instanceMatrix.needsUpdate = true;
  }, [items, place]);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, Math.max(items.length, 1)]}
      // scenery must never eat a click meant for a tile
      castShadow
      receiveShadow
      raycast={() => null}
      frustumCulled={false}
    />
  );
}

export default function Decor() {
  const rocks = useMemo(() => DECOR.filter((d) => d.kind === 'rock'), []);
  const trees = useMemo(() => DECOR.filter((d) => d.kind === 'tree'), []);

  const placeRock = useMemo(
    () => (d: DecorItem, pos: THREE.Vector3, scale: THREE.Vector3) => {
      const s = d.scale;
      scale.set(s * 0.62, s * 0.34, s * 0.62);   // flattened sphere
      pos.set(0, s * 0.16, 0);
    },
    [],
  );
  const placeTrunk = useMemo(
    () => (d: DecorItem, pos: THREE.Vector3, scale: THREE.Vector3) => {
      const s = d.scale;
      scale.set(s * 0.12, s * 0.42, s * 0.12);
      pos.set(0, s * 0.21, 0);
    },
    [],
  );
  const placeFoliage = useMemo(
    () => (d: DecorItem, pos: THREE.Vector3, scale: THREE.Vector3) => {
      const s = d.scale;
      scale.set(s * 0.66, s * 0.86, s * 0.66);
      pos.set(0, s * 0.42 + s * 0.43, 0);
    },
    [],
  );

  return (
    <group>
      <Layer items={rocks} geometry={rockGeo} material={rockMat} place={placeRock} />
      <Layer items={trees} geometry={trunkGeo} material={trunkMat} place={placeTrunk} />
      <Layer items={trees} geometry={foliageGeo} material={foliageMat} place={placeFoliage} />
    </group>
  );
}
