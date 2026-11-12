import { useEffect, useRef } from 'preact/hooks';
import { orbisDots } from './orbis-dots';

const SPEED = 0.15; // rad/s

function cssVar(el: Element, name: string, fallback: string) {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

/** Orbis mark in motion (many fine dots, slowly turning) for loading and start screens. */
export function OrbisSpinner({ size = 96 }: { size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = cv.height = Math.round(size * dpr);
    const k = (size * dpr) / 120;
    const blue = cssVar(cv, '--limb', '#4f8dff');
    const amber = cssVar(cv, '--now', '#ffb547');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let rot = 0.5;
    let last = 0;
    const draw = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const d of orbisDots('motion', rot)) {
        ctx.globalAlpha = d.opacity;
        ctx.fillStyle = d.hot ? amber : blue;
        ctx.beginPath();
        ctx.arc(d.cx * k, d.cy * k, d.r * k, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const frame = (t: number) => {
      raf = 0;
      if (document.hidden) { last = 0; return; }
      if (last) rot += ((t - last) / 1000) * SPEED;
      last = t;
      draw();
      raf = requestAnimationFrame(frame);
    };
    const start = () => { if (!raf && !reduce) raf = requestAnimationFrame(frame); };
    draw();
    if (reduce) return;
    start();
    const onVis = () => { if (!document.hidden) { last = 0; start(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [size]);
  return <canvas ref={ref} class="orbis-spinner" style={{ width: `${size}px`, height: `${size}px` }} role="img" aria-label="Lädt" />;
}
