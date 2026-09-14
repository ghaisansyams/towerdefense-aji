/**
 * DOM handles for the boss health bar.
 *
 * Boss HP is mutated in place and never routed through React (that is what
 * keeps 50 enemies at 60fps), so the bar is written to directly from the game
 * loop rather than re-rendered.
 */
export const bossBarNodes: {
  root: HTMLElement | null;
  fill: HTMLElement | null;
  hp: HTMLElement | null;
  name: HTMLElement | null;
} = { root: null, fill: null, hp: null, name: null };
