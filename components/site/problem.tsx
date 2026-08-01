import { CountUp } from "@/components/kit/count-up";
import { Reveal } from "@/components/kit/reveal";

export function Problem() {
  return (
    <section className="border-b border-border/60">
      <div className="mx-auto w-full max-w-6xl px-5 py-20 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            The going rate for one new robot task:{" "}
            <span className="text-signal tabular-nums">
              <CountUp to={19000} prefix="$" />
              &ndash;
              <CountUp to={80000} prefix="$" duration={1800} />
            </span>
            .
          </h2>
          <div className="space-y-4 text-lg leading-relaxed text-muted-foreground">
            <p>
              Integrators bill $125&ndash;200 an hour, and a single task or cell takes
              150&ndash;400 of them. You wait weeks for a slot on their calendar, and when
              the task changes, the meter starts over.
            </p>
            <p className="text-foreground">
              The robot you already paid for can&rsquo;t learn a thing without them.
            </p>
          </div>
        </div>

        <dl className="mt-14 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
          {[
            { v: "$200", l: "per robot, per month", s: "flat — never per attempt" },
            { v: "minutes", l: "to teach a new task", s: "not 150 billable hours" },
            { v: "12–20 ms", l: "local control loop", s: "cloud round-trips: 3–5 s" },
          ].map((stat, i) => (
            <Reveal key={stat.l} delay={i * 70} className="bg-background">
              <div className="p-6">
                <dt className="font-mono text-3xl tracking-tight text-foreground">
                  {stat.v}
                </dt>
                <dd className="mt-2 text-sm text-foreground">{stat.l}</dd>
                <dd className="mt-1 text-sm text-muted-foreground">{stat.s}</dd>
              </div>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}
