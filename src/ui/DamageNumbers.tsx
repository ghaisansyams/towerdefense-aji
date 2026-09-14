import { useEffect, useRef } from 'react';
import { DAMAGE_TEXT } from '../config/gameData';
import { dmgNodes } from '../game/damageNumbers';

/** a fixed pool of spans; GameLoop positions them every frame */
export default function DamageNumbers() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    dmgNodes.length = 0;
    for (const child of Array.from(el.children)) dmgNodes.push(child as HTMLElement);
    return () => {
      dmgNodes.length = 0;
    };
  }, []);

  return (
    <div className="dmg-layer" ref={host}>
      {Array.from({ length: DAMAGE_TEXT.max }, (_, i) => (
        <span key={i} className="dmg" style={{ opacity: 0 }} />
      ))}
    </div>
  );
}
