"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { LiveDot } from "@/components/kit/live-dot";
import { RunnerBadge, type Runner } from "@/components/kit/runner-badge";

const TASK = "sort the red parts into the left bin";

/** Each step is labelled with the executor that runs it — the multi-model hierarchy,
 *  made visible. The LLM authors this list; it never runs the motion. */
const STEPS: { label: string; runner: Runner; detail: string }[] = [
  { label: "locate red parts on the tray", runner: "policy", detail: "act_tiny · 8 ms" },
  { label: "move right arm above part", runner: "primitive", detail: "move_to · 20 Hz" },
  { label: "close gripper, confirm grasp", runner: "primitive", detail: "gripper · −42°" },
  { label: "carry to left bin, release", runner: "primitive", detail: "move_to · clamped" },
  { label: "verify, log the episode", runner: "memory", detail: "episodes.jsonl" },
];

export function PlanDemo() {
  const [typed, setTyped] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [saved, setSaved] = useState(false);
  // Skips the fade while the loop rewinds, so the reset reads as a cut, not a wipe.
  const [rewinding, setRewinding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const run = () => {
      setRewinding(true);
      setTyped(0);
      setRevealed(0);
      setSaved(false);
      timers.push(setTimeout(() => !cancelled && setRewinding(false), 60));

      for (let i = 1; i <= TASK.length; i++) {
        timers.push(setTimeout(() => !cancelled && setTyped(i), 34 * i));
      }
      const afterTyping = 34 * TASK.length + 420;
      STEPS.forEach((_, i) => {
        timers.push(
          setTimeout(() => !cancelled && setRevealed(i + 1), afterTyping + i * 460),
        );
      });
      const done = afterTyping + STEPS.length * 460 + 300;
      timers.push(setTimeout(() => !cancelled && setSaved(true), done));
      timers.push(setTimeout(run, done + 4200));
    };

    run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-surface shadow-2xl shadow-black/40">
      {/* window chrome */}
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
        </div>
        <span className="font-mono text-xs text-muted-foreground">robot.local</span>
        <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-runner-primitive">
          <LiveDot />
          connected · offline ok
        </span>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {/* the typed task */}
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-foreground/10 px-3.5 py-2 text-sm">
            {TASK.slice(0, typed)}
            <span
              className={cn(
                "ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-foreground",
                typed < TASK.length ? "animate-pulse" : "opacity-0",
              )}
            />
          </div>
        </div>

        {/* the authored plan */}
        <div className="rounded-lg border border-border/60 bg-background/60 p-3.5">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              plan · review before run
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {revealed}/{STEPS.length}
            </span>
          </div>

          <ol className="space-y-2">
            {STEPS.map((step, i) => (
              <li
                key={step.label}
                className={cn(
                  "flex items-center gap-3 rounded-md border px-3 py-2 transition-all",
                  rewinding ? "duration-0" : "duration-500",
                  i < revealed
                    ? "translate-y-0 border-border/60 bg-surface opacity-100"
                    : "translate-y-1 border-transparent opacity-0",
                )}
              >
                <span className="font-mono text-[11px] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 text-[13px] leading-tight">{step.label}</span>
                <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
                  {step.detail}
                </span>
                <RunnerBadge runner={step.runner} />
              </li>
            ))}
          </ol>

          <div
            className={cn(
              "mt-3 flex items-center gap-2 border-t border-border/60 pt-3 transition-opacity",
              rewinding ? "duration-0" : "duration-500",
              saved ? "opacity-100" : "opacity-0",
            )}
          >
            <span className="font-mono text-[11px] text-signal">
              saved · sort_red_parts
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              your robot knows 15 tasks
            </span>
          </div>
        </div>

        {/* the always-present brake */}
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] text-muted-foreground">
            executes on-device · LLM not in the loop
          </p>
          <span className="rounded-md bg-red-600/90 px-3.5 py-1.5 text-xs font-bold tracking-wide text-white">
            STOP
          </span>
        </div>
      </div>
    </div>
  );
}
