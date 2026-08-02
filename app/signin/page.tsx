import type { Metadata } from "next";
import { Nav } from "@/components/site/nav";
import { SignInForm } from "./signin-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the BotCortex control room.",
  alternates: { canonical: "/signin" },
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <main className="flex min-h-screen flex-col">
      <Nav />
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <h1 className="text-[28px] font-normal tracking-[-0.01em]">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Waitlist access is invite-based — use the credentials we emailed
            you. Not invited yet?{" "}
            <a href="/signup" className="underline underline-offset-2 hover:text-foreground">
              Join the waitlist
            </a>
            .
          </p>
          <SignInForm />
        </div>
      </div>
    </main>
  );
}
