// Live tunable config — single source of truth for physics, camera, grass
// and tint. Shipped values live in `settings.json`; this module clones them
// into a mutable object so the dev console (`window.settings`, see
// `dev/settings.ts`) can tweak any value at runtime without a reload.
//
// Usage: import { config } from './config'; then read `config.physics.gravity`
// etc. at the call site. Never destructure into local constants — that
// captures the value at import time and breaks live editing.

import raw from './settings.json';

export interface GameConfig {
  physics: {
    gravity: number;
    moveSpeed: number;
    jumpForce: number;
    friction: number;
    terminalVelocity: number;
  };
  camera: {
    yLerpDown: number;
    yLerpUp: number;
    yDeadzoneUpTiles: number;
    yDeadzoneDownTiles: number;
  };
  grass: {
    topRise: number;
    displayH: number;
    overhang: number;
  };
  worldTint: { r: number; g: number; b: number };
}

// Deep clone the JSON import so we don't depend on whether the bundler
// freezes JSON modules. Every field is mutable.
export const config: GameConfig = JSON.parse(JSON.stringify(raw)) as GameConfig;
