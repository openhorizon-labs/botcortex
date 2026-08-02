import type { Metadata } from "next";
import { Check } from "lucide-react";
import { Nav } from "@/components/site/nav";
import { Footer } from "@/components/site/footer";
import { DemoCal } from "@/components/site/demo-form";

export const metadata: Metadata = {
  title: "Book a demo",
  description:
    "See BotCortex teach a real robot a new task, live: type it, review the plan, watch it run and remember. 30 minutes, on a real robot — not slides.",
  alternates: { canonical: "/demo" },
  openGraph: {
    title: "See BotCortex on a real robot",
    description: "30 minutes, live — not slides.",
    url: "/demo",
    images: [{ url: "/og/og-demo.png", width: 1200, height: 630, alt: "Book a BotCortex demo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "See BotCortex on a real robot",
    description: "30 minutes, live — not slides.",
    images: ["/og/og-demo.png"],
  },
};

const BULLETS = [
  "A task taught by typing, live",
  "The failure → memory → better-retry loop",
  "The unplug test",
  "Bring your robot — we'll talk integration",
];

export default function Page() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-[1368px] px-6 py-12 lg:px-10 lg:py-16">
          <h1 className="text-[2.25rem] font-normal leading-[1.08] tracking-[-0.01em] sm:text-[3rem]">
            See it on a real robot.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Thirty minutes with the team behind BotCortex. We teach a robot something
            new while you watch — then talk about yours. Pick a time below.
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-8 gap-y-2.5">
            {BULLETS.map((b) => (
              <li key={b} className="flex items-center gap-2 text-sm text-foreground/80">
                <Check className="size-4 shrink-0 text-foreground/60" />
                {b}
              </li>
            ))}
          </ul>

          <div className="mt-10">
            <DemoCal />
          </div>

          <p className="mt-6 font-mono text-xs text-muted-foreground">
            Prefer email? contact@openhorizon.so
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
