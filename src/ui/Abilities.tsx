import { useEffect, useState } from 'react';
import { ABILITIES, type AbilityId } from '../config/gameData';
import { useGameStore } from '../store/gameStore';

const IDS = Object.keys(ABILITIES) as AbilityId[];

/**
 * Cooldowns are stored as performance.now() timestamps, so this only needs a
 * light poll to render the countdown — no per-frame React work.
 */
export default function Abilities() {
  const readyAt = useGameStore((s) => s.abilityReadyAt);
  const armed = useGameStore((s) => s.armedAbility);
  const armAbility = useGameStore((s) => s.armAbility);
  const useAbility = useGameStore((s) => s.useAbility);
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 200);
    return () => clearInterval(t);
  }, []);

  const now = performance.now();

  return (
    <div className="abilities panel">
      {IDS.map((id) => {
        const def = ABILITIES[id];
        const left = Math.max(0, readyAt[id] - now);
        const ready = left <= 0;
        const pct = ready ? 0 : (left / def.cooldownMs) * 100;
        const isArmed = armed === id;
        return (
          <button
            key={id}
            className={`ability${ready ? '' : ' cooling'}${isArmed ? ' armed' : ''}`}
            disabled={!ready}
            style={{ '--accent': def.color, '--pct': `${pct}%` } as React.CSSProperties}
            onClick={() => {
              // the airstrike needs a target, so it arms instead of firing
              if (id === 'airstrike') armAbility('airstrike');
              else useAbility(id);
            }}
          >
            <span className="ability-sweep" />
            <span className="ability-name">{def.name}</span>
            <span className="ability-sub">
              {ready ? (isArmed ? 'Pick a tile' : def.blurb) : `${(left / 1000).toFixed(1)}s`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
