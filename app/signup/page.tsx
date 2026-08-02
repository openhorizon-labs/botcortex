import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/site/logo";
import { SignupCard } from "@/components/site/signup-card";

export const metadata: Metadata = {
  title: "Get started — BotCortex",
  description: "Install the open-source runtime, or get early access to BotCortex Pro.",
};

export default function Page() {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex h-16 items-center px-6 lg:px-10">
        <Link href="/" className="group flex items-center gap-2">
          <Logo className="size-6 text-foreground" />
          <span className="text-[17px] font-semibold tracking-tight">BotCortex</span>
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <SignupCard />
      </div>

      <footer className="flex flex-col items-center gap-2 px-6 py-8 text-center">
        <p className="font-mono text-xs text-muted-foreground">
          © 2026 OpenHorizon Labs · Apache-2.0 ·{" "}
          <Link href="/" className="hover:text-foreground">
            botcortex home
          </Link>
        </p>
      </footer>
    </main>
  );
}
