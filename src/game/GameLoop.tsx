import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  ABILITIES,
  COMBAT,
  ENEMIES,
  FX,
  HEALTH_BAR,
  INVALID_FLASH,
  PATH,
  PATH_SURFACE_Y,
  progressToSeg,
  SPLIT_SPREAD,
  TILE_STYLE,
  TOWERS,
  towerStats,
  WAVES,
  WORLD,
} from '../config/gameData';
import {
  makeEnemy,
  newProjectileId,
  useGameStore,
  type Enemy,
  type Projectile,
} from '../store/gameStore';
import { bodyMat, pulseMats, rampFor } from './enemyAssets';
import { computeBuffs, type Buff } from './support';
import { emitDeath, emitSparks, stepParticles } from './particleSystem';
import { emitDamage, stepDamageNumbers } from './damageNumbers';
import { flashNode, invalidFlash } from './feedback';
import { bossBarNodes } from './bossBar';
import {
  enemyNodes,
  projectileNodes,
  towerFlash,
  towerNodes,
} from './entityRegistry';

/** longest frame we simulate; anything bigger (tab was hidden) is clamped */
const MAX_DELTA = 0.1;

/** reused across frames: rebuilding this Map allocated ~80 objects a frame */
const enemyById = new Map<string, Enemy>();

/** healer id -> { life 1..0, radius }. Presentation only; the radius rides
 *  along so the draw loop never has to search the enemy list. */
const pulse = new Map<string, { t: number; radius: number }>();

/** support buffs, recomputed each frame into this reused map */
const buffs = new Map<string, Buff>();

/** distance from spawn, used for "first" targeting */
const progressOf = (e: Enemy) => PATH.segs[e.seg].start + e.distInSeg;

/**
 * Apply a slow, unless the target ignores them. Every slow in the game goes
 * through here so immunity can never be forgotten at one of the call sites.
 */
const applySlow = (e: Enemy, amount: number, durationMs: number, now: number) => {
  if (ENEMIES[e.type].slowImmune) return false;
  e.speedMul = 1 - amount;
  e.slowUntil = now + durationMs;
  return true;
};

/** centre height of an enemy body, where projectiles aim */
const centreY = (e: Enemy) => PATH_SURFACE_Y + ENEMIES[e.type].height / 2;

/**
 * THE game loop. One useFrame drives spawning, movement, targeting, firing,
 * projectile flight, damage, deaths and base arrivals. Nothing else in the
 * scene runs per-frame logic.
 *
 * Entity positions are mutated in place and written straight into the
 * registered Three nodes. Store writes are batched into a single commit at
 * the end of the frame.
 */
export default function GameLoop() {
  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, MAX_DELTA);
    const now = state.clock.elapsedTime * 1000;
    const store = useGameStore.getState();
    if (store.phase === 'lost' || store.phase === 'won') return;

    // ---- wave spawning
    const runner = store.waveRunner;
    if (store.phase === 'wave' && runner) {
      const wave = WAVES[store.currentWave];

      if (!runner.done) {
        runner.timerMs -= dt * 1000;
        // a long frame can owe several spawns; pay them all out
        while (!runner.done && runner.timerMs <= 0) {
          const group = wave.groups[runner.groupIndex];
          store.spawnEnemy(group.enemyType);
          runner.spawnedInGroup += 1;

          if (runner.spawnedInGroup >= group.count) {
            runner.groupIndex += 1;
            runner.spawnedInGroup = 0;
            if (runner.groupIndex >= wave.groups.length) {
              runner.done = true;
              break;
            }
          }
          runner.timerMs += wave.groups[runner.groupIndex].spawnIntervalMs;
        }
      } else if (useGameStore.getState().enemies.length === 0) {
        // everything spawned and the board is clear.
        // enemies removed last frame are already gone from this read.
        store.completeWave();
        return;
      }
    }

    const { enemies, towers, projectiles } = useGameStore.getState();
    const arrived: string[] = [];
    const removeEnemyIds: string[] = [];
    const removeProjectileIds: string[] = [];
    const addProjectiles: Projectile[] = [];
    const addEnemies: Enemy[] = [];
    let moneyDelta = 0;

    /**
     * The one place an enemy dies. Poison ticks kill outside the projectile
     * path, so reward, splitting and the fade material all have to live here
     * rather than inline with a hit.
     */
    const killEnemy = (victim: Enemy) => {
      if (victim.dying) return;
      victim.hp = 0;
      victim.dying = true;
      victim.deathT = 0;
      moneyDelta += ENEMIES[victim.type].reward;

      const split = ENEMIES[victim.type].splitInto;
      if (split) {
        const centre = PATH.segs[victim.seg].start + victim.distInSeg;
        for (let i = 0; i < split.count; i++) {
          const offset = (i - (split.count - 1) / 2) * SPLIT_SPREAD;
          const at = progressToSeg(centre + offset);
          addEnemies.push(makeEnemy(split.type, at.seg, at.distInSeg));
        }
      }

      emitDeath(victim.x, centreY(victim), victim.z, ENEMIES[victim.type].color);

      const nodes = enemyNodes.get(victim.id);
      if (nodes && nodes.body.material === bodyMat[victim.type]) {
        const solo = bodyMat[victim.type].clone();
        solo.transparent = true;
        nodes.body.material = solo;
      }
    };

    // ---- player abilities: queued by the UI, resolved here so their effects
    // share the loop's clock and the one damage/kill path
    const pending = store.pendingAbility;
    if (pending) {
      store.clearPendingAbility();
      if (pending.kind === 'airstrike' && pending.x != null && pending.z != null) {
        const a = ABILITIES.airstrike;
        const ax = pending.x * WORLD.tileSize;
        const az = pending.z * WORLD.tileSize;
        const r2 = a.radius * a.radius;
        for (const e of enemies) {
          if (e.dying) continue;
          const dx = e.x - ax;
          const dz = e.z - az;
          if (dx * dx + dz * dz > r2) continue;
          const armor = ENEMIES[e.type].armor ?? 0;
          const dealt = Math.max(COMBAT.minDamage, a.damage - armor);
          e.hp -= dealt;
          emitDamage(e.x, centreY(e) + 0.3, e.z, dealt, 'splash');
          if (e.hp <= 0) killEnemy(e);
        }
        emitSparks(ax, PATH_SURFACE_Y + 0.2, az, a.color);
        emitSparks(ax, PATH_SURFACE_Y + 0.5, az, a.color);
      } else if (pending.kind === 'deepFreeze') {
        const a = ABILITIES.deepFreeze;
        for (const e of enemies) {
          if (e.dying) continue;
          if (applySlow(e, a.slowAmount, a.durationMs, now)) {
            emitSparks(e.x, centreY(e), e.z, a.color);
          }
        }
      }
    }

    // ---- support auras (shared with the link visuals; see support.ts)
    computeBuffs(towers, buffs);

    // ================================================== 1. enemies
    for (const e of enemies) {
      const nodes = enemyNodes.get(e.id);

      // ---- dying: play the scale-down + fade, then drop it
      if (e.dying) {
        e.deathT += dt / COMBAT.deathDuration;
        if (e.deathT >= 1) {
          removeEnemyIds.push(e.id);
          continue;
        }
        if (nodes) {
          const k = 1 - e.deathT;
          // scale the ROOT, not the body: the body mesh already carries the
          // per-type size scale, and the root sits on the ground so the
          // corpse shrinks downward instead of toward its own centre
          nodes.root.scale.setScalar(k);
          nodes.bar.visible = false;
          (nodes.body.material as THREE.MeshLambertMaterial).opacity = k;
        }
        continue;
      }

      // ---- poison: a damage-over-time that ignores armour (armour blunts
      // discrete hits, not a toxin already in the bloodstream)
      if (e.poisonUntil > now && e.poisonDps > 0) {
        e.hp -= e.poisonDps * dt;
        if (e.hp <= 0) {
          killEnemy(e);
          continue;
        }
      }

      // ---- healer: periodic area heal of everything BUT itself
      const edef = ENEMIES[e.type];
      if (edef.healRadius != null && edef.healAmount != null && edef.healIntervalMs != null) {
        e.healTimer -= dt * 1000;
        if (e.healTimer <= 0) {
          e.healTimer += edef.healIntervalMs;
          const r2 = edef.healRadius * edef.healRadius;
          for (const other of enemies) {
            if (other === e || other.dying) continue; // never itself, never a corpse
            const dx = other.x - e.x;
            const dz = other.z - e.z;
            if (dx * dx + dz * dz > r2) continue;
            other.hp = Math.min(other.maxHp, other.hp + edef.healAmount);
          }
          pulse.set(e.id, { t: 1, radius: edef.healRadius });
        }
      }

      // ---- frost slow: a refresh extends the window, it never compounds
      e.speedMul = now < e.slowUntil ? e.speedMul : 1;

      const def = ENEMIES[e.type];
      let advance = def.speed * e.speedMul * dt;

      while (advance > 0 && e.seg < PATH.segs.length) {
        const seg = PATH.segs[e.seg];
        const remaining = seg.len - e.distInSeg;
        if (advance < remaining) {
          e.distInSeg += advance;
          advance = 0;
        } else {
          advance -= remaining;
          e.seg += 1;
          e.distInSeg = 0;
        }
      }

      if (e.seg >= PATH.segs.length) {
        arrived.push(e.id);
        continue;
      }

      const seg = PATH.segs[e.seg];
      const t = seg.len === 0 ? 0 : e.distInSeg / seg.len;
      e.x = seg.ax + (seg.bx - seg.ax) * t;
      e.z = seg.az + (seg.bz - seg.az) * t;

      if (!nodes) continue;
      nodes.root.position.set(e.x, 0, e.z);
      nodes.bar.quaternion.copy(state.camera.quaternion);
      const frac = Math.max(0, Math.min(1, e.hp / e.maxHp));
      // an undamaged enemy shows no bar at all
      const show = !HEALTH_BAR.hideWhenFull || frac < 0.999;
      nodes.bar.visible = show;
      if (show) {
        nodes.fill.scale.x = frac;
        nodes.fill.position.x = -(HEALTH_BAR.width * (1 - frac)) / 2;
        // swap along the shared ramp, never mutate a material
        nodes.fill.material = rampFor(frac);
      }
    }

    // ================================================== 2. towers fire
    for (const tw of towers) {
      if (TOWERS[tw.type].role === 'support') continue; // pylons never fire
      tw.cooldown -= dt;
      if (tw.cooldown > 0) continue;
      const def = towerStats(tw.type, tw.level);
      const buff = buffs.get(tw.id);
      const tx = tw.x * WORLD.tileSize;
      const tz = tw.z * WORLD.tileSize;

      // acquisition: every mode is "highest score wins", so they share one
      // pass over the enemies in range
      let target: Enemy | null = null;
      let best = -Infinity;
      const r2 = def.range * def.range;
      for (const e of enemies) {
        if (e.dying) continue;
        const dx = e.x - tx;
        const dz = e.z - tz;
        const d2 = dx * dx + dz * dz;
        if (d2 > r2) continue;

        let score: number;
        switch (tw.targetMode) {
          case 'last': score = -progressOf(e); break;
          case 'strongest': score = e.hp; break;
          case 'closest': score = -d2; break;
          default: score = progressOf(e); break;   // 'first'
        }
        if (score > best) {
          best = score;
          target = e;
        }
      }

      if (!target) continue;

      tw.cooldown = 1 / (def.fireRate * (1 + (buff?.rate ?? 0)));
      towerFlash.set(tw.id, 1); // cosmetic only

      const dmgMul = 1 + (buff?.dmg ?? 0);
      const muzzleY = PATH_SURFACE_Y + COMBAT.muzzleY;
      const shot: Projectile = {
        id: newProjectileId(),
        towerType: tw.type,
        targetId: target.id,
        x: tx,
        y: muzzleY,
        z: tz,
        damage: def.damage * dmgMul,
        speed: def.projectileSpeed,
        life: 0,
        // carried on the shot so a mid-flight upgrade can't retro-change it
        slowAmount: def.slowAmount,
        slowDurationMs: def.slowDurationMs,
        poisonDps: def.poisonDps != null ? def.poisonDps * dmgMul : undefined,
        poisonMs: def.poisonMs,
        aoeRadius: def.aoeRadius,
      };

      if (def.aoeRadius != null) {
        // lobbed at where the target IS, not where it will be
        const gx = target.x;
        const gz = target.z;
        shot.ballistic = {
          ox: tx, oy: muzzleY, oz: tz,
          ix: gx, iz: gz,
          dist: Math.max(0.001, Math.hypot(gx - tx, gz - tz)),
          t: 0,
          arc: def.arcHeight ?? 1.5,
        };
      }

      addProjectiles.push(shot);
    }

    // ================================================== 3. projectiles
    enemyById.clear();
    for (const e of enemies) enemyById.set(e.id, e);

    for (const p of projectiles) {
      p.life += dt;

      // ---------------------------------------------- ballistic (mortar)
      if (p.ballistic) {
        const b = p.ballistic;
        b.t += (p.speed * dt) / b.dist;

        if (b.t >= 1 || p.life > COMBAT.maxLifetime) {
          removeProjectileIds.push(p.id);

          emitSparks(b.ix, PATH_SURFACE_Y + 0.15, b.iz, TOWERS[p.towerType].projectileColor);

          // detonate: everything inside the blast takes the full shell damage
          const r = p.aoeRadius ?? 0;
          const r2 = r * r;
          for (const e of enemies) {
            if (e.dying) continue;
            const ex = e.x - b.ix;
            const ez = e.z - b.iz;
            if (ex * ex + ez * ez > r2) continue;

            const armor = ENEMIES[e.type].armor ?? 0;
            const dealt = Math.max(COMBAT.minDamage, p.damage - armor);
            e.hp -= dealt;
            emitDamage(e.x, centreY(e) + 0.3, e.z, dealt, 'splash');
            if (e.hp <= 0) killEnemy(e);
          }
          continue;
        }

        // straight line across the ground, parabola in the air
        p.x = b.ox + (b.ix - b.ox) * b.t;
        p.z = b.oz + (b.iz - b.oz) * b.t;
        const groundY = b.oy + (PATH_SURFACE_Y - b.oy) * b.t;
        p.y = groundY + Math.sin(Math.PI * b.t) * b.arc;

        const node = projectileNodes.get(p.id);
        if (node) {
          node.position.set(p.x, p.y, p.z);
          // aim along the tangent of the arc so the trail follows the lob
          const ahead = Math.min(1, b.t + 0.04);
          const ax = b.ox + (b.ix - b.ox) * ahead;
          const az = b.oz + (b.iz - b.oz) * ahead;
          const ay =
            b.oy + (PATH_SURFACE_Y - b.oy) * ahead +
            Math.sin(Math.PI * ahead) * b.arc;
          node.lookAt(ax, ay, az);
        }
        continue;
      }

      // ---------------------------------------------- homing
      const target = enemyById.get(p.targetId);

      // target gone or died mid-flight, or the shot went stray
      if (!target || target.dying || p.life > COMBAT.maxLifetime) {
        removeProjectileIds.push(p.id);
        continue;
      }

      const tx = target.x;
      const ty = centreY(target);
      const tz = target.z;
      const dx = tx - p.x;
      const dy = ty - p.y;
      const dz = tz - p.z;
      const dist = Math.hypot(dx, dy, dz);
      const step = p.speed * dt;

      if (dist <= Math.max(step, COMBAT.hitRadius)) {
        // ---- hit
        removeProjectileIds.push(p.id);
        emitSparks(tx, ty, tz, TOWERS[p.towerType].projectileColor);

        // armour subtracts a flat amount from EVERY hit before it lands, so
        // many small hits are blunted and one big hit barely notices — but a
        // hit never heals, so it is floored at minDamage. A shot that carries
        // no direct damage (Poison) skips this entirely rather than being
        // floored up to 1.
        if (p.damage > 0) {
          const armor = ENEMIES[target.type].armor ?? 0;
          const dealt = Math.max(COMBAT.minDamage, p.damage - armor);
          target.hp -= dealt;
          emitDamage(tx, ty + 0.3, tz, dealt, 'hit');
        }

        if (p.slowAmount != null && p.slowDurationMs != null) {
          // refresh the window; never stack the multiplier. A slow-immune
          // target still took the damage above — only the slow is refused.
          applySlow(target, p.slowAmount, p.slowDurationMs, now);
        }

        if (p.poisonDps != null && p.poisonMs != null) {
          // refresh the window and take the stronger dose; never add stacks
          target.poisonDps = Math.max(target.poisonDps, p.poisonDps);
          target.poisonUntil = now + p.poisonMs;
        }

        if (target.hp <= 0) killEnemy(target);
        continue;
      }

      const k = step / dist;
      p.x += dx * k;
      p.y += dy * k;
      p.z += dz * k;

      const pnode = projectileNodes.get(p.id);
      if (pnode) {
        pnode.position.set(p.x, p.y, p.z);
        pnode.lookAt(tx, ty, tz); // Object3D.lookAt aims +Z at the target
      }
    }

    // ---- heal pulse rings: expand to the heal radius, stepping down through
    // the shared fade materials. Scale + material swap only, never a mutation.
    for (const [id, v] of pulse) {
      const nodes = enemyNodes.get(id);
      v.t -= (dt * 1000) / FX.healPulseMs;
      if (v.t <= 0 || !nodes?.pulse) {
        if (nodes?.pulse) nodes.pulse.visible = false;
        pulse.delete(id);
        continue;
      }
      const grow = 1 - v.t; // 0 at the moment of the heal, 1 when spent
      nodes.pulse.visible = true;
      nodes.pulse.scale.setScalar(0.15 + grow * v.radius);
      const step = Math.min(
        pulseMats.length - 1,
        Math.floor(grow * pulseMats.length),
      );
      nodes.pulse.material = pulseMats[step];
    }

    // ============================================ 3b. cosmetics
    // Purely visual: muzzle flash decay and the selected-tower pop. Both are
    // animated by scale so the shared flash material is never mutated, and
    // neither touches gameplay state.
    const selectedId = store.selectedTowerId;
    const ease = 1 - Math.exp(-FX.popEase * dt); // frame-rate independent
    for (const tw of towers) {
      const nodes = towerNodes.get(tw.id);
      if (!nodes) continue;

      // level size and the selection pop multiply, so an upgraded tower still
      // pops and a maxed one still reads as bigger
      const wantScale =
        (FX.levelScale[tw.level - 1] ?? 1) *
        (selectedId === tw.id ? FX.selectedScale : 1);
      const cur = nodes.root.scale.x;
      if (Math.abs(cur - wantScale) > 0.001) {
        nodes.root.scale.setScalar(cur + (wantScale - cur) * ease);
      }

      const f = towerFlash.get(tw.id) ?? 0;
      if (f > 0) {
        const next = Math.max(0, f - (dt * 1000) / FX.flashMs);
        towerFlash.set(tw.id, next);
        nodes.flash.visible = next > 0;
        nodes.flash.scale.setScalar(next);
      } else if (nodes.flash.visible) {
        nodes.flash.visible = false;
      }
    }

    // ---- refused-placement flash
    if (invalidFlash.t > 0 && flashNode.mesh) {
      invalidFlash.t = Math.max(0, invalidFlash.t - (dt * 1000) / INVALID_FLASH.ms);
      const mesh = flashNode.mesh;
      mesh.visible = invalidFlash.t > 0;
      mesh.position.set(
        invalidFlash.x * WORLD.tileSize,
        TILE_STYLE.buildable.height + WORLD.tileFloorY + 0.02,
        invalidFlash.z * WORLD.tileSize,
      );
      // pulse twice over the life of the flash
      const k = invalidFlash.t;
      (mesh.material as THREE.MeshBasicMaterial).opacity =
        INVALID_FLASH.opacity * k * (0.55 + 0.45 * Math.abs(Math.sin(k * Math.PI * 2)));
    }

    // ---- boss bar: driven straight into the DOM because enemy hp is mutated
    // in place and never passes through React
    if (bossBarNodes.root) {
      const boss = enemies.find((e) => ENEMIES[e.type].isBoss && !e.dying);
      if (!boss) {
        if (bossBarNodes.root.dataset.on === '1') {
          bossBarNodes.root.dataset.on = '0';
          bossBarNodes.root.style.opacity = '0';
        }
      } else {
        const frac = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
        bossBarNodes.root.dataset.on = '1';
        bossBarNodes.root.style.opacity = '1';
        if (bossBarNodes.fill) bossBarNodes.fill.style.width = `${(frac * 100).toFixed(1)}%`;
        if (bossBarNodes.hp) {
          bossBarNodes.hp.textContent = `${Math.ceil(boss.hp)} / ${boss.maxHp}`;
        }
        if (bossBarNodes.name) bossBarNodes.name.textContent = ENEMIES[boss.type].name;
      }
    }

    stepParticles(dt);
    stepDamageNumbers(dt, state.camera, state.size.width, state.size.height);

    // ================================================== 4. commit
    if (arrived.length) store.enemiesReachedBase(arrived);
    if (
      addEnemies.length ||
      addProjectiles.length ||
      removeProjectileIds.length ||
      removeEnemyIds.length ||
      moneyDelta
    ) {
      store.commitFrame({
        addEnemies,
        addProjectiles,
        removeProjectileIds,
        removeEnemyIds,
        moneyDelta,
      });
    }
  });

  return null;
}
