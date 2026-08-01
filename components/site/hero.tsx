import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlanDemo } from "@/components/site/plan-demo";
import { CopyCommand } from "@/components/kit/copy-command";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/60">
      {/* blueprint grid + a warm glow behind the demo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black,transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[38rem] -translate-x-1/2 rounded-full bg-signal/10 blur-[120px]"
      />

      <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-5 pt-16 pb-20 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:pt-24 lg:pb-28">
        <div>
          <Link
            href="#remember"
            className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-surface px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="size-1.5 rounded-full bg-signal" />
            Failure memory improves success up to 35%
            <ArrowRight className="size-3" />
          </Link>

          <h1 className="mt-6 text-balance text-5xl font-semibold leading-[1.03] tracking-tight sm:text-6xl lg:text-[4.2rem]">
            Teach your robot by typing.
          </h1>

          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Software installed on your robot: type a task in plain English, an AI writes
            the skill once, and it runs locally forever — no cloud in the control loop.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              asChild
              size="lg"
              className="h-11 bg-signal px-5 text-signal-foreground hover:bg-signal/90"
            >
              <a href="https://github.com/openhorizon-labs/botcortex-runtime">
                Install the free runtime
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11 px-5">
              <Link href="#how">
                <Play className="size-4" />
                Watch the demo
              </Link>
            </Button>
          </div>

          <CopyCommand command="pip install botcortex" className="mt-5" />

          <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-xs text-muted-foreground">
            <span>Open source</span>
            <span className="text-border">/</span>
            <span>Your API key, your data</span>
            <span className="text-border">/</span>
            <span>Built first for the LeRobot community</span>
          </div>
        </div>

        <div className="lg:pl-4">
          <PlanDemo />
        </div>
      </div>
    </section>
  );
}
