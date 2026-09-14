import { TOWERS, towerStats, WORLD } from '../config/gameData';
import type { Tower } from '../store/gameStore';

export interface Buff {
  dmg: number;
  rate: number;
}

/**
 * Which attack towers are inside a Support aura, and by how much.
 *
 * Supports do NOT stack: a tower covered by two pylons takes the strongest
 * of each bonus, not their sum.
 *
 * Fills the caller's `out` map rather than returning a new one, so the game
 * loop can reuse a single map every frame instead of allocating. The optional
 * `links` array collects (support, buffed) pairs for drawing the aura links —
 * both the simulation and the visuals read this one implementation, so they
 * can never disagree about who is buffed.
 */
export function computeBuffs(
  towers: Tower[],
  out: Map<string, Buff>,
  links?: Array<[Tower, Tower]>,
): void {
  out.clear();
  if (links) links.length = 0;

  for (const sup of towers) {
    if (TOWERS[sup.type].role !== 'support') continue;
    const ss = towerStats(sup.type, sup.level);
    const r2 = ss.range * ss.range;
    const sx = sup.x * WORLD.tileSize;
    const sz = sup.z * WORLD.tileSize;

    for (const tw of towers) {
      if (tw.id === sup.id || TOWERS[tw.type].role === 'support') continue;
      const dx = tw.x * WORLD.tileSize - sx;
      const dz = tw.z * WORLD.tileSize - sz;
      if (dx * dx + dz * dz > r2) continue;

      const dmg = ss.buffDamage ?? 0;
      const rate = ss.buffFireRate ?? 0;
      const cur = out.get(tw.id);
      if (!cur) out.set(tw.id, { dmg, rate });
      else {
        cur.dmg = Math.max(cur.dmg, dmg);
        cur.rate = Math.max(cur.rate, rate);
      }
      if (links) links.push([sup, tw]);
    }
  }
}
