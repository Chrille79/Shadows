const TICK_RATE = 1000 / 60;

export interface GameCallbacks {
  update(dt: number): void;
  render(alpha: number): void;
}

export function startGameLoop(callbacks: GameCallbacks) {
  let accumulator = 0;
  let lastTime = 0;
  let running = true;

  function loop(time: number) {
    if (!running) return;

    const delta = Math.min(time - lastTime, 100); // Cap to avoid spiral of death
    lastTime = time;
    accumulator += delta;

    while (accumulator >= TICK_RATE) {
      callbacks.update(TICK_RATE / 1000);
      accumulator -= TICK_RATE;
    }

    callbacks.render(accumulator / TICK_RATE);
    requestAnimationFrame(loop);
  }

  requestAnimationFrame((time) => {
    lastTime = time;
    requestAnimationFrame(loop);
  });

  return () => { running = false; };
}
