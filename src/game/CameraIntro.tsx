import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { CAMERA, FX } from '../config/gameData';

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * One-shot camera settle on load: drops in from slightly higher and further
 * back, then hands control to OrbitControls.
 *
 * Presentation only, and it switches itself off — this is the one useFrame
 * besides GameLoop, and it stops running after ~1.1s. OrbitControls is
 * disabled while it plays so the two never fight over the camera, and the
 * final frame snaps to exactly CAMERA.position so the resting pose is
 * identical to having no intro at all.
 */
export default function CameraIntro({
  controls,
}: {
  controls: React.RefObject<OrbitControlsImpl | null>;
}) {
  const elapsed = useRef(0);
  const done = useRef(false);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const c = controls.current;
    if (c) c.enabled = false;
    camera.position.set(
      CAMERA.position[0],
      CAMERA.position[1] + FX.introLift,
      CAMERA.position[2] + FX.introPull,
    );
    camera.lookAt(...CAMERA.target);
  }, [camera, controls]);

  useFrame((_, delta) => {
    if (done.current) return;
    elapsed.current += delta * 1000;
    const t = Math.min(1, elapsed.current / FX.introMs);
    const k = easeOut(t);

    camera.position.set(
      CAMERA.position[0],
      CAMERA.position[1] + FX.introLift * (1 - k),
      CAMERA.position[2] + FX.introPull * (1 - k),
    );
    camera.lookAt(...CAMERA.target);

    if (t >= 1) {
      done.current = true;
      camera.position.set(...CAMERA.position); // exact resting pose
      camera.lookAt(...CAMERA.target);
      const c = controls.current;
      if (c) {
        c.enabled = true;
        c.update();
      }
    }
  });

  return null;
}
