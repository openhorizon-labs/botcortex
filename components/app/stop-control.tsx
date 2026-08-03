"use client";

/**
 * The e-stop. The blueprint requires it to be always visible and never queued
 * behind chat traffic (it's its own REST endpoint) — but a permanently loud red
 * button in the top bar becomes wallpaper, which is the opposite of safe.
 *
 * So prominence is contextual: a quiet outline while the robot is idle, solid
 * red with a halo the moment anything is moving. Fixed bottom-right, clear of
 * the send button so it can never be mis-clicked.
 */

import { useState } from "react";
import { OctagonX } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRobot } from "@/components/app/robot-provider";

export function StopControl() {
  const { status, activity, stop } = useRobot();
  const [stopped, setStopped] = useState(false);
  const connected = status === "connected";
  const moving = connected && activity.startsWith("running");

  async function handleStop() {
    const ok = await stop();
    if (ok) {
      setStopped(true);
      setTimeout(() => setStopped(false), 2500);
    }
  }

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex items-center gap-2">
      {stopped && (
        <span className="pointer-events-auto rounded-full border border-destructive/30 bg-background px-3 py-1.5 text-xs text-destructive">
          Stopped — motion aborted
        </span>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleStop}
            disabled={!connected}
            className={cn(
              "pointer-events-auto flex items-center gap-1.5 rounded-full text-xs font-semibold tracking-wide transition-all",
              moving
                ? "h-11 bg-destructive px-5 text-white shadow-lg shadow-destructive/25 ring-4 ring-destructive/20 hover:bg-destructive/90"
                : "h-9 border border-border bg-background px-3.5 text-muted-foreground hover:border-destructive/40 hover:text-destructive",
              !connected && "cursor-not-allowed opacity-50",
            )}
            aria-label="Emergency stop"
          >
            <OctagonX className={cn("size-4", moving && "animate-pulse")} />
            STOP
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {connected
            ? "Aborts motion between interpolation steps — its own endpoint, never queued behind chat"
            : "Connect a robot first"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
