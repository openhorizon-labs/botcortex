import { Button } from "@/components/ui/button";

export function FinalCta() {
  return (
    <section className="mx-auto w-full max-w-[1368px] px-6 lg:px-10">
      <div className="border-t border-border py-24 text-center lg:py-32">
        <h2 className="text-[2rem] font-normal tracking-tight sm:text-[2.75rem]">
          Teach your robot its first task tonight.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
          Install the free runtime, add your API key, and type the job you&rsquo;ve been
          putting off.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          <Button
            asChild
            className="h-11 rounded-lg bg-foreground px-5 text-sm font-medium text-background hover:bg-foreground/90"
          >
            <a href="https://github.com/openhorizon-labs/botcortex-runtime">Get started</a>
          </Button>
          <Button asChild variant="outline" className="h-11 rounded-lg border-border px-5 text-sm">
            <a href="mailto:hello@openhorizon.so">Talk to us</a>
          </Button>
        </div>
      </div>
    </section>
  );
}
