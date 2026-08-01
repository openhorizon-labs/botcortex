import { Reveal } from "@/components/kit/reveal";

const STEPS = [
  {
    title: "Type the task",
    body: "Describe the job in plain English, in a chat window served from the robot on your own network.",
  },
  {
    title: "Review the plan, run",
    body: "The agent's steps appear before anything moves; approve them, dry-run first, with an operator present.",
  },
  {
    title: "The robot remembers",
    body: "The skill is saved on-device, the attempt is logged, and past failures sharpen the next thing you teach.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-16 border-b border-border/60">
      <div className="mx-auto w-full max-w-6xl px-5 py-20 lg:py-24">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          From a sentence to a skill.
        </h2>

        <ol className="mt-12 grid gap-8 md:grid-cols-3 md:gap-6">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Reveal delay={i * 80}>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-signal">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <h3 className="mt-4 text-lg font-medium tracking-tight">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{s.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
