import { cn } from "@/lib/utils";

/**
 * Who actually executes a step. The whole architecture in one chip:
 * the LLM plans, and the cheapest reliable runner below it does the work.
 */
export type Runner = "primitive" | "policy" | "vla" | "memory" | "human";

const RUNNER: Record<Runner, { className: string; title: string }> = {
  primitive: {
    className: "border-runner-primitive/25 bg-runner-primitive/10 text-runner-primitive",
    title: "Deterministic code — no AI in the loop",
  },
  policy: {
    className: "border-runner-policy/25 bg-runner-policy/10 text-runner-policy",
    title: "Tiny policy trained on-device from your own demos",
  },
  vla: {
    className: "border-runner-vla/25 bg-runner-vla/10 text-runner-vla",
    title: "Vision-language-action model, called as a tool",
  },
  memory: {
    className: "border-runner-memory/25 bg-runner-memory/10 text-runner-memory",
    title: "Episodic memory — the lesson is written here",
  },
  human: {
    className: "border-runner-human/25 bg-runner-human/10 text-runner-human",
    title: "Asks you — better than a guessed motion",
  },
};

export function RunnerBadge({
  runner,
  className,
}: {
  runner: Runner;
  className?: string;
}) {
  const r = RUNNER[runner];
  return (
    <span
      title={r.title}
      className={cn(
        "rounded border px-1.5 py-0.5 font-mono text-[10px] leading-none",
        "transition-colors duration-150 ease-standard",
        r.className,
        className,
      )}
    >
      {runner}
    </span>
  );
}
