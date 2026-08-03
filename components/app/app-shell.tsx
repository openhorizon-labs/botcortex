"use client";

import { RobotProvider } from "@/components/app/robot-provider";

/**
 * Holds the robot connection and the transcript ABOVE the route segments.
 *
 * It used to live inside the page. That meant navigating /app -> /app/tasks/id
 * unmounted it — dropping the WebSocket and wiping the conversation — and
 * since a task earns its URL on its first message, sending one or running a
 * skill from a fresh task cleared the very history it had just created.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return <RobotProvider>{children}</RobotProvider>;
}
