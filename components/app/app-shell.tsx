"use client";

import { RobotProvider } from "@/components/app/robot-provider";
import { StopControl } from "@/components/app/stop-control";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Holds the robot connection and the transcript ABOVE the route segments.
 *
 * It used to live inside the page. That meant navigating /app -> /app/tasks/id
 * unmounted it — dropping the WebSocket and wiping the conversation — and
 * since a task earns its URL on its first message, sending one or running a
 * skill from a fresh task cleared the very history it had just created.
 *
 * STOP lives here too (audit B07). It was rendered inside the workspace, so
 * opening /app/device to approve a pairing kept the runtime connected and
 * removed the one control that stops it. Every signed-in route with a live
 * connection now shows it.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <RobotProvider>
      <TooltipProvider>
        {children}
        <StopControl />
      </TooltipProvider>
    </RobotProvider>
  );
}
