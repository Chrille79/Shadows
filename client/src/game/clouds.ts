// Deterministic cloud placement shared by the game and the editor so both see
// the same sky. Two separate layers (big/small) are scattered between tile rows
// 1..11 at fixed, seeded world positions — no tiling, no repetition.

import { TILE_SIZE } from '../engine/renderer';

export interface CloudInstance {
  x: number; // world-x (top-left)
  y: number; // world-y (top-left)
}

// mulberry32: tiny deterministic PRNG. Stable across runs for a given seed, so
// the editor and game produce the same cloud arrangement.
function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed = (seed + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CLOUD_Y_MIN = 1 * TILE_SIZE;   // row 1
const CLOUD_Y_MAX = 11 * TILE_SIZE;  // row 11 (exclusive upper bound for top-Y)

export interface CloudLayerSpec {
  /** Seed — different per layer so big/small clouds don't overlap. */
  seed: number;
  /** Average world-px between consecutive clouds on this layer. */
  spacingPx: number;
}

// Sparse placement: one big cloud every ~1500 world px, one small every ~1000.
// Count scales with world width so density stays constant regardless of level
// size. (WORLD_W = 7656 → 5 big, 8 small with the current spacings.)
export const BIG_CLOUDS: CloudLayerSpec = { seed: 0xC10BD1, spacingPx: 1500 };
export const SMALL_CLOUDS: CloudLayerSpec = { seed: 0xC10BD2, spacingPx: 1000 };

export function cloudCount(spec: CloudLayerSpec, worldW: number): number {
  return Math.max(1, Math.round(worldW / spec.spacingPx));
}

export function generateCloudInstances(spec: CloudLayerSpec, worldW: number): CloudInstance[] {
  const rng = mulberry32(spec.seed);
  const n = cloudCount(spec, worldW);
  const out: CloudInstance[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: rng() * worldW,
      y: CLOUD_Y_MIN + rng() * (CLOUD_Y_MAX - CLOUD_Y_MIN),
    });
  }
  return out;
}
