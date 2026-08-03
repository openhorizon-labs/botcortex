import { Suspense } from "react";
import type { Metadata } from "next";

import { Nav } from "@/components/site/nav";
import { DeviceForm } from "./device-form";

export const metadata: Metadata = {
  title: "Pair a robot",
  description: "Approve a robot's request to use your BotCortex account.",
  alternates: { canonical: "/device" },
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <main className="flex min-h-screen flex-col">
      <Nav />
      <div className="flex flex-1 items-center justify-center px-6 py-16">
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
        </div>
      </div>
    </main>
  );
}
