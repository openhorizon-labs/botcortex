import { cn } from "@/lib/utils";

/**
 * Original blueprint-style humanoid: thin line art with dimension calls taken
 * from our REAL platform limits (config.py — j4 0–135°, gripper −65..0°,
 * 20 Hz, ≤30°/s). Every few seconds the right arm performs `wave_right_arm`,
 * the actual CLI smoke test. Drawn from coordinates, not traced from anything.
 */

const STROKE = {
  stroke: "currentColor",
  strokeWidth: 1.2,
  fill: "none",
  strokeLinecap: "round" as const,
};
const JOINT = {
  stroke: "currentColor",
  strokeWidth: 1.2,
  fill: "var(--color-background)",
};
const DIM = {
  stroke: "currentColor",
  strokeWidth: 0.8,
  fill: "none",
  opacity: 0.55,
};
const TXT = {
  fill: "currentColor",
  fontSize: 7.5,
  opacity: 0.75,
  fontFamily: "var(--font-geist-mono)",
};

export function HumanoidBlueprint({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 300 300"
      aria-label="Blueprint drawing of a bimanual humanoid robot, annotated with its joint limits"
      className={cn("text-foreground/60", className)}
    >
      {/* center line */}
      <line x1={150} y1={18} x2={150} y2={252} stroke="currentColor" strokeWidth={0.7} strokeDasharray="2 7" opacity={0.3} />

      {/* head */}
      <rect x={136} y={28} width={28} height={24} rx={8} {...STROKE} fill="var(--color-background)" />
      <line x1={143} y1={40} x2={157} y2={40} {...STROKE} />
      <line x1={150} y1={52} x2={150} y2={60} {...STROKE} />

      {/* torso + the cortex */}
      <rect x={122} y={60} width={56} height={76} rx={10} {...STROKE} fill="var(--color-background)" />
      <circle cx={150} cy={86} r={7} {...STROKE} />
      <circle cx={150} cy={86} r={2} fill="currentColor" stroke="none" />
      <line x1={130} y1={118} x2={170} y2={118} stroke="currentColor" strokeWidth={1} opacity={0.5} />

      {/* left arm (viewer left) — at rest */}
      <circle cx={116} cy={72} r={6} {...JOINT} />
      <line x1={114} y1={78} x2={110} y2={102} {...STROKE} />
      <circle cx={110} cy={107} r={5} {...JOINT} />
      <line x1={110} y1={112} x2={114} y2={134} {...STROKE} />
      <path d="M114 134l-4 10M114 134l7 8" {...STROKE} />

      {/* right arm — performs wave_right_arm on a loop */}
      <g
        style={{
          transformBox: "view-box",
          transformOrigin: "184px 72px",
        }}
        className="motion-safe:animate-[robot-wave_7s_ease-in-out_infinite]"
      >
        <line x1={186} y1={76} x2={206} y2={90} {...STROKE} />
        <circle cx={209} cy={92} r={5} {...JOINT} />
        <line x1={212} y1={89} x2={226} y2={66} {...STROKE} />
        <path d="M226 66l-6-8M226 66l8-4" {...STROKE} />
      </g>
      <circle cx={184} cy={72} r={6} {...JOINT} />

      {/* pelvis + legs */}
      <rect x={132} y={136} width={36} height={16} rx={6} {...STROKE} fill="var(--color-background)" />
      <circle cx={140} cy={157} r={5} {...JOINT} />
      <circle cx={160} cy={157} r={5} {...JOINT} />
      <line x1={140} y1={162} x2={138} y2={194} {...STROKE} />
      <line x1={160} y1={162} x2={162} y2={194} {...STROKE} />
      <circle cx={138} cy={199} r={5} {...JOINT} />
      <circle cx={162} cy={199} r={5} {...JOINT} />
      <line x1={138} y1={204} x2={140} y2={232} {...STROKE} />
      <line x1={162} y1={204} x2={160} y2={232} {...STROKE} />
      <rect x={128} y={232} width={24} height={6} rx={2} {...STROKE} fill="var(--color-background)" />
      <rect x={148} y={232} width={24} height={6} rx={2} {...STROKE} fill="var(--color-background)" />

      {/* ── dimensions ───────────────────────────── */}
      {/* overall height */}
      <line x1={96} y1={28} x2={96} y2={238} {...DIM} />
      <line x1={92} y1={28} x2={100} y2={28} {...DIM} />
      <line x1={92} y1={238} x2={100} y2={238} {...DIM} />
      <text x={88} y={136} {...TXT} transform="rotate(-90 88 136)" textAnchor="middle">
        1.42 m
      </text>

      {/* stance width */}
      <line x1={128} y1={252} x2={172} y2={252} {...DIM} />
      <line x1={128} y1={248} x2={128} y2={256} {...DIM} />
      <line x1={172} y1={248} x2={172} y2={256} {...DIM} />
      <text x={150} y={264} {...TXT} textAnchor="middle">
        0.58 m
      </text>

      {/* elbow range — the real j4 limit */}
      <path d="M222 92a14 14 0 0 0-8-12" {...DIM} strokeDasharray="2 3" />
      <text x={230} y={104} {...TXT}>
        j4 0–135°
      </text>

      {/* gripper limit */}
      <line x1={232} y1={58} x2={252} y2={46} {...DIM} strokeDasharray="2 3" />
      <text x={218} y={38} {...TXT}>
        gripper −65..0°
      </text>

      {/* the running skill */}
      <text x={220} y={130} {...TXT} opacity={0.6}>
        ▸ wave_right_arm
      </text>
      <text x={220} y={141} {...TXT} opacity={0.45}>
        20 Hz · ≤30°/s
      </text>

      {/* plate caption */}
      <text x={150} y={286} {...TXT} textAnchor="middle" letterSpacing={2} opacity={0.5}>
        BIMANUAL HUMANOID · DETERMINISTIC EXECUTION
      </text>
    </svg>
  );
}
