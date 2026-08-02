import { cn } from "@/lib/utils";

/**
 * Isometric feature illustrations, drawn from projected math — not freehand.
 * Projection: p(x,y,z) = (0.866(x−y), 0.5(x+y)−z). Each moving part sits in an
 * outer <g> that carries ONLY the CSS hover transform (Tailwind), while the
 * inner <g> holds the isometric matrix — so CSS never fights the attribute.
 * Hover is driven by a `group` class on the surrounding card.
 */

const ISO = "matrix(0.866 0.5 -0.866 0.5 0 0)";
const EASE = "transition-transform duration-300 ease-standard";

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
    <g className={className} style={{ transformBox: "fill-box" }}>
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

/** Iso cube polygons for side s, centered on the cube's bottom-center. */
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

export function TeachIso({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 150 130" fill="none" className={cn("text-foreground/60", className)} aria-hidden>
      <Plate cx={75} cy={84} size={66} rx={14} fill="var(--color-surface-3)" className={cn(EASE, "motion-safe:group-hover:translate-y-[3px]")} />
      {/* the message, floating above — lifts on hover, like a thought arriving */}
      <Plate cx={75} cy={64} size={46} rx={10} className={cn(EASE, "motion-safe:group-hover:-translate-y-[9px]")}>
        <line x1={-12} y1={-6} x2={13} y2={-6} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1={-12} y1={2} x2={5} y2={2} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx={13} cy={9} r={2.2} fill="currentColor" stroke="none" />
      </Plate>
    </svg>
  );
}

export function RememberIso({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 150 130" fill="none" className={cn("text-foreground/60", className)} aria-hidden>
      {/* the episode log: three layers that spread apart on hover */}
      <Plate cx={75} cy={88} size={62} rx={12} fill="var(--color-surface-3)" className={cn(EASE, "motion-safe:group-hover:translate-y-[7px]")} />
      <Plate cx={75} cy={66} size={62} rx={12} />
      <Plate cx={75} cy={44} size={62} rx={12} className={cn(EASE, "motion-safe:group-hover:-translate-y-[7px]")}>
        <circle cx={0} cy={0} r={7} stroke="currentColor" strokeWidth="1.4" fill="var(--color-surface-3)" />
        <circle cx={0} cy={0} r={2} fill="currentColor" stroke="none" />
      </Plate>
    </svg>
  );
}

export function RunLocalIso({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 150 130" fill="none" className={cn("text-foreground/60", className)} aria-hidden>
      {/* the board */}
      <Plate cx={75} cy={82} size={68} rx={12} fill="var(--color-surface-3)">
        {/* traces on the board, drawn in the iso plane */}
        <line x1={-24} y1={18} x2={-10} y2={18} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1={10} y1={-20} x2={24} y2={-20} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx={-7} cy={18} r={1.6} fill="currentColor" stroke="none" />
        <circle cx={7} cy={-20} r={1.6} fill="currentColor" stroke="none" />
      </Plate>
      {/* the die lifts off the board on hover — local compute, detachable from nothing */}
      <Cube cx={75} cy={82} s={24} className={cn(EASE, "motion-safe:group-hover:-translate-y-[8px]")} />
    </svg>
  );
}

export function OwnItIso({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 150 130" fill="none" className={cn("text-foreground/60", className)} aria-hidden>
      <Plate cx={75} cy={86} size={66} rx={14} fill="var(--color-surface-3)" />
      <Cube cx={75} cy={86} s={26} className={cn(EASE, "motion-safe:group-hover:translate-y-[2px]")} />
      {/* padlock shackle, in front of the body — opens on hover: your hardware, your key */}
      <g className={cn(EASE, "motion-safe:group-hover:-translate-y-[7px]")}>
        <path
          d="M64 58v-6a11 11 0 0 1 22 0v6"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        />
      </g>
      <circle cx={75} cy={66} r={2.4} fill="currentColor" className={cn(EASE, "motion-safe:group-hover:translate-y-[2px]")} />
    </svg>
  );
}
