import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/site/logo";
import { SignupCard } from "@/components/site/signup-card";

export const metadata: Metadata = {
  title: "Join the waitlist — BotCortex",
  description: "Teach your robot by typing. Join the BotCortex waitlist.",
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
    </main>
  );
}
