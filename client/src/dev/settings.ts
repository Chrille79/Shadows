// Dev-console surface for the live game config. Open the browser devtools
// and mutate any field on `window.settings` — the next frame picks it up.
//
// Examples:
//   settings.physics.gravity = 2400
//   settings.camera.yLerpDown = 0.2
//   settings.grass.topRise = 8
//   settings.tint(0.4, 0.45, 0.55)
//   settings.log()
//
// Shipped defaults live in settings.json. This module just exposes the
// already-mutable `config` object on `window` and adds a few helpers that
// bundle common tweaks. Import it from main.ts/editor.ts (as is already
// done) so the bindings install at startup.

import { config } from '../config';

interface DevSettings {
  /** Live physics values (char.velY, gravity, jump, move etc.). */
  physics: typeof config.physics;
  /** Live camera values (lerp rates, deadzones). */
  camera: typeof config.camera;
  /** Live grass-overlay values (height, rise, overhang). */
  grass: typeof config.grass;
  /** Live world-tint {r,g,b}. Individual channels mutable too. */
  worldTint: typeof config.worldTint;
  /** Per-layer bg render toggles — sky gradient, hills, clouds. */
  layers: typeof config.layers;
  /** Procedural hill bands (far + near).  Tune color, amplitude, freq1/2, phase, parallax. */
  hills: typeof config.hills;
  /** Set r/g/b directly. Example: `settings.tint(0.3, 0.35, 0.45)`. */
  tint(r: number, g: number, b: number): void;
  /** Turn world tint off (all channels = 1). */
  tintOff(): void;
  /** Gothic dim preset — the old pre-Mario default. */
  tintDark(): void;
  /** Log the whole config snapshot. */
  log(): void;
  /** Print available commands and example syntax. */
  help(): void;
}

const settings: DevSettings = {
  // Direct references — mutating these mutates the live config.
  physics: config.physics,
  camera: config.camera,
  grass: config.grass,
  worldTint: config.worldTint,
  layers: config.layers,
  hills: config.hills,

  tint(r, g, b) {
    config.worldTint.r = r;
    config.worldTint.g = g;
    config.worldTint.b = b;
    console.log(`[settings] worldTint = { r: ${r}, g: ${g}, b: ${b} }`);
  },

  tintOff() { this.tint(1, 1, 1); },
  tintDark() { this.tint(0.1, 0.1, 0.2); },

  log() {
    console.log('[settings] current config', JSON.parse(JSON.stringify(config)));
  },

  help() {
    console.log(
      'Dev console — available commands:\n' +
      '  Groups (log by typing the name):\n' +
      '    physics   — gravity, moveSpeed, jumpForce, friction, terminalVelocity\n' +
      '    camera    — yLerpDown, yLerpUp, yDeadzoneUpTiles, yDeadzoneDownTiles\n' +
      '    grass     — topRise, displayH, overhang\n' +
      '    worldTint — r, g, b\n' +
      '\n' +
      '  Read:    grass.topRise\n' +
      '  Write:   grass.topRise = 8\n' +
      '\n' +
      '  Helpers:\n' +
      '    tint(r, g, b)   — set world tint rgb\n' +
      '    tintOff()       — all channels 1\n' +
      '    tintDark()      — gothic dim preset\n' +
      '    log()           — log whole config snapshot\n' +
      '    help()          — this message',
    );
  },
};

if (import.meta.env.DEV) {
  (window as unknown as { settings: DevSettings }).settings = settings;
  console.log(
    '[settings] dev console ready. Tweak live — example keys:\n' +
    '  settings.physics.gravity = 2400\n' +
    '  settings.physics.jumpForce = -1000\n' +
    '  settings.camera.yLerpDown = 0.2\n' +
    '  settings.camera.yDeadzoneDownTiles = 0.5\n' +
    '  settings.grass.topRise = 8\n' +
    '  settings.grass.displayH = 80\n' +
    '  settings.tint(r, g, b)  /  settings.tintOff()  /  settings.tintDark()\n' +
    '  settings.log()',
  );
}

export { settings };
