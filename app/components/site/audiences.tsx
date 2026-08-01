import { Reveal } from "@/components/kit/reveal";

const AUDIENCES = [
  {
    title: "Labs & universities",
    body: "Students teach the arm in week one, and the skills stay on the machine after the grad student graduates.",
  },
  {
    title: "Integrators",
    body: "Rough in a cell in an afternoon and save the 150 billable hours for problems that actually need an engineer.",
  },
  {
    title: "Robot OEMs",
    body: "Ship arms your customers can teach themselves — on their site, with their data, no cloud dependency.",
  },
];

export function Audiences() {
  return (
    <section className="border-b border-border/60">
      <div className="mx-auto w-full max-w-6xl px-5 py-20 lg:py-24">
        <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          For people who own robots, not robot programmers.
        </h2>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {AUDIENCES.map((a, i) => (
            <Reveal key={a.title} delay={i * 70}>
              <div className="h-full rounded-lg border border-border bg-surface-1 p-6 transition-colors duration-150 ease-standard hover:border-border-strong hover:bg-surface-2">
                <h3 className="text-base font-medium tracking-tight">{a.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                  {a.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
