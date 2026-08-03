"use client";

/**
 * The simulation panel — an inline, collapsible right pane (the sim.ai
 * workspace pattern): the chat column shrinks in place, the panel sits flush
 * against the edge behind a hairline left border, and its collapse control
 * lives in its own header. No overlay, no rounding.
 */

import dynamic from "next/dynamic";
import { PanelRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LiveDot } from "@/components/kit/live-dot";
import { useRobot } from "@/components/app/robot-provider";

/** three.js is browser-only; ssr:false keeps the server render clean. */
const SimView = dynamic(() => import("@/components/app/sim-view"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      loading simulation…
    </div>
  ),
});

export function SimPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { robot, activity, status } = useRobot();
  if (!open) return null;

  return (
    <div className="relative z-10 flex h-full w-1/2 min-w-0 flex-col overflow-hidden border-l border-border bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 px-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="size-7 text-muted-foreground"
              aria-label="Hide the simulation"
            >
              <PanelRight className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Hide the simulation</TooltipContent>
        </Tooltip>
        <span className="text-sm">{robot?.name ?? "Simulation"}</span>
        {status === "connected" && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <LiveDot />
            {activity}
          </span>
        )}
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-surface-2">
        <SimView />
      </div>
    </div>
  );
}
