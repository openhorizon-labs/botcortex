"use client";

import { useEffect, useRef } from "react";
import { MARK } from "@/components/site/logo";
import { cn } from "@/lib/utils";

/**
 * The brand mark as a paintable pixel mural. The vectorized logo path becomes a
 * stencil on the grid: moving the cursor over the area paints cells — but only
 * the cells inside the mark — with the same ink-and-dry behavior as the hero's
 * GridHover. Wipe the footer and the logo appears in pixels, then fades.
 *
 * Same engine rules: one canvas, listeners on the parent (events bubble),
 * pointer-events-none, rAF stops when dry, skipped under reduced motion.
 */
export function PixelMark({
  cell = 14,
  gap = 2,
  fadeMs = 3200,
  maxAlpha = 0.16,
  className,
}: {
  cell?: number;
  gap?: number;
  fadeMs?: number;
  maxAlpha?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const period = cell + gap;
    const path = new Path2D(MARK);
    let w = 0;
    let h = 0;
    let cols = 1;
    const stencil = new Set<number>();

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.max(1, Math.ceil(w / period));

      // stencil: which grid cells sit inside the mark (mark fills the height,
      // horizontally centered; path viewBox is 200x200). isPointInPath applies
      // the current transform to the PATH, so test under identity.
      stencil.clear();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const scale = (h * 1.35) / 200; // taller than the strip: bottom crops like the wordmark
      const ox = (w - 200 * scale) / 2;
      for (let cy = 0; cy * period < h; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const px = (cx * period + cell / 2 - ox) / scale;
          const py = (cy * period + cell / 2) / scale;
          if (px < 0 || py < 0 || px > 200 || py > 200) continue;
          if (ctx.isPointInPath(path, px, py, "evenodd")) stencil.add(cy * cols + cx);
        }
      }
      ctx.restore();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const ink = getComputedStyle(canvas).color;
    const cells = new Map<number, number>();
    let raf = 0;
    let last = 0;
    let prevX: number | null = null;
    let prevY: number | null = null;

    const paint = (px: number, py: number) => {
      const cx = Math.floor(px / period);
      const cy = Math.floor(py / period);
      // a 3x3 brush so wiping a mural this size feels generous
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols) continue;
          const k = ny * cols + nx;
          if (!stencil.has(k)) continue;
          const strength = dx === 0 && dy === 0 ? 1 : 0.55;
          const v = cells.get(k) ?? 0;
          cells.set(k, Math.min(2.2, Math.max(v, strength) + (v > 0.9 ? 0.15 : 0)));
        }
      }
    };

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      ctx.clearRect(0, 0, w, h);
      const decay = dt / fadeMs;
      ctx.fillStyle = ink;
      for (const [k, v] of cells) {
        const nv = v - decay;
        if (nv <= 0) {
          cells.delete(k);
          continue;
        }
        cells.set(k, nv);
        ctx.globalAlpha = Math.min(1, nv * 1.5) * maxAlpha + Math.max(0, nv - 1) * 0.08;
        ctx.fillRect((k % cols) * period, Math.floor(k / cols) * period, cell, cell);
      }
      ctx.globalAlpha = 1;
      raf = cells.size > 0 ? requestAnimationFrame(tick) : 0;
    };

    const move = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (x < 0 || y < 0 || x > r.width || y > r.height) {
        prevX = prevY = null;
        return;
      }
      if (prevX !== null && prevY !== null) {
        const dist = Math.hypot(x - prevX, y - prevY);
        const steps = Math.max(1, Math.ceil(dist / (period * 0.5)));
        for (let i = 1; i <= steps; i++) {
          paint(prevX + ((x - prevX) * i) / steps, prevY + ((y - prevY) * i) / steps);
        }
      } else {
        paint(x, y);
      }
      prevX = x;
      prevY = y;
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    const leave = () => {
      prevX = prevY = null;
    };

    parent.addEventListener("mousemove", move);
    parent.addEventListener("mouseleave", leave);
    return () => {
      parent.removeEventListener("mousemove", move);
      parent.removeEventListener("mouseleave", leave);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [cell, gap, fadeMs, maxAlpha]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full text-foreground",
        className,
      )}
    />
  );
}
