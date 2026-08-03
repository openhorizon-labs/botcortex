import type { Metadata } from "next";

import { AppShell } from "@/components/app/app-shell";

export const metadata: Metadata = {
  title: "Control room",
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Wraps /app, /app/tasks/[id] and /app/device, so the robot connection and
  // the transcript survive moving between them.
  return <AppShell>{children}</AppShell>;
}
