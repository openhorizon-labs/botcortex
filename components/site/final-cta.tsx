import { Button } from "@/components/ui/button";
import { GridHover } from "@/components/kit/grid-hover";

export function FinalCta() {
  return (
    <section className="relative overflow-hidden">
      <GridHover className="h-full" />
      {/* the oldest way to teach, faded into the paper */}
      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <img
          src="/brand/hands-alpha.png"
          alt=""
          className="w-[56rem] max-w-none opacity-25 [mask-image:radial-gradient(ellipse_65%_75%_at_50%_50%,black_35%,transparent_78%)]"
        />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-[1368px] px-6 lg:px-10">
      <div className="border-t border-border py-24 text-center lg:py-32">
        <h2 className="text-[2rem] font-normal tracking-tight sm:text-[2.75rem]">
          Teach your robot its first task tonight.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
          Join the waitlist and we&rsquo;ll onboard you as spots open — bring the job
          you&rsquo;ve been putting off.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          <Button
            asChild
            className="h-11 rounded-lg bg-foreground px-5 text-sm font-medium text-background hover:bg-foreground/90"
          >
            <a href="/signup">Join the waitlist</a>
          </Button>
          <Button asChild variant="outline" className="h-11 rounded-lg border-border px-5 text-sm">
            <a href="/demo">Book a demo</a>
          </Button>
        </div>
      </div>
      </div>
    </section>
  );
}
