import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/kit/reveal";
import { cn } from "@/lib/utils";

const TIERS = [
  {
    name: "Free",
    price: "$0",
    note: "open source, forever",
    features: [
      "Full runtime, SDK, and chat app on one robot",
      "Skills and episodic memory stored locally — no account needed",
      "Bring your own API key; we never resell inference",
    ],
    cta: "Install the runtime",
    href: "https://github.com/openhorizon-labs/botcortex-runtime",
    featured: false,
  },
  {
    name: "Pro",
    price: "$200",
    note: "per robot, per month",
    features: [
      "Memory backup and sync across your robots",
      "Fleet dashboard, remote access, and shared fleet learning",
      "Private skill repos for your team",
    ],
    cta: "Talk to us",
    href: "mailto:hello@openhorizon.so",
    featured: true,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-16">
      <div className="mx-auto w-full max-w-[1368px] px-6 pb-24 lg:px-10">
        <h2 className="text-[26px] font-medium tracking-tight sm:text-[32px]">
          Priced per robot. Never per attempt.
        </h2>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          The old way is an integrator quote: $19,000–$80,000 per task. This is the new way.
        </p>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {TIERS.map((t, i) => (
            <Reveal
              key={t.name}
              delay={i * 70}
              className={cn(
                "rounded-3xl border p-7 lg:p-8",
                t.featured
                  ? "border-signal/40 bg-signal/[0.04]"
                  : "border-border bg-surface-1",
              )}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-base font-medium">{t.name}</h3>
                {t.featured && (
                  <span className="rounded-full border border-signal/40 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-signal">
                    deployed
                  </span>
                )}
              </div>

              <div className="mt-5 flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight">{t.price}</span>
                <span className="text-sm text-muted-foreground">{t.note}</span>
              </div>

              <ul className="mt-7 space-y-3">
                {t.features.map((f) => (
                  <li key={f} className="flex gap-3 text-sm leading-relaxed">
                    <Check className="mt-0.5 size-4 shrink-0 text-signal" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                variant={t.featured ? "default" : "outline"}
                className={cn(
                  "mt-8 w-full",
                  t.featured && "bg-signal text-signal-foreground hover:bg-signal/90",
                )}
              >
                <a href={t.href}>{t.cta}</a>
              </Button>
            </Reveal>
          ))}
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          Hard tasks fail sometimes — we never charge for attempts, and an expired
          subscription never stops your robot.
        </p>
      </div>
    </section>
  );
}
