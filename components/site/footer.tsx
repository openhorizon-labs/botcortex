import Link from "next/link";
import { Logo } from "@/components/site/logo";

const COLUMNS = [
  {
    heading: "Product",
    links: [
      { label: "Runtime", href: "https://github.com/openhorizon-labs/botcortex-runtime" },
      { label: "Chat app", href: "/app" },
      { label: "Skill hub", href: "#" },
      { label: "Pricing", href: "#pricing" },
      { label: "Changelog", href: "#" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Docs", href: "#" },
      { label: "Quickstart", href: "#" },
      { label: "GitHub", href: "https://github.com/openhorizon-labs" },
      { label: "Research: failure memory", href: "https://arxiv.org/abs/2508.21378" },
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
    <footer className="mx-auto w-full max-w-[1368px] px-6 py-14 lg:px-10">
      <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Link href="/" className="flex items-center gap-2.5">
            <Logo className="size-6" />
            <span className="text-[15px] font-semibold tracking-tight">BotCortex</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
            The robot&rsquo;s motor cortex. Built by OpenHorizon Labs.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.heading}>
            <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {col.heading}
            </h3>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-12 flex flex-col gap-3 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-mono text-xs text-muted-foreground">
          © 2026 OpenHorizon Labs · Apache-2.0
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          Local execution, cloud intelligence.
        </p>
      </div>
    </footer>
  );
}
