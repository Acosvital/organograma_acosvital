'use client';

import { useEffect, useRef } from 'react';
import styles from './SpaceBackground.module.css';

// Mesma receita visual do fundo do GlobeCanvas (gradiente radial + estrelas com
// brilho piscando), extraída para uso em páginas estáticas que não têm o globo
// 3D (ex.: visão geral do organograma) — sem a esfera, países, órbitas etc.

interface Star { x: number; y: number; r: number; b: number; spd: number; c: number }

const TAU        = Math.PI * 2;
const STAR_COUNT = 420;

function seededRng(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function buildStars(): Star[] {
  return Array.from({ length: STAR_COUNT }, (_, i) => ({
    x:   seededRng(i * 6),
    y:   seededRng(i * 6 + 1),
    r:   0.15 + seededRng(i * 6 + 2) * (i % 12 === 0 ? 2.2 : 1.4), // estrela ocasionalmente maior/mais brilhante
    b:   seededRng(i * 6 + 3) * 0.72 + 0.18,
    spd: seededRng(i * 6 + 4) * 1.6 + 0.3,
    c:   seededRng(i * 6 + 5), // temperatura de cor
  }));
}

export default function SpaceBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef  = useRef<Star[]>([]);
  if (starsRef.current.length === 0) starsRef.current = buildStars();

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
      canvas.width  = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    let lastFrameAt = 0;
    const start = performance.now();
    // Fundo puramente decorativo — 30fps é imperceptível e reduz o custo de CPU.
    const FRAME_INTERVAL_MS = 1000 / 30;
    const starStep = reduced ? 3 : 1;

    const draw = (now: number) => {
      if (now - lastFrameAt < FRAME_INTERVAL_MS) {
        raf = requestAnimationFrame(draw);
        return;
      }
      lastFrameAt = now;

      const t  = (now - start) / 1000;
      const cx = W / 2;
      const cy = H / 2;

      const bg = ctx.createRadialGradient(cx, cy * 0.6, 0, cx, cy, Math.max(W, H) * 0.85);
      bg.addColorStop(0,   '#04091a');
      bg.addColorStop(0.5, '#02060f');
      bg.addColorStop(1,   '#010308');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      for (let i = 0; i < starsRef.current.length; i += starStep) {
        const s = starsRef.current[i];
        const tw = reduced ? 1 : 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * s.spd + s.b * 25));
        ctx.globalAlpha = s.b * 0.78 * tw;
        ctx.fillStyle = s.c < 0.28 ? '#b8d8ff' : s.c < 0.65 ? '#e8f2ff' : '#fff6e0';
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />;
}
