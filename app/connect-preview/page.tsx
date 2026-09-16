/** Isolated mount of the connect dialog, outside the auth-gated /app route,
 *  so a headless browser can render and measure it. The dialog grew a row of
 *  cards per pair of bodies and ran off the bottom of a laptop screen once the
 *  wheel shipped six; nothing could catch that, because every route that
 *  renders it needs a session. Same pattern as /simview-preview.
 *  DEV ONLY — 404s in production. */

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ConnectPreviewClient } from "./client";

export const metadata: Metadata = {
  title: "Connect dialog preview",
  robots: { index: false, follow: false },
};

export default function ConnectPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ConnectPreviewClient />;
}
