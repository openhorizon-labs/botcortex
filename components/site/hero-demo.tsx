"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { LiveDot } from "@/components/kit/live-dot";
import { RunnerBadge, type Runner } from "@/components/kit/runner-badge";

const TASK = "sort the red parts into the left bin";
const REPLY =
  "On it. I'll grab each red part with the right arm and drop it in the left bin — here's the plan.";

const STEPS: { label: string; runner: Runner; detail: string }[] = [
  { label: "Locate red parts on the tray", runner: "policy", detail: "act_tiny · 8 ms" },
  { label: "Move right arm above part", runner: "primitive", detail: "move_to · 20 Hz" },
  { label: "Close gripper, confirm grasp", runner: "primitive", detail: "gripper · −42°" },
  { label: "Carry to left bin, release", runner: "primitive", detail: "move_to · clamped" },
  { label: "Verify and log the episode", runner: "memory", detail: "episodes.jsonl" },
];

/** The hero product window: chat authors on the left, the plan renders on the right.
 *  One loop = type task → reply → steps connect in → skill saved. */
export function HeroDemo() {
  const [typed, setTyped] = useState(0);
  const [replied, setReplied] = useState(false);
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
      setReplied(false);
      setRevealed(0);
      setSaved(false);
      at(60, () => setRewinding(false));

      for (let i = 1; i <= TASK.length; i++) at(300 + 30 * i, () => setTyped(i));
      const afterTyping = 300 + 30 * TASK.length + 500;
      at(afterTyping, () => setReplied(true));
      STEPS.forEach((_, i) =>
        at(afterTyping + 550 + i * 420, () => setRevealed(i + 1)),
      );
      const done = afterTyping + 550 + STEPS.length * 420 + 250;
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
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_24px_80px_-24px_rgb(0_0_0/0.25)]">
      {/* window chrome */}
      <div className="flex items-center gap-3 border-b border-border bg-surface-1 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-foreground/10" />
          <span className="size-2.5 rounded-full bg-foreground/10" />
          <span className="size-2.5 rounded-full bg-foreground/10" />
        </div>
        <span className="font-mono text-xs text-muted-foreground">robot.local</span>
        <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-runner-primitive">
          <LiveDot />
          connected · offline ok
        </span>
        <span className="rounded-md bg-red-600 px-3 py-1 text-[11px] font-bold tracking-wide text-white">
          STOP
        </span>
      </div>

      <div className="grid md:grid-cols-[1fr_1.1fr]">
        {/* chat pane */}
        <div className="flex min-h-[22rem] flex-col border-b border-border md:border-r md:border-b-0">
          <div className="flex-1 space-y-4 p-5">
            <div className="flex justify-end">
              <div className="max-w-[90%] rounded-2xl rounded-br-sm bg-surface-3 px-3.5 py-2 text-[13px]">
                {TASK.slice(0, typed)}
                <span
                  className={cn(
                    "ml-0.5 inline-block h-3.5 w-px translate-y-0.5 bg-foreground",
                    typed > 0 && typed < TASK.length ? "animate-pulse" : "opacity-0",
                  )}
                />
              </div>
            </div>
            <div
              className={cn(
                "flex justify-start transition-all ease-standard",
                instant,
                replied ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
              )}
            >
              <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-border bg-surface-1 px-3.5 py-2 text-[13px] leading-relaxed text-foreground/90">
                {REPLY}
              </div>
            </div>
            <div
              className={cn(
                "flex justify-start transition-opacity ease-standard",
                instant,
                saved ? "opacity-100" : "opacity-0",
              )}
            >
              <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                <span className="text-signal">✓ saved · sort_red_parts</span>
                your robot knows 15 tasks
              </div>
            </div>
          </div>
          <div className="border-t border-border p-3.5">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3.5 py-2.5">
              <span className="flex-1 text-[13px] text-muted-foreground">
                Teach your robot…
              </span>
              <span className="grid size-6 place-items-center rounded-md bg-signal text-signal-foreground">
                <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden>
                  <path d="M8 12V4m0 0L4.5 7.5M8 4l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
          </div>
        </div>

        {/* plan pane */}
        <div className="bg-surface-1/60 p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              plan · review before run
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {revealed}/{STEPS.length}
            </span>
          </div>
          <ol>
            {STEPS.map((step, i) => (
              <li key={step.label}>
                {i > 0 && (
                  <div
                    className={cn(
                      "ml-6 h-3 w-px transition-colors ease-standard",
                      instant,
                      i < revealed ? "bg-border-strong" : "bg-transparent",
                    )}
                  />
                )}
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-lg border bg-background px-3.5 py-2.5 transition-all ease-standard",
                    instant,
                    i < revealed
                      ? "translate-y-0 border-border opacity-100 shadow-[0_1px_2px_rgb(0_0_0/0.04)]"
                      : "translate-y-1 border-transparent opacity-0",
                  )}
                >
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 text-[13px] leading-tight">{step.label}</span>
                  <span className="hidden font-mono text-[10px] text-muted-foreground lg:inline">
                    {step.detail}
                  </span>
                  <RunnerBadge runner={step.runner} />
                </div>
              </li>
            ))}
          </ol>
          <p
            className={cn(
              "mt-3 text-center font-mono text-[11px] text-muted-foreground transition-opacity ease-standard",
              instant,
              saved ? "opacity-100" : "opacity-0",
            )}
          >
            executes on-device · LLM not in the loop
          </p>
        </div>
      </div>
    </div>
  );
}
