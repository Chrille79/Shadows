// Live tunable config — single source of truth for physics, camera, grass
// and tint. Shipped values live in `settings.json`; this module clones them
// into a mutable object so the dev console (`window.settings`, see
// `dev/settings.ts`) can tweak any value at runtime without a reload.
//
// Usage: import { config } from './config'; then read `config.physics.gravity`
// etc. at the call site. Never destructure into local constants — that
// captures the value at import time and breaks live editing.

import raw from './settings.json';

export interface HillWaveConfig {
  color: { r: number; g: number; b: number; a: number };
  /** Vertical wave amplitude in world-px. */
  amplitude: number;
  /** World-px between the wave's zero-line and groundY. */
  baseOffset: number;
  /** Primary sine frequency (radians per world-px). */
  freq1: number;
  /** Secondary sine frequency — layered for a less repetitive silhouette. */
  freq2: number;
  /** Starting phase offset (radians) — lets near layer differ from far. */
  phase: number;
  /** Parallax factor: 0 = locked to camera, 1 = moves 1:1 with world. */
  parallax: number;
}

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
  sky: {
    top: { r: number; g: number; b: number };
    bottom: { r: number; g: number; b: number };
  };
  /** Two procedural sine-wave hill bands drawn between the sky gradient
   *  and the clouds — cheaper and more tunable than AI bg plates. */
  hills: {
    far: HillWaveConfig;
    near: HillWaveConfig;
  };
  /** Per-layer on/off toggles for the bg rendering passes.  Off by default
   *  for the still-in-iteration hill layers; sky + clouds ship on. */
  layers: {
    sky: boolean;
    hillsFar: boolean;
    hillsNear: boolean;
    clouds: boolean;
  };
}

// Deep clone the JSON import so we don't depend on whether the bundler
// freezes JSON modules. Every field is mutable.
export const config: GameConfig = JSON.parse(JSON.stringify(raw)) as GameConfig;
