import { ArrowRight } from "lucide-react";
import { TeachIso, RememberIso, RunLocalIso, OwnItIso } from "@/components/kit/iso-icons";
import { RunnerBadge, type Runner } from "@/components/kit/runner-badge";
import { cn } from "@/lib/utils";

/* ---------- the 4-column strip ---------- */

const STRIP = [
  { icon: TeachIso, title: "Teach", body: "A chat window served from the robot — type the task, review the plan, run." },
  { icon: RememberIso, title: "Remember", body: "Every attempt logged on-device; failures become lessons the agent recalls." },
  { icon: RunLocalIso, title: "Run local", body: "Skills execute as deterministic code on the robot, online or not." },
  { icon: OwnItIso, title: "Own it", body: "Your skills, your data, your API key. Open source, BYO everything." },
] as const;

export function FeatureStrip() {
  return (
    <section id="how" className="mx-auto w-full max-w-[1368px] scroll-mt-16 px-6 py-20 lg:px-10 lg:py-28">
      <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
        {STRIP.map((s) => (
          <div key={s.title} className="group">
            <div className="flex h-[130px] w-[150px] items-center">
              <s.icon className="h-[130px] w-[150px]" />
            </div>
            <h3 className="mt-4 text-[22px] font-medium tracking-tight">{s.title}</h3>
            <p className="mt-2 max-w-xs text-base leading-relaxed text-muted-foreground">
              {s.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- per-feature visuals on gray panels ---------- */

function ChatVisual() {
  return (
    <div className="space-y-3 p-6 sm:p-10">
      <div className="flex justify-end">
        <div className="rounded-2xl rounded-br-sm bg-background px-3.5 py-2 text-[13px] shadow-[0_1px_2px_rgb(0_0_0/0.05)]">
          wipe down the bench, then stack the cups
        </div>
      </div>
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-background px-3.5 py-2 text-[13px] leading-relaxed shadow-[0_1px_2px_rgb(0_0_0/0.05)]">
          Two skills, then. I already know <span className="font-mono">wipe_surface</span> —
          I&rsquo;ll reuse it and author <span className="font-mono">stack_cups</span>. Plan is
          ready for review.
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-background px-3.5 py-2.5 shadow-[0_1px_2px_rgb(0_0_0/0.05)]">
        <span className="flex-1 text-[13px] text-muted-foreground">Teach your robot…</span>
        <span className="rounded-md bg-foreground px-2.5 py-1 text-[11px] font-medium text-background">
          Teach
        </span>
      </div>
    </div>
  );
}

function MemoryVisual() {
  const rows = [
    { t: "14:02", ok: false, note: "grasp slipped — cup wall thinner than expected" },
    { t: "14:04", ok: false, note: "lesson: approach 8° steeper, close to −38°" },
    { t: "14:06", ok: true, note: "stack_cups v2 — 5/5 grasps held" },
  ];
  return (
    <div className="p-6 sm:p-10">
      <div className="overflow-hidden rounded-xl bg-background shadow-[0_1px_2px_rgb(0_0_0/0.05)]">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="font-mono text-[11px] text-muted-foreground">
            memory/episodes.jsonl
          </span>
          <RunnerBadge runner="memory" />
        </div>
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.t} className="flex items-start gap-3 px-4 py-3">
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
              <span className="flex-1 text-[13px] leading-snug">{r.note}</span>
            </li>
          ))}
        </ul>
        <p className="border-t border-border px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
          recalled at teach time → +35% success (RoboInspector, ACM TIST 2026)
        </p>
      </div>
    </div>
  );
}

function LocalVisual() {
  return (
    <div className="space-y-3 p-6 sm:p-10">
      <div className="rounded-xl bg-background p-4 shadow-[0_1px_2px_rgb(0_0_0/0.05)]">
        <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
          <span className="text-muted-foreground">cloud round-trip, P99</span>
          <span className="font-mono">3–5 s</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-surface-3">
          <div className="h-full w-full rounded-full bg-foreground/60" />
        </div>
        <div className="mt-4 mb-1.5 flex items-baseline justify-between text-[12px]">
          <span className="text-muted-foreground">BotCortex control loop, on-device</span>
          <span className="font-mono">12–20 ms</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-surface-3">
          <div className="h-full w-[2%] min-w-1.5 rounded-full bg-foreground" />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-background px-4 py-3 shadow-[0_1px_2px_rgb(0_0_0/0.05)]">
        <span className="font-mono text-[11px] text-muted-foreground">
          network unplugged · skills still running
        </span>
        <span className="rounded-md bg-red-600 px-2.5 py-1 text-[10px] font-bold tracking-wide text-white">
          STOP
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-1">
        {(["primitive", "policy", "vla", "human"] as Runner[]).map((r) => (
          <RunnerBadge key={r} runner={r} />
        ))}
        <span className="ml-1 font-mono text-[10px] text-muted-foreground">
          the LLM plans; these run it
        </span>
      </div>
    </div>
  );
}

function OwnVisual() {
  return (
    <div className="p-6 sm:p-10">
      <div className="rounded-xl bg-background p-5 font-mono text-[12.5px] leading-relaxed shadow-[0_1px_2px_rgb(0_0_0/0.05)]">
        <p className="mb-3 text-[11px] text-muted-foreground">~/.openhorizon/config.toml</p>
        <pre className="overflow-x-auto">
          <code>
            {"[brain]\nmodel = \"claude-opus-4-8\"     "}
            <span className="text-muted-foreground"># your key</span>
            {"\n\n[hands]\nvla = \"pi0\"                 "}
            <span className="text-muted-foreground"># or groot, none</span>
            {"\n\n[robot]\nplatform = \"openarm_v1\"\nskills_dir = \"~/.openhorizon/skills\""}
          </code>
        </pre>
      </div>
    </div>
  );
}

/* ---------- the giant feature cards ---------- */

const CARDS = [
  {
    id: "teach",
    chip: "Teach",
    headline: "Type the task. Review the plan. Run.",
    body: "BotCortex serves a chat window from the robot itself — no code editor, no API, no robot programmer. The agent writes the skill once, and you see every step it plans before anything moves.",
    link: { href: "/app", label: "Open the chat app" },
    visual: ChatVisual,
  },
  {
    id: "remember",
    chip: "Remember",
    headline: "Every failure makes the next attempt smarter.",
    body: "Every attempt is logged on the robot — what ran, what broke, what the lesson was — and recalled the next time you teach. Feeding failures back like this improves manipulation success by up to 35%.",
    link: { href: "https://arxiv.org/abs/2508.21378", label: "Read the research" },
    visual: MemoryVisual,
  },
  {
    id: "run-local",
    chip: "Run local",
    headline: "No cloud in the control loop.",
    body: "A control loop needs 12–20 milliseconds; cloud round-trips can spike to seconds. Taught skills run as deterministic code on the robot — dry-run by default, joint limits clamped, STOP always on screen.",
    link: {
      href: "https://github.com/openhorizon-labs/botcortex-runtime",
      label: "See the runtime",
    },
    visual: LocalVisual,
  },
  {
    id: "own-it",
    chip: "Own it",
    headline: "Your skills, your data, your API key.",
    body: "Skills and failure logs live on your hardware and belong to you — not to a shared library in someone else's cloud. Bring your own model, VLA backend, and robot. Open source, free on a single machine.",
    link: {
      href: "https://github.com/openhorizon-labs/botcortex-runtime",
      label: "Star on GitHub",
    },
    visual: OwnVisual,
  },
];

export function FeatureCards() {
  return (
    <section id="features" className="mx-auto w-full max-w-[1368px] scroll-mt-16 space-y-10 px-6 pb-24 lg:px-10">
      {CARDS.map((c) => (
        <div
          key={c.id}
          id={c.id}
          className="relative scroll-mt-24 rounded-3xl border border-border bg-background p-4 sm:p-5"
        >
          <span className="absolute top-5 right-5 z-10 hidden rounded-lg bg-surface-3 px-3 py-1.5 text-sm sm:block">
            {c.chip}
          </span>
          <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:gap-10">
            <div className="overflow-hidden rounded-2xl bg-surface-3">
              <c.visual />
            </div>
            <div className="flex flex-col justify-center pr-2 lg:py-16">
              <h2 className="max-w-md text-[26px] font-medium leading-tight tracking-tight sm:text-[28px]">
                {c.headline}
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
                {c.body}
              </p>
              <a
                href={c.link.href}
                className="group mt-5 inline-flex items-center gap-1.5 text-base font-medium text-foreground"
              >
                {c.link.label}
                <ArrowRight className="size-4 transition-transform duration-150 ease-standard group-hover:translate-x-0.5" />
              </a>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
