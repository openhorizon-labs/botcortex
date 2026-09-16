import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Nav } from "@/components/site/nav";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create an account",
  description:
    "Teach your robot by typing. Create a BotCortex account and start with a simulated arm in your browser.",
  alternates: { canonical: "/signup" },
  openGraph: {
    title: "Create a BotCortex account",
    description: "Teach your robot by typing — start with a simulated arm in your browser.",
    url: "/signup",
    images: [{ url: "/og/og-signup.png", width: 1200, height: 630, alt: "Create a BotCortex account" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Create a BotCortex account",
    description: "Teach your robot by typing — start with a simulated arm in your browser.",
    images: ["/og/og-signup.png"],
  },
};

export default function Page() {
  return (
    <main className="flex min-h-screen flex-col">
      <Nav />
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <h1 className="text-[28px] font-normal tracking-[-0.01em]">Create an account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Already have one?{" "}
            <Link href="/signin" className="underline underline-offset-2 hover:text-foreground">
              Sign in
            </Link>
            .
          </p>
          {/* useSearchParams (the post-sign-up destination) needs a boundary. */}
          <Suspense>
            <SignUpForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
