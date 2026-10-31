import { useEffect, useRef } from 'react';

// Procedural, low-resolution blocky landscape with blossoming trees and a few
// drifting petals. Drawn at ~1/4 resolution and upscaled with pixelated
// rendering, so it costs almost nothing. Every colour derives from the
// accent colour chosen in the settings.

const W = 384;
const H = 216;

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mixes `a` towards `b` by `t` (0..1) and returns a CSS colour. */
function mix(a: RGB, b: RGB, t: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const BLACK: RGB = [8, 8, 11];
const WHITE: RGB = [255, 255, 255];

function palette(accent: string) {
  const a = hexToRgb(accent);
  return {
    skyTop: mix(BLACK, a, 0.12),
    skyBottom: mix(BLACK, a, 0.03),
    star: a,
    moon: mix(BLACK, a, 0.32),
    moonLight: mix(BLACK, a, 0.42),
    ridges: [mix(BLACK, a, 0.1), mix(BLACK, a, 0.07), mix(BLACK, a, 0.04)],
    trunk: mix(BLACK, a, 0.08),
    leaves: [mix(BLACK, a, 0.45), mix(BLACK, a, 0.58), mix(a, WHITE, 0.1), mix(BLACK, a, 0.38)],
    petals: [mix(a, WHITE, 0.25), mix(BLACK, a, 0.7)],
  };
}

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function drawScene(ctx: CanvasRenderingContext2D, p: ReturnType<typeof palette>) {
  const r = rng(7);
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, p.skyTop);
  sky.addColorStop(1, p.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Pixel stars, tinted by the accent.
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(${p.star[0]},${p.star[1]},${p.star[2]},${0.2 + r() * 0.4})`;
    ctx.fillRect(Math.floor(r() * W), Math.floor(r() * H * 0.5), 1, 1);
  }

  // Moon (blocky disc).
  const mx = 300, my = 46, mr = 26;
  for (let y = -mr; y <= mr; y += 2) {
    for (let x = -mr; x <= mr; x += 2) {
      if (x * x + y * y <= mr * mr) {
        ctx.fillStyle = x + y < -10 ? p.moonLight : p.moon;
        ctx.fillRect(mx + x, my + y, 2, 2);
      }
    }
  }

  // Blocky ridges, back to front.
  const ridges: [number, number, number][] = [
    [120, 26, 8],
    [146, 18, 6],
    [172, 12, 4],
  ];
  ridges.forEach(([base, amp, step], i) => {
    ctx.fillStyle = p.ridges[i];
    let h = base;
    for (let x = 0; x < W; x += step) {
      h += Math.round((r() - 0.5) * amp * 0.6);
      h = Math.max(base - amp, Math.min(base + amp * 0.5, h));
      ctx.fillRect(x, h, step, H - h);
    }
  });

  // Blossoming trees on the middle ridge.
  for (let t = 0; t < 9; t++) {
    const tx = Math.floor(20 + r() * (W - 40));
    const ty = 150 + Math.floor(r() * 14);
    const trunkH = 10 + Math.floor(r() * 8);
    ctx.fillStyle = p.trunk;
    ctx.fillRect(tx, ty - trunkH, 2, trunkH);
    const cw = 14 + Math.floor(r() * 10);
    const ch = 8 + Math.floor(r() * 5);
    for (let y = 0; y < ch; y += 2) {
      for (let x = -cw / 2; x < cw / 2; x += 2) {
        const edge = Math.abs(x) / (cw / 2) + Math.abs(y - ch / 2) / ch;
        if (edge < 1 && r() > 0.15) {
          ctx.fillStyle = p.leaves[Math.floor(r() * p.leaves.length)];
          ctx.fillRect(tx + x, ty - trunkH - ch + y + 2, 2, 2);
        }
      }
    }
  }

  // Foreground block grid.
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let x = 0; x < W; x += 8) ctx.fillRect(x, 180, 1, H - 180);
}

interface Petal {
  x: number;
  y: number;
  vx: number;
  vy: number;
  c: number;
}

export function SakuraBackground({ animate, accent }: { animate: boolean; accent: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const p = palette(accent);
    const scene = document.createElement('canvas');
    scene.width = W;
    scene.height = H;
    drawScene(scene.getContext('2d')!, p);

    const r = rng(42);
    const petals: Petal[] = Array.from({ length: 22 }, () => ({
      x: r() * W,
      y: r() * H,
      vx: 0.15 + r() * 0.25,
      vy: 0.12 + r() * 0.2,
      c: r() > 0.5 ? 0 : 1,
    }));

    let frame = 0;
    let last = 0;
    const draw = (t: number) => {
      frame = requestAnimationFrame(draw);
      if (t - last < 33) return; // ~30 fps is plenty for drifting petals
      last = t;
      ctx.drawImage(scene, 0, 0);
      for (const pt of petals) {
        pt.x += pt.vx;
        pt.y += pt.vy;
        if (pt.x > W || pt.y > H) {
          pt.x = r() * W * 0.6 - 20;
          pt.y = -2;
        }
        ctx.fillStyle = p.petals[pt.c];
        ctx.fillRect(Math.round(pt.x), Math.round(pt.y), 2, 1);
      }
    };

    ctx.drawImage(scene, 0, 0);
    if (animate) frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [animate, accent]);

  return (
    <div className="bg-layer" aria-hidden="true">
      <canvas ref={ref} width={W} height={H} className="bg-canvas" />
      <div className="bg-shade" />
    </div>
  );
}
