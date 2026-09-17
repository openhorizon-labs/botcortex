/** Isolated mount of the welcome dialog and the Model key panel, outside the
 *  auth-gated /app, so a headless browser can render and check them. Same
 *  pattern as /connect-preview. DEV ONLY — 404s in production. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DialogsPreviewClient } from "./client";

export const metadata: Metadata = { title: "Dialogs preview", robots: { index: false, follow: false } };

export default function DialogsPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DialogsPreviewClient />;
}
