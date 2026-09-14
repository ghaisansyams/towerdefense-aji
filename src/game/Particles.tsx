import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { PARTICLES } from '../config/gameData';
import { particleNodes } from './particleSystem';

/**
 * Sparks and death debris, as two InstancedMeshes.
 *
 * Additively blended and untouched by tone mapping, so they read as hot
 * embers under bloom. GameLoop owns all their motion — this component only
 * supplies the meshes.
 */
const sparkGeo = new THREE.SphereGeometry(0.5, 6, 4);
const cubeGeo = new THREE.BoxGeometry(1, 1, 1);

const mat = () =>
  new THREE.MeshBasicMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  });

const sparkMat = mat();
const cubeMat = mat();

export default function Particles() {
  const spark = useRef<THREE.InstancedMesh>(null!);
  const cube = useRef<THREE.InstancedMesh>(null!);

  useEffect(() => {
    // instanceColor has to exist before the loop can tint anything
    spark.current.instanceColor ??= new THREE.InstancedBufferAttribute(
      new Float32Array(PARTICLES.maxSparks * 3).fill(1), 3,
    );
    cube.current.instanceColor ??= new THREE.InstancedBufferAttribute(
      new Float32Array(PARTICLES.maxCubes * 3).fill(1), 3,
    );
    spark.current.count = 0;
    cube.current.count = 0;
    particleNodes.spark = spark.current;
    particleNodes.cube = cube.current;
    return () => {
      particleNodes.spark = null;
      particleNodes.cube = null;
    };
  }, []);

  return (
    <>
      <instancedMesh
        ref={spark}
        args={[sparkGeo, sparkMat, PARTICLES.maxSparks]}
        raycast={() => null}
        frustumCulled={false}
      />
      <instancedMesh
        ref={cube}
        args={[cubeGeo, cubeMat, PARTICLES.maxCubes]}
        raycast={() => null}
        frustumCulled={false}
      />
    </>
  );
}
