import { Button } from "@/components/ui/button";
import { CopyCommand } from "@/components/kit/copy-command";
import { GridHover } from "@/components/kit/grid-hover";
import { HeroCard } from "@/components/site/hero-card";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <GridHover className="h-[560px]" />
      <div className="relative z-10 mx-auto w-full max-w-[1368px] px-6 lg:px-10">
      <div className="flex flex-col justify-between gap-10 pt-16 pb-14 lg:flex-row lg:items-end lg:pt-24 lg:pb-16">
        <div className="max-w-3xl">
          <h1 className="text-[2.75rem] font-normal leading-[1.05] tracking-[-0.01em] text-foreground sm:text-[3.5rem] lg:text-[4rem]">
            Teach your robot by typing.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-6 text-foreground/80">
            Open source, installed on the robot itself. Type a task in plain English —
            an AI writes the skill once, and it runs locally forever.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <Button
              asChild
              className="h-11 rounded-lg bg-foreground px-4.5 text-sm font-medium text-background hover:bg-foreground/90"
            >
              <a href="https://github.com/openhorizon-labs/botcortex-runtime">
                Install the runtime
              </a>
            </Button>
            <CopyCommand command="pip install botcortex" className="h-11 rounded-lg" />
          </div>
        </div>

        <div className="flex items-start gap-3 lg:pb-1">
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

      <HeroCard />
      </div>
    </section>
  );
}
