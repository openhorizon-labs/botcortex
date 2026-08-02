import type { Metadata } from "next";
import { Nav } from "@/components/site/nav";

export const metadata: Metadata = {
  title: "Join the waitlist",
  description:
    "Teach your robot by typing. We're onboarding a small group first — join the BotCortex waitlist.",
  alternates: { canonical: "/signup" },
  openGraph: {
    title: "Join the BotCortex waitlist",
    description: "Teach your robot by typing — we're onboarding a small group first.",
    url: "/signup",
    images: [{ url: "/og/og-signup.png", width: 1200, height: 630, alt: "Join the BotCortex waitlist" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Join the BotCortex waitlist",
    description: "Teach your robot by typing — we're onboarding a small group first.",
    images: ["/og/og-signup.png"],
  },
};

export default function Page() {
  return (
    <main className="flex min-h-screen flex-col">
      <Nav />
      {/* the Tally form full-page under our navbar; it scrolls itself */}
      <iframe
        src="https://tally.so/embed/81V755?transparentBackground=1"
        className="w-full flex-1"
        style={{ minHeight: "calc(100dvh - 4rem)" }}
        frameBorder={0}
        title="Join the BotCortex waitlist"
      />
    </main>
  );
}
