import { Brain, Cpu, KeyRound, MessagesSquare } from "lucide-react";
import { Reveal } from "@/components/kit/reveal";
import { RunnerBadge, type Runner } from "@/components/kit/runner-badge";

const PILLARS: {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  headline: string;
  body: string[];
  cite?: { href: string; text: string };
  runners?: Runner[];
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
    cite: {
      href: "https://arxiv.org/abs/2508.21378",
      text: "arXiv:2508.21378",
    },
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
  },
];

export function Pillars() {
  return (
    <section id="features" className="border-b border-border/60">
      <div className="mx-auto w-full max-w-6xl px-5 py-20 lg:py-24">
        <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-2">
          {PILLARS.map((p, i) => (
            <Reveal key={p.id} delay={(i % 2) * 70} className="bg-background">
              <div
                id={p.id}
                className="group h-full scroll-mt-24 p-7 transition-colors duration-150 ease-standard hover:bg-surface-1 lg:p-9"
              >
                <div className="flex items-center gap-2.5">
                  <p.icon className="size-4 text-signal" />
                  <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    {p.label}
                  </span>
                </div>
                <h3 className="mt-4 text-balance text-2xl font-semibold tracking-tight">
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
                    className="mt-4 inline-block font-mono text-xs text-signal underline-offset-4 transition-colors duration-150 ease-standard hover:underline"
                  >
                    {p.cite.text}
                  </a>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
