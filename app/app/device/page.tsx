import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/site/logo";
import { DeviceForm } from "./device-form";

export const metadata: Metadata = {
  title: "Pair a robot",
  description: "Approve a robot's request to use your BotCortex account.",
  alternates: { canonical: "/app/device" },
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <main className="flex min-h-screen flex-col">
      {/* Not the marketing Nav: this page lives inside the signed-in area, and
          every link on that nav would bounce the owner straight back to /app.
          Just the wordmark, pointing at the control room. */}
      <header className="flex h-16 items-center px-6 lg:px-10">
        <Link href="/app" className="flex items-center gap-2">
          <Logo className="size-6 text-foreground" />
          <span className="text-[17px] font-semibold tracking-tight">BotCortex</span>
        </Link>
      </header>
      <div className="flex flex-1 items-center justify-center px-6 pb-24">
        <div className="w-full max-w-sm">
          <h1 className="text-[28px] font-normal tracking-[-0.01em]">Pair a robot</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the code shown in your robot&apos;s terminal after running{" "}
            <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-xs">
              botcortex login
            </code>
            .
          </p>
          {/* useSearchParams needs a Suspense boundary to prerender. */}
          <Suspense>
            <DeviceForm />
          </Suspense>
          <p className="mt-8 text-sm text-muted-foreground">
            <Link href="/app" className="underline underline-offset-2 hover:text-foreground">
              Back to the control room
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
