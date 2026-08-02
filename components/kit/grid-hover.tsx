"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Cursor-chasing grid glow. One overlay element: a radial spotlight whose
 * position lerps toward the cursor every frame (the "follow" feel), masked
 * through a fine grid of squares so it renders as small boxes lighting up
 * near the cursor and trailing off behind it. No per-cell DOM, no work when
 * the cursor is idle — the rAF loop stops once the glow catches up.
 *
 * Listens on the PARENT section (events bubble), so the glow follows the
 * cursor even while it's over text — while this layer stays pointer-events-none
 * and never blocks a click. Skips entirely under prefers-reduced-motion.
 */
export function GridHover({
  cell = 18,
  gap = 2,
  radius = 130,
  className,
}: {
  cell?: number;
  gap?: number;
  radius?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let targetX = -9999;
    let targetY = -9999;
    let x = targetX;
    let y = targetY;
    let raf = 0;

    const tick = () => {
      x += (targetX - x) * 0.16;
      y += (targetY - y) * 0.16;
      el.style.setProperty("--gx", `${x}px`);
      el.style.setProperty("--gy", `${y}px`);
      if (Math.abs(targetX - x) > 0.4 || Math.abs(targetY - y) > 0.4) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
    };

    const move = (e: MouseEvent) => {
      const r = parent.getBoundingClientRect();
      targetX = e.clientX - r.left;
      targetY = e.clientY - r.top;
      if (x < -999) {
        x = targetX;
        y = targetY;
      }
      el.style.opacity = "1";
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const leave = () => {
      el.style.opacity = "0";
    };

    parent.addEventListener("mousemove", move);
    parent.addEventListener("mouseleave", leave);
    return () => {
      parent.removeEventListener("mousemove", move);
      parent.removeEventListener("mouseleave", leave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const period = cell + gap;
  const squares = `repeating-linear-gradient(to right, black 0 ${cell}px, transparent ${cell}px ${period}px), repeating-linear-gradient(to bottom, black 0 ${cell}px, transparent ${cell}px ${period}px)`;

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 opacity-0 transition-opacity duration-500 ease-standard",
        className,
      )}
      style={{
        backgroundImage: `radial-gradient(${radius}px circle at var(--gx, -999px) var(--gy, -999px), color-mix(in oklab, var(--color-foreground) 8%, transparent), transparent 72%)`,
        maskImage: squares,
        WebkitMaskImage: squares,
        maskComposite: "intersect",
        WebkitMaskComposite: "source-in",
      }}
    />
  );
}
