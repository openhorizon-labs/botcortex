/** Isolated full-screen mount of the sim viewport, outside the auth-gated
 *  /app route, so a headless browser can render and screenshot it for visual
 *  QA (scripts/shoot-sim.ts). DEV ONLY — 404s in production. */

import { notFound } from "next/navigation";

import { SimPreviewClient } from "./client";

export default function SimViewPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SimPreviewClient />;
}
