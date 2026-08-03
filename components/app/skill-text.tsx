"use client";

/**
 * Renders a robot message with skill names picked out as chips.
 *
 * "wave_left_arm finished: 6 primitive calls, all clamped and e-stop-checked"
 * is a wall of snake_case with the one meaningful token buried in it. The
 * skill is the subject of the sentence, so it gets to look like one.
 *
 * Matched against the robot's ACTUAL skill list rather than a snake_case
 * regex — the runtime's own vocabulary ("e-stop-checked", "primitive calls")
 * would otherwise get badged as though it were a skill.
 *
 * Monochrome, on the theme's own surface and border tokens. The runner palette
 * was tempting — a skill IS deterministic code — but the app is grayscale by
 * design, and a green chip in the transcript reads as a status the colour was
 * never meant to carry. Weight and the mono face do the highlighting.
 */

import { cn } from "@/lib/utils";

export function SkillText({
  text,
  skills,
  className,
}: {
  text: string;
  skills: string[];
  className?: string;
}) {
  // Longest first, so `wave_left_arm` wins over a hypothetical `wave`.
  const known = [...skills].filter(Boolean).sort((a, b) => b.length - a.length);
  if (known.length === 0) return <>{text}</>;

  const escaped = known.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "g"));

  return (
    <span className={className}>
      {parts.map((part, i) =>
        known.includes(part) ? (
          <span
            key={i}
            title="A skill this robot knows — deterministic code, no AI in the loop"
            className={cn(
              "mx-px inline-flex items-center rounded border px-1.5 py-0.5 align-baseline font-mono text-[11px] leading-none",
              "border-border bg-surface-3 font-medium text-foreground",
            )}
          >
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </span>
  );
}
