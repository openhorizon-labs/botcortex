import { Button } from "@/components/ui/button";

export function FinalCta() {
  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 left-1/2 size-[30rem] -translate-x-1/2 rounded-full bg-signal/10 blur-[110px]"
      />
      <div className="relative mx-auto w-full max-w-6xl px-5 py-24 text-center lg:py-28">
        <h2 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Teach your robot its first task tonight.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
          Install the free runtime, add your API key, and type the job you&rsquo;ve been
          putting off.
        </p>
        <Button
          asChild
          size="lg"
          className="mt-9 h-12 bg-signal px-7 text-base text-signal-foreground hover:bg-signal/90"
        >
          <a href="https://github.com/openhorizon-labs/botcortex-runtime">
            Install BotCortex
          </a>
        </Button>
      </div>
    </section>
  );
}
