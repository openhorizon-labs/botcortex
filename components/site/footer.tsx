import Link from "next/link";
import { LiveDot } from "@/components/kit/live-dot";
import { Logo } from "@/components/site/logo";

const COLUMNS = [
  {
    heading: "Product",
    links: [
      { label: "Runtime", href: "https://github.com/openhorizon-labs" },
      { label: "Skill hub", href: "#" },
      { label: "Pricing", href: "/#pricing" },
      { label: "Book a demo", href: "/demo" },
      { label: "Join the waitlist", href: "/signup" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Docs", href: "#" },
      { label: "Quickstart", href: "#" },
      { label: "GitHub", href: "https://github.com/openhorizon-labs" },
      { label: "Research: episodic memory", href: "https://arxiv.org/abs/2508.21378" },
      { label: "Community", href: "#" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About OpenHorizon Labs", href: "https://openhorizon.so" },
      { label: "Blog", href: "#" },
      { label: "Safety", href: "#" },
      { label: "Contact", href: "mailto:hello@openhorizon.so" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="group/footer relative overflow-hidden border-t border-border bg-surface-1">
      {/* the mark lives inside the same section — faded, cropped by the corner,
          spinning (like the nav logo) when the footer is hovered */}
      <div aria-hidden className="pointer-events-none absolute -right-16 -bottom-24 hidden lg:block">
        <Logo className="size-[19rem] text-foreground/[0.05] motion-safe:group-hover/footer:rotate-[720deg]" />
      </div>

      <div className="relative mx-auto w-full max-w-[1368px] px-6 lg:px-10">
        <div className="grid grid-cols-2 gap-x-8 gap-y-9 py-10 md:grid-cols-[1.5fr_repeat(3,1fr)] lg:py-14">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="group flex items-center gap-2.5">
              <Logo className="size-6 text-foreground" />
              <span className="text-[15px] font-semibold tracking-tight">BotCortex</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              The robot&rsquo;s motor cortex — teach a skill once, episodic memory keeps
              making it better. Built by OpenHorizon Labs.
            </p>
            <p className="mt-4 flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <LiveDot />
              v0 · building in the open
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                {col.heading}
              </h3>
              <ul className="mt-3.5 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-muted-foreground transition-colors duration-150 ease-standard hover:text-foreground"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t border-border py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-xs text-muted-foreground">
            © 2026 OpenHorizon Labs
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            Local execution, cloud intelligence.
          </p>
        </div>
      </div>
    </footer>
  );
}
