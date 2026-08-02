import type { Metadata } from "next";
import { Check } from "lucide-react";
import { Nav } from "@/components/site/nav";
import { Footer } from "@/components/site/footer";
import { DemoForm } from "@/components/site/demo-form";

export const metadata: Metadata = {
  title: "Book a demo — BotCortex",
  description:
    "See BotCortex teach a real robot a new task, live: type it, review the plan, watch it run and remember.",
};

const BULLETS = [
  "Watch a task taught by typing — plan review to execution, live",
  "The failure → episodic memory → better-retry loop on real hardware",
  "The unplug test: network off, taught skills keep running",
  "Your robot, your stack: bring your platform and we'll talk integration",
];

export default function Page() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-[1368px] px-6 py-16 lg:px-10 lg:py-24">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
            <div>
              <h1 className="text-[2.25rem] font-normal leading-[1.08] tracking-[-0.01em] sm:text-[3rem]">
                See it on a real robot.
              </h1>
              <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
                Thirty minutes with the team behind BotCortex. We teach a robot
                something new while you watch — then talk about yours.
              </p>
              <ul className="mt-8 space-y-3.5">
                {BULLETS.map((b) => (
                  <li key={b} className="flex gap-3 text-[15px] leading-relaxed">
                    <Check className="mt-0.5 size-4 shrink-0 text-foreground/60" />
                    <span className="text-foreground/85">{b}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-8 border-t border-border pt-5 font-mono text-xs text-muted-foreground">
                Prefer email? hello@openhorizon.so
              </p>
            </div>
            <DemoForm />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
