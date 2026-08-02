import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GridHover } from "@/components/kit/grid-hover";
import { HeroCard } from "@/components/site/hero-card";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <GridHover className="h-[560px]" />
      <div className="relative z-10 mx-auto w-full max-w-[1368px] px-6 lg:px-10">
      <div className="flex flex-col justify-between gap-10 pt-16 pb-14 lg:flex-row lg:items-end lg:pt-20 lg:pb-16">
        <div className="max-w-3xl">
          <h1 className="text-[2.75rem] font-normal leading-[1.05] tracking-[-0.01em] text-foreground sm:text-[3.5rem] lg:text-[4rem]">
            Teach your robot by typing.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-6 text-foreground/80">
            The LLM harness and runtime for real robots — the agent writes each skill
            once, episodic memory sharpens it with every attempt, and it runs on-device
            forever.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <Button
              asChild
              className="h-11 rounded-lg bg-foreground px-5 text-sm font-medium text-background hover:bg-foreground/90"
            >
              <Link href="/signup">Join the waitlist</Link>
            </Button>
            <Button asChild variant="outline" className="h-11 rounded-lg border-border px-5 text-sm">
              <Link href="/demo">Book a demo</Link>
            </Button>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-6 lg:items-end">
          <div className="flex items-start gap-3">
            <span className="mt-1 h-10 w-px bg-border" />
            <div>
              <p className="text-xl font-medium tracking-tight text-foreground">12–20 ms</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Control loop, on-device.
                <br />
                The cloud never drives.
              </p>
            </div>
          </div>
        </div>
      </div>

      <HeroCard />
      </div>
    </section>
  );
}
