import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroDemo } from "@/components/site/hero-demo";
import { CopyCommand } from "@/components/kit/copy-command";

/** Our own backdrop art: horizon contour lines, drawn in code — no photograph.
 *  Faint topographic curves + a warm wash, fading out under the product window. */
function HorizonBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-32 left-1/2 h-[34rem] w-[70rem] -translate-x-1/2 rounded-full bg-signal/[0.07] blur-[100px]" />
      <svg
        className="absolute inset-x-0 top-0 h-[46rem] w-full text-foreground/[0.05] [mask-image:linear-gradient(to_bottom,black_35%,transparent_92%)]"
        viewBox="0 0 1440 700"
        preserveAspectRatio="xMidYMin slice"
        fill="none"
      >
        {Array.from({ length: 11 }, (_, i) => {
          const y = 90 + i * 58;
          const a = 36 + i * 9;
          return (
            <path
              key={i}
              d={`M-40 ${y} C 240 ${y - a}, 460 ${y + a}, 760 ${y - a * 0.5} S 1240 ${y + a * 0.7}, 1480 ${y - a * 0.3}`}
              stroke="currentColor"
              strokeWidth="1"
            />
          );
        })}
      </svg>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <HorizonBackdrop />

      <div className="relative mx-auto w-full max-w-6xl px-5 pt-20 pb-16 lg:pt-28 lg:pb-20">
        <div className="mx-auto max-w-3xl text-center">
          <Link
            href="#remember"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3.5 py-1 text-xs text-muted-foreground backdrop-blur transition-colors duration-150 ease-standard hover:text-foreground"
          >
            <span className="size-1.5 rounded-full bg-signal" />
            Failure memory improves success up to 35%
            <ArrowRight className="size-3" />
          </Link>

          <h1 className="mt-6 text-balance text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl lg:text-[4.4rem]">
            Teach your robot by typing.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Software installed on your robot: type a task in plain English, an AI writes
            the skill once, and it runs locally forever — no cloud in the control loop.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="h-11 bg-signal px-6 text-signal-foreground hover:bg-signal/90"
            >
              <a href="https://github.com/openhorizon-labs/botcortex-runtime">
                Install the free runtime
              </a>
            </Button>
            <CopyCommand command="pip install botcortex" className="h-11" />
          </div>

          <p className="mt-7 font-mono text-xs text-muted-foreground">
            Open source · Your API key, your data · Built first for the LeRobot community
          </p>
        </div>

        <div className="mt-14 lg:mt-16">
          <HeroDemo />
        </div>
      </div>
    </section>
  );
}
