# Tower Defense

A grid-based fixed-path tower defense game that runs in the browser. Built with
React Three Fiber — every model in it is a primitive (boxes, cones, cylinders,
spheres), distinguished by colour, shape and emissive glow rather than by
imported meshes.

![Board](https://img.shields.io/badge/board-16%C3%9716-5cae42) ![Towers](https://img.shields.io/badge/towers-6-63c4f2) ![Enemies](https://img.shields.io/badge/enemies-8-e2402f) ![Waves](https://img.shields.io/badge/waves-8-ffd24a)

## Gameplay

**6 towers**, each with up to 3 upgrade tiers and 4 targeting modes
(First / Last / Strongest / Closest):

| Tower | Cost | Role |
|---|---|---|
| Arrow | $50 | Cheap all-rounder |
| Cannon | $100 | Slow, heavy single-target |
| Frost | $75 | Slows what it hits |
| Mortar | $120 | Lobbed splash damage |
| Poison | $90 | Damage over time |
| Support | $100 | Buffs neighbours (+25% dmg / +15% rate), never fires |

**8 enemy types**, each demanding a different answer:

- **Armored** subtracts a flat 15 from every hit — blunts Arrow, barely troubles Cannon
- **Splitter** breaks into two faster minis on death
- **Healer** heals everything within 2.5 every 1.5s
- **Colossus** (boss, waves 5 and 8) — 1500 HP, immune to slows, costs 5 lives at the base

**Two abilities on cooldown:** Airstrike (120 damage in radius 2, 25s) and
Deep Freeze (60% slow on everything for 4s, 30s). They are the intended
counterplay to the boss.

## Running it

```bash
npm install
npm run dev
```

## Notes on the build

- **One `useFrame`.** A single game loop drives spawning, movement, targeting,
  firing, damage, deaths and particles. Entity positions are mutated in place
  and written straight into the Three.js nodes; the zustand store is only
  written when the roster changes, which is what keeps 50 enemies at 60fps.
- **All tuning lives in `src/config/gameData.ts`** — map, tower and enemy
  stats, waves, economy, abilities, and render settings. No balance number is
  hardcoded in a component.
- **Instanced rendering** for the 256 board tiles, border scenery and
  particles, so the whole board costs a handful of draw calls.
- **Bloom is optional.** It costs roughly 20fps on integrated graphics
  regardless of resolution, so it ships off with a HUD toggle.

## Stack

Vite · React · TypeScript · @react-three/fiber · @react-three/drei ·
@react-three/postprocessing · zustand

No physics engine — targeting and movement are plain vector math.
