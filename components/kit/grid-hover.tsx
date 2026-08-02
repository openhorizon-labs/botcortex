import { cn } from "@/lib/utils";

/**
 * Cursor-reactive background grid: invisible cells that light to off-white the
 * instant the cursor enters (hover:duration-0) and fade back out slowly.
 * A sparse set of cells also self-blinks on a slow loop (deterministic delays —
 * no Math.random, SSR-safe) so the surface feels alive before the cursor does
 * anything. Pure CSS; zero JS per mousemove.
 *
 * Place as the first child of a `relative overflow-hidden` section, and give
 * the section's content `relative z-10` so buttons stay clickable. Cells only
 * light where content doesn't cover them — by design.
 */
export function GridHover({
  cols = 32,
  rows = 12,
  className,
}: {
  cols?: number;
  rows?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("absolute inset-x-0 top-0 grid overflow-hidden", className)}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {Array.from({ length: cols * rows }, (_, i) => (
        <div
          key={i}
          className="rounded-[3px] transition-colors duration-1000 ease-standard hover:bg-surface-3 hover:duration-0"
          style={
            i % 13 === 0
              ? {
                  animation: "cell-glow 8s ease-in-out infinite",
                  animationDelay: `${(i * 911) % 8000}ms`,
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}
