"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { RunnerBadge, type Runner } from "@/components/kit/runner-badge";

const TASK = "sort the red parts into the left bin";

const STEPS: { label: string; runner: Runner; detail: string }[] = [
  { label: "Locate red parts on tray", runner: "policy", detail: "act_tiny · 8 ms" },
  { label: "Move right arm above part", runner: "primitive", detail: "move_to · 20 Hz" },
  { label: "Close gripper, confirm grasp", runner: "primitive", detail: "gripper · −42°" },
  { label: "Carry to left bin, release", runner: "primitive", detail: "move_to · clamped" },
  { label: "Verify, log the episode", runner: "memory", detail: "episodes.jsonl" },
];

/** The big hero card: product visual on a gray panel (left), text beside it (right),
 *  a corner chip naming the moment — the ref's card grammar, our product inside. */
export function HeroCard() {
  const [typed, setTyped] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [saved, setSaved] = useState(false);
  const [rewinding, setRewinding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) =>
      timers.push(setTimeout(() => !cancelled && fn(), ms));

    const run = () => {
      setRewinding(true);
      setTyped(0);
      setRevealed(0);
      setSaved(false);
      at(60, () => setRewinding(false));
      for (let i = 1; i <= TASK.length; i++) at(400 + 30 * i, () => setTyped(i));
      const t0 = 400 + 30 * TASK.length + 500;
      STEPS.forEach((_, i) => at(t0 + i * 420, () => setRevealed(i + 1)));
      const done = t0 + STEPS.length * 420 + 250;
      at(done, () => setSaved(true));
      at(done + 4600, run);
    };
    run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  const instant = rewinding ? "duration-0" : "duration-500";

  return (
    <div className="relative rounded-3xl border border-border bg-background p-4 sm:p-5">
      <span className="absolute top-5 right-5 z-10 hidden rounded-lg bg-surface-3 px-3 py-1.5 text-sm text-foreground sm:block">
        Teach
      </span>

      <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:gap-10">
        {/* product visual on the gray panel */}
        <div className="rounded-2xl bg-surface-3 p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">robot.local</span>
            <span className="flex items-center gap-3">
              <span className="font-mono text-[11px] text-muted-foreground">
                connected · offline ok
              </span>
              <span className="rounded-md bg-red-600 px-2.5 py-1 text-[10px] font-bold tracking-wide text-white">
                STOP
              </span>
            </span>
          </div>

          <div className="flex justify-end">
            <div className="rounded-2xl rounded-br-sm bg-background px-3.5 py-2 text-[13px] shadow-[0_1px_2px_rgb(0_0_0/0.05)]">
              {TASK.slice(0, typed)}
              <span
                className={cn(
                  "ml-0.5 inline-block h-3.5 w-px translate-y-0.5 bg-foreground",
                  typed > 0 && typed < TASK.length ? "animate-pulse" : "opacity-0",
                )}
              />
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                plan · review before run
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {revealed}/{STEPS.length}
              </span>
            </div>
            {STEPS.map((step, i) => (
              <div
                key={step.label}
                className={cn(
                  "flex items-center gap-3 rounded-lg bg-background px-3.5 py-2.5 transition-all ease-standard",
                  instant,
                  i < revealed
                    ? "translate-y-0 opacity-100 shadow-[0_1px_2px_rgb(0_0_0/0.05)]"
                    : "translate-y-1 opacity-0",
                )}
              >
                <span className="font-mono text-[11px] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 text-[13px] leading-tight">{step.label}</span>
                <span className="hidden font-mono text-[10px] text-muted-foreground md:inline">
                  {step.detail}
                </span>
                <RunnerBadge runner={step.runner} />
              </div>
            ))}
            <p
              className={cn(
                "pt-1 text-center font-mono text-[11px] text-muted-foreground transition-opacity ease-standard",
                instant,
                saved ? "opacity-100" : "opacity-0",
              )}
            >
              ✓ saved · sort_red_parts · your robot knows 15 tasks
            </p>
          </div>
        </div>

        {/* text beside the visual */}
        <div className="flex flex-col justify-center pr-2 lg:py-10">
          <h2 className="text-[22px] font-medium leading-tight tracking-tight">
            Type it. Your robot learns it.
          </h2>
          <p className="mt-3 max-w-md text-base leading-relaxed text-muted-foreground">
            Describe the task in plain English. The agent plans it step by step, shows
            you the plan before anything moves, and saves the skill on the robot — where
            it runs at control rate, with or without internet. Every run is logged to
            episodic memory, so your robot gets better at your tasks.
          </p>
        </div>
      </div>
    </div>
  );
}
