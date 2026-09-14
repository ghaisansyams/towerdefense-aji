import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  CAMERA,
  GRID_CENTER,
  LIGHTING,
  RENDER,
  WORLD,
} from '../config/gameData';
import { useGameStore } from '../store/gameStore';
import Grid from './Grid';
import Decor from './Decor';
import Tower, { SupportLinks } from './Tower';
import Enemy from './Enemy';
import Projectile from './Projectile';
import Particles from './Particles';
import GameLoop from './GameLoop';
import CameraIntro from './CameraIntro';

/** dark slab under the tiles so the seams between them don't show background */
function Ground() {
  return (
    <mesh
      receiveShadow
      rotation={[-Math.PI / 2, 0, 0]}
      position={[GRID_CENTER[0], WORLD.tileFloorY - 0.01, GRID_CENTER[2]]}
    >
      <planeGeometry
        args={[WORLD.gridW * WORLD.tileSize + 6, WORLD.gridH * WORLD.tileSize + 6]}
      />
      <meshLambertMaterial color={WORLD.groundColor} />
    </mesh>
  );
}

/** warm key light, aimed at the board so its shadow camera can stay tight */
function Lights({ shadows }: { shadows: boolean }) {
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(...GRID_CENTER);
    return o;
  }, []);
  const s = RENDER.shadow;

  return (
    <>
      <ambientLight color={LIGHTING.ambientColor} intensity={LIGHTING.ambientIntensity} />
      <hemisphereLight
        color={LIGHTING.hemiSky}
        groundColor={LIGHTING.hemiGround}
        intensity={LIGHTING.hemiIntensity}
      />
      <primitive object={target} />
      <directionalLight
        castShadow={shadows}
        target={target}
        color={LIGHTING.keyColor}
        intensity={LIGHTING.keyIntensity}
        position={[
          GRID_CENTER[0] + LIGHTING.keyOffset[0],
          LIGHTING.keyOffset[1],
          GRID_CENTER[2] + LIGHTING.keyOffset[2],
        ]}
        shadow-mapSize-width={s.mapSize}
        shadow-mapSize-height={s.mapSize}
        shadow-camera-near={s.near}
        shadow-camera-far={s.far}
        shadow-camera-left={-s.extent}
        shadow-camera-right={s.extent}
        shadow-camera-top={s.extent}
        shadow-camera-bottom={-s.extent}
        shadow-bias={s.bias}
        shadow-normalBias={s.normalBias}
      />
    </>
  );
}

function Towers() {
  const towers = useGameStore((s) => s.towers);
  return (
    <>
      {towers.map((t) => (
        <Tower key={t.id} tower={t} />
      ))}
      <SupportLinks />
    </>
  );
}

function Enemies() {
  const enemies = useGameStore((s) => s.enemies);
  return (
    <>
      {enemies.map((e) => (
        <Enemy key={e.id} enemy={e} />
      ))}
    </>
  );
}

function Projectiles() {
  const projectiles = useGameStore((s) => s.projectiles);
  return (
    <>
      {projectiles.map((p) => (
        <Projectile key={p.id} projectile={p} />
      ))}
    </>
  );
}

export default function Scene() {
  const selectTower = useGameStore((s) => s.selectTower);
  const controls = useRef<OrbitControlsImpl>(null);
  const quality = useGameStore((s) => s.quality);

  return (
    <Canvas
      shadows="soft"
      // cap DPR: retina at 3x costs a lot for zero readability gain here
      dpr={[1, RENDER.maxDpr]}
      onPointerMissed={() => selectTower(null)}
      camera={{
        position: CAMERA.position,
        fov: CAMERA.fov,
        near: CAMERA.near,
        far: CAMERA.far,
      }}
    >
      <color attach="background" args={[RENDER.fog.color]} />
      <fog attach="fog" args={[RENDER.fog.color, RENDER.fog.near, RENDER.fog.far]} />

      <Lights shadows={quality.shadows} />

      <Ground />
      <Grid />
      <Decor />
      <Towers />
      <Enemies />
      <Projectiles />
      <Particles />
      <GameLoop />

      <CameraIntro controls={controls} />

      <OrbitControls
        ref={controls}
        target={GRID_CENTER}
        minPolarAngle={CAMERA.minPolarAngle}
        maxPolarAngle={CAMERA.maxPolarAngle}
        minDistance={CAMERA.minDistance}
        maxDistance={CAMERA.maxDistance}
        enableDamping
        dampingFactor={0.08}
      />

      {quality.bloom && (
      <EffectComposer>
        <Bloom
          intensity={RENDER.bloom.intensity}
          luminanceThreshold={RENDER.bloom.threshold}
          luminanceSmoothing={RENDER.bloom.smoothing}
          radius={RENDER.bloom.radius}
          resolutionScale={RENDER.bloom.resolutionScale}
          levels={RENDER.bloom.levels}
          mipmapBlur
        />
      </EffectComposer>
      )}
    </Canvas>
  );
}
