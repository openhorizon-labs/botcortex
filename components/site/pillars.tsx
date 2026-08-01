import { Brain, Cpu, KeyRound, MessagesSquare } from "lucide-react";
import { Reveal } from "@/components/kit/reveal";
import { RunnerBadge, type Runner } from "@/components/kit/runner-badge";
import { cn } from "@/lib/utils";

/* ---------- per-pillar visuals: our product, drawn in code ---------- */

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-background p-4 shadow-[0_16px_48px_-20px_rgb(0_0_0/0.18)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function TeachVisual() {
  return (
    <Panel>
      <div className="space-y-3">
        <div className="flex justify-end">
          <div className="rounded-2xl rounded-br-sm bg-surface-3 px-3.5 py-2 text-[13px]">
            wipe down the bench, then stack the cups
          </div>
        </div>
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-surface-1 px-3.5 py-2 text-[13px] leading-relaxed">
            Two skills, then. I know <span className="font-mono text-signal">wipe_surface</span> —
            I&rsquo;ll reuse it and author <span className="font-mono text-signal">stack_cups</span>.
            Plan is ready for review.
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3.5 py-2.5">
          <span className="flex-1 text-[13px] text-muted-foreground">Teach your robot…</span>
          <span className="rounded-md bg-signal px-2.5 py-1 text-[11px] font-semibold text-signal-foreground">
            Teach
          </span>
        </div>
      </div>
    </Panel>
  );
}

function MemoryVisual() {
  const rows: { t: string; ok: boolean; note: string }[] = [
    { t: "14:02", ok: false, note: "grasp slipped — cup wall thinner than expected" },
    { t: "14:04", ok: false, note: "lesson: approach 8° steeper, close to −38°" },
    { t: "14:06", ok: true, note: "stack_cups v2 — 5/5 grasps held" },
  ];
  return (
    <Panel>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          memory/episodes.jsonl
        </span>
        <RunnerBadge runner="memory" />
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.t} className="flex items-start gap-3 py-2.5">
            <span className="font-mono text-[11px] text-muted-foreground">{r.t}</span>
            <span
              className={cn(
                "mt-0.5 rounded border px-1.5 py-0.5 font-mono text-[10px] leading-none",
                r.ok
                  ? "border-runner-primitive/25 bg-runner-primitive/10 text-runner-primitive"
                  : "border-red-500/25 bg-red-500/10 text-red-600",
              )}
            >
              {r.ok ? "ok" : "fail"}
            </span>
            <span className="flex-1 text-[13px] leading-snug text-foreground/85">{r.note}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-border pt-2.5 font-mono text-[11px] text-muted-foreground">
        recalled at teach time → <span className="text-signal">+35% success</span> (RoboInspector)
      </p>
    </Panel>
  );
}

function LocalVisual() {
  return (
    <Panel>
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
            <span className="text-muted-foreground">cloud round-trip (P99)</span>
            <span className="font-mono text-red-600">3–5 s</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
            <div className="h-full w-full rounded-full bg-red-500/70" />
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
            <span className="text-muted-foreground">BotCortex control loop, on-device</span>
            <span className="font-mono text-runner-primitive">12–20 ms</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
            <div className="h-full w-[2%] min-w-1.5 rounded-full bg-runner-primitive" />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface-1 px-3.5 py-2.5">
          <span className="font-mono text-[11px] text-muted-foreground">
            network unplugged · skills still running
          </span>
          <span className="rounded-md bg-red-600 px-3 py-1 text-[11px] font-bold tracking-wide text-white">
            STOP
          </span>
        </div>
      </div>
    </Panel>
  );
}

function OwnVisual() {
  return (
    <Panel className="font-mono text-[12.5px] leading-relaxed">
      <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        ~/.openhorizon/config.toml
      </p>
      <pre className="overflow-x-auto text-foreground/85">
        <code>
          {"[brain]\n"}
          <span className="text-signal">model</span>
          {' = "claude-opus-4-8"   '}
          <span className="text-muted-foreground"># your key</span>
          {"\n\n[hands]\n"}
          <span className="text-signal">vla</span>
          {' = "pi0"               '}
          <span className="text-muted-foreground"># or groot, none</span>
          {"\n\n[robot]\n"}
          <span className="text-signal">platform</span>
          {' = "openarm_v1"\n'}
          <span className="text-signal">skills_dir</span>
          {' = "~/.openhorizon/skills"  '}
          <span className="text-muted-foreground"># yours</span>
        </code>
      </pre>
    </Panel>
  );
}

/* ---------- the section ---------- */

const PILLARS: {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  headline: string;
  body: string[];
  cite?: { href: string; text: string };
  runners?: Runner[];
  visual: React.ComponentType;
}[] = [
  {
    id: "teach",
    label: "Teach",
    icon: MessagesSquare,
    headline: "Type the task. Review the plan. Run.",
    body: [
      "BotCortex serves a chat window from the robot itself — no code editor, no API, no robot programmer.",
      "The agent writes the skill once, and you see every step it plans before anything moves.",
    ],
    visual: TeachVisual,
  },
  {
    id: "remember",
    label: "Remember",
    icon: Brain,
    headline: "Every failure makes the next attempt smarter.",
    body: [
      "Every attempt is logged on the robot — what ran, what broke, what the lesson was — and recalled the next time you teach.",
      "Feeding failures back like this improves manipulation success by up to 35% (RoboInspector, ACM TIST 2026).",
    ],
    cite: { href: "https://arxiv.org/abs/2508.21378", text: "arXiv:2508.21378" },
    visual: MemoryVisual,
  },
  {
    id: "run-local",
    label: "Run local",
    icon: Cpu,
    headline: "No cloud in the control loop.",
    body: [
      "Cloud round-trips can spike to 3–5 seconds and a control loop needs 12–20 milliseconds, so taught skills run as deterministic code on the robot — the AI authors, it never drives.",
      "Unplug the network and every taught skill keeps running, with dry-run as the default, joint limits clamped, and a STOP button that never leaves the screen.",
    ],
    runners: ["primitive", "policy", "vla", "human"],
    visual: LocalVisual,
  },
  {
    id: "own-it",
    label: "Own it",
    icon: KeyRound,
    headline: "Your skills, your data, your API key.",
    body: [
      "Skills and failure logs live on your hardware and belong to you — not to a shared library in someone else's cloud.",
      "Bring your own model, your own VLA backend, your own robot: the runtime is open source and free on a single machine.",
    ],
    visual: OwnVisual,
  },
];

export function Pillars() {
  return (
    <section id="features" className="border-b border-border">
      <div className="mx-auto w-full max-w-6xl px-5 py-20 lg:py-28">
        <h2 className="mx-auto max-w-2xl text-balance text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          Teach it. It remembers. It runs local. You own it.
        </h2>

        <div className="mt-16 space-y-16 lg:space-y-24">
          {PILLARS.map((p, i) => (
            <Reveal key={p.id}>
              <div
                id={p.id}
                className="grid scroll-mt-24 items-center gap-8 lg:grid-cols-2 lg:gap-16"
              >
                <div className={i % 2 === 1 ? "lg:order-2" : undefined}>
                  <div className="flex items-center gap-2.5">
                    <p.icon className="size-4 text-signal" />
                    <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      {p.label}
                    </span>
                  </div>
                  <h3 className="mt-4 text-balance text-2xl font-semibold tracking-tight sm:text-[1.7rem]">
                    {p.headline}
                  </h3>
                  <div className="mt-4 space-y-3 leading-relaxed text-muted-foreground">
                    {p.body.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                  {p.runners && (
                    <div className="mt-5 flex flex-wrap items-center gap-1.5">
                      {p.runners.map((r) => (
                        <RunnerBadge key={r} runner={r} />
                      ))}
                      <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                        the LLM plans; these run it
                      </span>
                    </div>
                  )}
                  {p.cite && (
                    <a
                      href={p.cite.href}
                      className="mt-4 inline-block font-mono text-xs text-signal underline-offset-4 hover:underline"
                    >
                      {p.cite.text}
                    </a>
                  )}
                </div>
                <div className={i % 2 === 1 ? "lg:order-1" : undefined}>
                  <p.visual />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
