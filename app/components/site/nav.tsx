import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/site/logo";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo className="size-6" />
          <span className="text-[15px] font-semibold tracking-tight">BotCortex</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            by OpenHorizon Labs
          </span>
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <a href="https://github.com/openhorizon-labs/botcortex">GitHub</a>
          </Button>
          <Button asChild size="sm" className="bg-signal text-signal-foreground hover:bg-signal/90">
            <Link href="/app">Open the app</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}
