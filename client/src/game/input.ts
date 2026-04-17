export interface InputBindings {
  left: string[];
  right: string[];
  jump: string[];
}

export const PLAYER_BINDINGS: InputBindings = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  jump: ['Space'],
};

// Global key state
const keys: Record<string, boolean> = {};
const justPressed: Record<string, boolean> = {};

function onKeyDown(e: KeyboardEvent) {
  if (!keys[e.code]) {
    justPressed[e.code] = true;
  }
  keys[e.code] = true;
}

function onKeyUp(e: KeyboardEvent) {
  keys[e.code] = false;
}

let installed = false;
export function installInput() {
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
}

export function disposeInput() {
  if (!installed) return;
  installed = false;
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  for (const k in keys) delete keys[k];
  for (const k in justPressed) delete justPressed[k];
}

export function isHeld(bindings: InputBindings, action: keyof InputBindings): boolean {
  return bindings[action].some((key) => keys[key]);
}

export function wasPressed(bindings: InputBindings, action: keyof InputBindings): boolean {
  return bindings[action].some((key) => justPressed[key]);
}

export function clearFrameInput() {
  for (const key in justPressed) {
    delete justPressed[key];
  }
}
