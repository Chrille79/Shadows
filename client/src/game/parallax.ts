import type { SpriteRenderer } from '../engine/spriteRenderer';

// Seeded random for deterministic generation
function seededRandom(seed: number) {
  return () => {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

interface Star {
  x: number;
  y: number;
  size: number;
  brightness: number;
  twinkleSpeed: number;
  twinkleOffset: number;
}

interface MountainPeak {
  x: number;
  height: number;
  width: number;
}

interface Cloud {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  segments: { dx: number; dy: number; w: number; h: number }[];
}

interface FloatingParticle {
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
  drift: number;
}

export interface ParallaxBackground {
  update(dt: number, cameraX: number): void;
  render(sprites: SpriteRenderer, screenW: number, screenH: number): void;
}

export function createParallaxBackground(): ParallaxBackground {
  const rng = seededRandom(42);

  // ── Layer 0: Stars (furthest back, barely moves) ──
  const stars: Star[] = [];
  for (let i = 0; i < 200; i++) {
    stars.push({
      x: rng() * 3840,
      y: rng() * 600,
      size: 1 + rng() * 2.5,
      brightness: 0.3 + rng() * 0.7,
      twinkleSpeed: 0.5 + rng() * 3,
      twinkleOffset: rng() * Math.PI * 2,
    });
  }

  // ── Layer 1: Far mountains (very slow parallax) ──
  const farMountains: MountainPeak[] = [];
  for (let x = -200; x < 4000; x += 80 + rng() * 120) {
    farMountains.push({
      x,
      height: 120 + rng() * 200,
      width: 160 + rng() * 240,
    });
  }

  // ── Layer 2: Near mountains (medium parallax) ──
  const nearMountains: MountainPeak[] = [];
  for (let x = -200; x < 4000; x += 100 + rng() * 150) {
    nearMountains.push({
      x,
      height: 80 + rng() * 180,
      width: 120 + rng() * 200,
    });
  }

  // ── Layer 3: Clouds (slow drift) ──
  const clouds: Cloud[] = [];
  for (let i = 0; i < 12; i++) {
    const cx = rng() * 3840;
    const cy = 40 + rng() * 250;
    const baseW = 80 + rng() * 200;
    const segments: Cloud['segments'] = [];

    const numSegs = 3 + Math.floor(rng() * 4);
    for (let s = 0; s < numSegs; s++) {
      segments.push({
        dx: (rng() - 0.5) * baseW * 0.7,
        dy: (rng() - 0.5) * 20,
        w: 40 + rng() * baseW * 0.6,
        h: 20 + rng() * 30,
      });
    }

    clouds.push({
      x: cx,
      y: cy,
      width: baseW,
      height: 40,
      opacity: 0.03 + rng() * 0.06,
      segments,
    });
  }

  // ── Layer 4: Floating particles (atmospheric dust/embers) ──
  const particles: FloatingParticle[] = [];
  for (let i = 0; i < 60; i++) {
    particles.push({
      x: rng() * 3840,
      y: rng() * 1080,
      size: 1 + rng() * 3,
      speed: 5 + rng() * 20,
      opacity: 0.1 + rng() * 0.3,
      drift: (rng() - 0.5) * 30,
    });
  }

  let time = 0;
  let camX = 0;

  function update(dt: number, cameraX: number) {
    time += dt;
    camX = cameraX;

    for (const p of particles) {
      p.y -= p.speed * dt;
      p.x += p.drift * dt;
      if (p.y < -10) {
        p.y = 1100;
        p.x = rng() * 3840;
      }
    }

    for (const c of clouds) {
      c.x += 8 * dt;
      if (c.x > 4000) c.x = -300;
    }
  }

  function render(sprites: SpriteRenderer, screenW: number, screenH: number) {
    // ── Sky gradient ──
    sprites.drawSprite({
      x: 0, y: 0,
      width: screenW, height: screenH * 0.3,
      r: 0.02, g: 0.01, b: 0.06, a: 1,
    });
    sprites.drawSprite({
      x: 0, y: screenH * 0.25,
      width: screenW, height: screenH * 0.35,
      r: 0.04, g: 0.03, b: 0.12, a: 1,
    });
    sprites.drawSprite({
      x: 0, y: screenH * 0.55,
      width: screenW, height: screenH * 0.45,
      r: 0.06, g: 0.04, b: 0.14, a: 1,
    });

    // Horizon glow
    sprites.drawSprite({
      x: 0, y: screenH * 0.55,
      width: screenW, height: screenH * 0.12,
      r: 0.15, g: 0.06, b: 0.25, a: 0.3,
    });

    // Center ambient light
    sprites.drawSprite({
      x: screenW * 0.3, y: screenH * 0.5,
      width: screenW * 0.4, height: screenH * 0.15,
      r: 0.12, g: 0.05, b: 0.22, a: 0.2,
    });

    // ── Stars (parallax: 0.02) ──
    const starOffset = camX * 0.02;
    for (const s of stars) {
      const twinkle = 0.5 + 0.5 * Math.sin(time * s.twinkleSpeed + s.twinkleOffset);
      const alpha = s.brightness * (0.4 + 0.6 * twinkle);
      const sx = ((s.x - starOffset) % screenW + screenW) % screenW;

      if (s.size > 2) {
        sprites.drawSprite({
          x: sx - s.size * 2, y: s.y - s.size * 2,
          width: s.size * 5, height: s.size * 5,
          r: 0.4, g: 0.3, b: 0.8, a: alpha * 0.15,
        });
      }

      sprites.drawSprite({
        x: sx, y: s.y,
        width: s.size, height: s.size,
        r: 0.8, g: 0.85, b: 1.0, a: alpha,
      });
    }

    // ── Far mountains (parallax: 0.05) ──
    const farOffset = camX * 0.05;
    for (const m of farMountains) {
      const mx = m.x - farOffset;
      if (mx + m.width < -100 || mx > screenW + 100) continue;

      const baseY = screenH * 0.65;
      const steps = 8;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const stepH = m.height / steps;
        const taper = 1 - t * 0.85;
        const w = m.width * taper;
        const y = baseY - (i + 1) * stepH;
        const darkness = 0.06 + t * 0.04;

        sprites.drawSprite({
          x: mx + (m.width - w) / 2, y,
          width: w, height: stepH + 1,
          r: darkness, g: darkness * 0.7, b: darkness + 0.08, a: 0.9,
        });
      }

      if (m.height > 250) {
        const capW = m.width * 0.12;
        sprites.drawSprite({
          x: mx + m.width / 2 - capW / 2, y: baseY - m.height,
          width: capW, height: m.height * 0.08,
          r: 0.25, g: 0.22, b: 0.35, a: 0.5,
        });
      }
    }

    // ── Near mountains (parallax: 0.12) ──
    const nearOffset = camX * 0.12;
    for (const m of nearMountains) {
      const mx = m.x - nearOffset;
      if (mx + m.width < -100 || mx > screenW + 100) continue;

      const baseY = screenH * 0.7;
      const steps = 6;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const stepH = m.height / steps;
        const taper = 1 - t * 0.8;
        const w = m.width * taper;
        const y = baseY - (i + 1) * stepH;
        const darkness = 0.08 + t * 0.03;

        sprites.drawSprite({
          x: mx + (m.width - w) / 2, y,
          width: w, height: stepH + 1,
          r: darkness + 0.02, g: darkness * 0.6, b: darkness + 0.1, a: 0.95,
        });
      }

      sprites.drawSprite({
        x: mx + m.width * 0.3, y: baseY - m.height + 5,
        width: m.width * 0.05, height: m.height * 0.6,
        r: 0.15, g: 0.1, b: 0.22, a: 0.3,
      });
    }

    // ── Ground fill ──
    sprites.drawSprite({
      x: 0, y: screenH * 0.65,
      width: screenW, height: screenH * 0.35,
      r: 0.05, g: 0.03, b: 0.1, a: 1,
    });

    // ── Clouds (parallax: 0.08) ──
    const cloudOffset = camX * 0.08;
    for (const c of clouds) {
      const cx = ((c.x - cloudOffset) % (screenW + 400)) - 200;
      for (const seg of c.segments) {
        sprites.drawSprite({
          x: cx + seg.dx, y: c.y + seg.dy,
          width: seg.w, height: seg.h,
          r: 0.3, g: 0.25, b: 0.5, a: c.opacity,
        });
      }
    }

    // ── Floating particles (parallax: 0.3) ──
    const partOffset = camX * 0.3;
    for (const p of particles) {
      const px = ((p.x - partOffset) % screenW + screenW) % screenW;
      const pulse = 0.7 + 0.3 * Math.sin(time * 2 + p.x);

      sprites.drawSprite({
        x: px, y: p.y,
        width: p.size, height: p.size,
        r: 0.5, g: 0.3, b: 0.8, a: p.opacity * pulse,
      });
    }

    // ── Atmospheric fog ──
    sprites.drawSprite({
      x: 0, y: screenH * 0.6,
      width: screenW, height: screenH * 0.08,
      r: 0.1, g: 0.06, b: 0.18, a: 0.15,
    });
  }

  return { update, render };
}
