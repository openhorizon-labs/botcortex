import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "BotCortex — teach your robot by typing",
    template: "%s — BotCortex",
  },
  description:
    "The LLM harness and runtime for real robots. Type a task in plain English — an AI writes the skill once, episodic memory sharpens it with every attempt, and it runs on-device forever.",
  applicationName: "BotCortex",
  keywords: [
    "robot programming",
    "LLM agents",
    "robotics runtime",
    "LLM harness for robots",
    "teach robots natural language",
    "episodic memory robotics",
    "LeRobot",
    "robot skills",
    "on-device robotics AI",
  ],
  authors: [{ name: "OpenHorizon Labs", url: "https://openhorizon.so" }],
  creator: "OpenHorizon Labs",
  publisher: "OpenHorizon Labs",
  category: "technology",
  openGraph: {
    type: "website",
    siteName: "BotCortex",
    url: SITE_URL,
    title: "BotCortex — teach your robot by typing",
    description:
      "The LLM harness and runtime for real robots. Skills run on-device; episodic memory makes them better with every attempt.",
    images: [
      {
        url: "/og/og-home.png",
        width: 1200,
        height: 630,
        alt: "BotCortex — teach your robot by typing",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BotCortex — teach your robot by typing",
    description:
      "The LLM harness and runtime for real robots. Skills run on-device; episodic memory makes them better with every attempt.",
    images: ["/og/og-home.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  alternates: { canonical: "/" },
};

const ORG_ID = "https://openhorizon.so/#organization";

const JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": ORG_ID,
      name: "OpenHorizon Labs",
      url: "https://openhorizon.so",
      email: "contact@openhorizon.so",
      logo: `${SITE_URL}/icon.svg`,
      sameAs: ["https://openhorizon.so", "https://github.com/openhorizon-labs"],
    },
    {
      "@type": "WebSite",
      name: "BotCortex",
      url: SITE_URL,
      publisher: { "@id": ORG_ID },
    },
    {
      "@type": "SoftwareApplication",
      name: "BotCortex",
      url: SITE_URL,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Linux",
      description:
        "The LLM harness and runtime for real robots — teach tasks by typing; skills execute on-device with episodic memory.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@id": ORG_ID },
      creator: { "@id": ORG_ID },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Browser extensions (password managers, ColorZilla, Grammarly) inject
          attributes onto <body> before React hydrates; that mismatch is theirs,
          not ours, and this is React's documented escape hatch for it. */}
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col bg-background text-foreground"
      >
        {children}
        {/* Page views and Web Vitals from Vercel. No-ops off Vercel, so local
            dev and any self-host stay clean. */}
        <Analytics />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSONLD) }}
        />
      </body>
    </html>
  );
}
