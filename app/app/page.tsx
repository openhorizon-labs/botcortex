import type { Metadata } from "next";

import { Workspace } from "@/components/app/workspace";

export const metadata: Metadata = {
  title: "Control room",
  robots: { index: false, follow: false },
};

/** A fresh task. It gains a URL of its own the moment you say something. */
export default function Page() {
  return <Workspace />;
}
