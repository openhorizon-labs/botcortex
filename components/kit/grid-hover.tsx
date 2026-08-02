"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Cursor paint: moving the cursor inks the grid cells it passes over, and each
 * painted cell fades back to white over a few seconds — like heat dissipating.
 *
 * One <canvas>, no per-cell DOM. Mousemove paints cells along the interpolated
 * cursor path (fast strokes leave an unbroken line, never dots); a rAF loop
 * decays every painted cell independently and stops when the canvas is clean.
 * Listens on the parent section (events bubble) so painting works even while
 * the cursor is over text, while the canvas itself never blocks a click.
 * Skipped under prefers-reduced-motion.
 */
export function GridHover({
  cell = 18,
  gap = 2,
  fadeMs = 2800,
  maxAlpha = 0.09,
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
    let w = 0;
    let h = 0;
    let cols = 1;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.max(1, Math.ceil(w / period));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const ink = getComputedStyle(canvas).color;
    const cells = new Map<number, number>(); // cell index -> intensity 0..1
    let raf = 0;
    let last = 0;
    let prevX: number | null = null;
    let prevY: number | null = null;

    const paint = (px: number, py: number) => {
      const cx = Math.floor(px / period);
      const cy = Math.floor(py / period);
      if (cx < 0 || cy < 0 || cx >= cols) return;
      cells.set(cy * cols + cx, 1);
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
        // hold near-full briefly, then fade — paint that dries, not a blink
        ctx.globalAlpha = Math.min(1, nv * 1.5) * maxAlpha;
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
        "pointer-events-none absolute inset-x-0 top-0 w-full text-foreground",
        className,
      )}
    />
  );
}
