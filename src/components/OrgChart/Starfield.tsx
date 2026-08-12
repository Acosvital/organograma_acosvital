'use client';

import { useEffect, useRef } from 'react';
import styles from './Starfield.module.css';

interface ViewBox { x: number; y: number; w: number; h: number }

interface Props {
  /** Live viewBox ref (shared with OrgChart) — read each frame for parallax. */
  vbRef: React.RefObject<ViewBox>;
  /** Reference viewBox width for the current mode (zoom ≈ 1 at the default view). */
  baseW: number;
}

interface Star {
  nx: number;     // normalised x (0..1)
  ny: number;     // normalised y (0..1)
  depth: number;  // 0 = far (still, dim), 1 = near (parallax, bright)
  base: number;   // base brightness
  tw: number;     // twinkle speed
  phase: number;  // twinkle phase offset
  tint: string;   // "r,g,b"
}

interface Nebula {
  nx: number;
  ny: number;
  r: number;      // radius as fraction of min(W,H)
  depth: number;
  color: string;  // "r,g,b"
  alpha: number;
}

const STAR_COUNT = 230;
const TINTS = ['255,255,255', '255,255,255', '255,255,255', '205,222,255', '255,240,214'];

function makeStars(): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const depth = Math.random();
    stars.push({
      nx: Math.random(),
      ny: Math.random(),
      depth,
      base: 0.35 + Math.random() * 0.55,
      tw: 0.6 + Math.random() * 1.8,
      phase: Math.random() * Math.PI * 2,
      tint: TINTS[(Math.random() * TINTS.length) | 0],
    });
  }
  return stars;
}

const NEBULAE: Nebula[] = [
  { nx: 0.26, ny: 0.32, r: 0.58, depth: 0.15, color: '37, 99, 235',  alpha: 0.13 },
  { nx: 0.74, ny: 0.64, r: 0.52, depth: 0.20, color: '139, 92, 246', alpha: 0.11 },
  { nx: 0.58, ny: 0.18, r: 0.44, depth: 0.10, color: '20, 184, 166', alpha: 0.08 },
  { nx: 0.15, ny: 0.78, r: 0.36, depth: 0.08, color: '245, 158, 11', alpha: 0.05 },
];

export default function Starfield({ vbRef, baseW }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  if (starsRef.current.length === 0) starsRef.current = makeStars();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const mod = (v: number, m: number) => ((v % m) + m) % m;

    let raf = 0;
    let last = { cx: NaN, cy: NaN, z: NaN };
    let lastFrameAt = 0;
    const start = performance.now();
    // Fundo puramente decorativo — 30fps é imperceptível aqui e corta a
    // metade do custo de CPU (gradientes + 230 estrelas) em SoCs móveis
    // fracos (ex. painéis touch Android), que rodam isso o tempo todo.
    const FRAME_INTERVAL_MS = 1000 / 30;

    const draw = (now: number) => {
      if (now - lastFrameAt < FRAME_INTERVAL_MS) {
        raf = requestAnimationFrame(draw);
        return;
      }
      lastFrameAt = now;

      const vb = vbRef.current;
      const camX = vb.x + vb.w / 2;
      const camY = vb.y + vb.h / 2;
      const zoom = Math.max(0.4, Math.min(2.4, baseW / vb.w));

      // For reduced-motion users: only repaint when the camera actually moved.
      if (reduced) {
        if (camX === last.cx && camY === last.cy && zoom === last.z) {
          raf = requestAnimationFrame(draw);
          return;
        }
        last = { cx: camX, cy: camY, z: zoom };
      }

      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, W, H);

      // ── Nebulae (soft colour depth) — large & slow, no tiling needed ──
      for (const n of NEBULAE) {
        const pf = 0.015 + n.depth * 0.05;
        const gx = n.nx * W - camX * pf;
        const gy = n.ny * H - camY * pf;
        const rad = n.r * Math.min(W, H) * (0.85 + (zoom - 1) * 0.15);
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad);
        g.addColorStop(0, `rgba(${n.color}, ${n.alpha})`);
        g.addColorStop(1, `rgba(${n.color}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
      }

      // ── Stars ──
      for (const s of starsRef.current) {
        const pf = 0.02 + s.depth * 0.10;
        const px = mod(s.nx * W - camX * pf, W);
        const py = mod(s.ny * H - camY * pf, H);
        const size = (0.5 + s.depth * 1.5) * (0.85 + (zoom - 1) * 0.25);
        const twinkle = reduced ? 1 : 0.55 + 0.45 * Math.sin(t * s.tw + s.phase);
        const alpha = Math.max(0, s.base * twinkle * (0.55 + s.depth * 0.45));

        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.3, size), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.tint}, ${alpha})`;
        ctx.fill();

        // Cross-glow nas estrelas mais brilhantes e próximas
        if (s.depth > 0.72 && size > 0.9) {
          const glowA = alpha * 0.22;
          ctx.fillStyle = `rgba(${s.tint}, ${glowA})`;
          ctx.fillRect(px - size * 4, py - size * 0.38, size * 8, size * 0.76);
          ctx.fillRect(px - size * 0.38, py - size * 4, size * 0.76, size * 8);
        }
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [vbRef, baseW]);

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />;
}
