import { cn } from "@/lib/utils";

/**
 * Isometric feature illustrations. Plates/cubes come from the projection
 * p(x,y,z) = (0.866(x−y), 0.5(x+y)−z); readable props (speech bubble, key,
 * signal arcs) are drawn in screen space on top, the way the reference mixes
 * flat elements into iso scenes.
 *
 * Interaction: every icon is a CHOREOGRAPHY — several parts move on hover with
 * staggered `delay-*` classes, all driven by a `group` class on the card.
 * Outer <g> carries only the CSS transform; inner <g> holds the iso matrix,
 * so CSS never overrides the attribute. Honors prefers-reduced-motion.
 */

const ISO = "matrix(0.866 0.5 -0.866 0.5 0 0)";
const MOVE = "transition-all duration-300 ease-standard";

function Plate({
  cx,
  cy,
  size,
  rx = 10,
  fill = "var(--color-background)",
  children,
  className,
}: {
  cx: number;
  cy: number;
  size: number;
  rx?: number;
  fill?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <g className={className}>
      <g transform={`translate(${cx} ${cy})`}>
        <g transform={ISO}>
          <rect
            x={-size / 2}
            y={-size / 2}
            width={size}
            height={size}
            rx={rx}
            fill={fill}
            stroke="currentColor"
            strokeWidth="1.4"
            vectorEffect="non-scaling-stroke"
          />
          {children}
        </g>
      </g>
    </g>
  );
}

function Cube({
  cx,
  cy,
  s,
  className,
  topFill = "var(--color-background)",
  sideFill = "var(--color-surface-3)",
}: {
  cx: number;
  cy: number;
  s: number;
  className?: string;
  topFill?: string;
  sideFill?: string;
}) {
  const w = 0.866 * s;
  const h = 0.5 * s;
  const common = {
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinejoin: "round" as const,
  };
  return (
    <g className={className}>
      <g transform={`translate(${cx} ${cy})`}>
        <polygon points={`0,${-s - h} ${w},${-s} 0,${-s + h} ${-w},${-s}`} fill={topFill} {...common} />
        <polygon points={`${-w},${-s} 0,${-s + h} 0,0 ${-w},${-h}`} fill={sideFill} {...common} />
        <polygon points={`${w},${-s} 0,${-s + h} 0,0 ${w},${-h}`} fill={sideFill} {...common} />
      </g>
    </g>
  );
}

/** Teach: a speech bubble over the robot's base — the bubble lifts, a new line
 *  of text appears, and the robot acknowledges with a dot. */
export function TeachIso({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 150 130" fill="none" className={cn("text-foreground/60", className)} aria-hidden>
      <Plate cx={75} cy={88} size={64} rx={14} fill="var(--color-surface-3)" className={cn(MOVE, "motion-safe:group-hover:translate-y-[2px]")}>
        {/* the robot acknowledges, slightly after the message lands */}
        <circle cx={0} cy={0} r={3} fill="currentColor" stroke="none" className={cn(MOVE, "opacity-0 delay-200 motion-safe:group-hover:opacity-100")} />
      </Plate>
      {/* the message */}
      <g className={cn(MOVE, "motion-safe:group-hover:-translate-y-[6px]")}>
        <path d="M62 64l-5 9 11-3" fill="var(--color-background)" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <rect x={44} y={28} width={62} height={37} rx={10} fill="var(--color-background)" stroke="currentColor" strokeWidth="1.4" />
        <line x1={54} y1={40} x2={96} y2={40} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1={54} y1={48} x2={84} y2={48} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        {/* the line being typed — appears on hover */}
        <line x1={54} y1={56} x2={72} y2={56} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className={cn(MOVE, "opacity-0 delay-100 motion-safe:group-hover:opacity-100")} />
        <circle cx={77} cy={56} r={1.8} fill="currentColor" className={cn(MOVE, "opacity-0 delay-150 motion-safe:group-hover:opacity-100")} />
      </g>
    </svg>
  );
}

/** Remember: the episode log — a record slides out of the stack along the iso
 *  axis while the stack opens, and the lesson mark lights up. */
export function RememberIso({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 150 130" fill="none" className={cn("text-foreground/60", className)} aria-hidden>
      <Plate cx={75} cy={88} size={58} rx={12} fill="var(--color-surface-3)" className={cn(MOVE, "delay-75 motion-safe:group-hover:translate-y-[5px]")} />
      {/* the record being pulled — slides out along the iso x-axis */}
      <Plate cx={75} cy={68} size={58} rx={12} className={cn(MOVE, "delay-75 motion-safe:group-hover:translate-x-[11px] motion-safe:group-hover:translate-y-[6px]")}>
        <line x1={-16} y1={6} x2={10} y2={6} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <line x1={-16} y1={-4} x2={16} y2={-4} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </Plate>
      <Plate cx={75} cy={48} size={58} rx={12} className={cn(MOVE, "motion-safe:group-hover:-translate-y-[7px]")}>
        {/* the lesson mark: a tick that brightens when the log opens */}
        <circle cx={0} cy={0} r={8.5} stroke="currentColor" strokeWidth="1.4" fill="var(--color-surface-3)" />
        <path d="M-3.5 0l2.5 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" className={cn(MOVE, "opacity-40 delay-150 motion-safe:group-hover:opacity-100")} />
      </Plate>
    </svg>
  );
}

/** Run local: a chip on its board — the cloud signal fades OUT, and the die
 *  lifts and pulses anyway. Unplugged, still running. */
export function RunLocalIso({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 150 130" fill="none" className={cn("text-foreground/60", className)} aria-hidden>
      <Plate cx={75} cy={84} size={68} rx={12} fill="var(--color-surface-3)">
        <line x1={-26} y1={17} x2={-12} y2={17} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1={12} y1={-19} x2={26} y2={-19} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx={-9} cy={17} r={1.6} fill="currentColor" stroke="none" />
        <circle cx={9} cy={-19} r={1.6} fill="currentColor" stroke="none" />
        {/* the pulse: rings out from the die when it wakes */}
        <circle
          cx={0}
          cy={0}
          r={24}
          stroke="currentColor"
          strokeWidth="1.2"
          fill="none"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          className={cn("transition-all duration-500 ease-standard", "scale-75 opacity-0 delay-150 motion-safe:group-hover:scale-100 motion-safe:group-hover:opacity-60")}
        />
      </Plate>
      {/* the cloud link — disconnects on hover */}
      <g className={cn(MOVE, "motion-safe:group-hover:opacity-20")}>
        <path d="M113 34a14 14 0 0 1 14 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        <path d="M110 43a8 8 0 0 1 8 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        <circle cx={106} cy={52} r={1.8} fill="currentColor" stroke="none" />
      </g>
      {/* the die keeps running — lifts a beat after the signal drops */}
      <Cube cx={75} cy={84} s={22} className={cn(MOVE, "delay-75 motion-safe:group-hover:-translate-y-[7px]")} />
    </svg>
  );
}

/** Own it: the key comes to the lock, then the shackle opens. Your hardware. */
export function OwnItIso({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 150 130" fill="none" className={cn("text-foreground/60", className)} aria-hidden>
      <Plate cx={75} cy={86} size={66} rx={14} fill="var(--color-surface-3)" />
      <Cube cx={75} cy={86} s={26} />
      {/* the shackle — opens after the key arrives */}
      <g className={cn(MOVE, "delay-150 motion-safe:group-hover:-translate-y-[7px]")}>
        <path d="M64 58v-6a11 11 0 0 1 22 0v6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      </g>
      <circle cx={75} cy={66} r={2.4} fill="currentColor" />
      {/* the key — slides toward the lock along the iso axis */}
      <g className={cn(MOVE, "opacity-70 motion-safe:group-hover:translate-x-[10px] motion-safe:group-hover:translate-y-[6px] motion-safe:group-hover:opacity-100")}>
        <circle cx={27} cy={54} r={5} stroke="currentColor" strokeWidth="1.4" fill="var(--color-background)" />
        <line x1={31.5} y1={56.5} x2={46} y2={64} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1={40} y1={61} x2={38} y2={65} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1={45} y1={63.5} x2={43} y2={67.5} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </g>
    </svg>
  );
}
