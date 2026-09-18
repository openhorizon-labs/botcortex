"use client";

/**
 * The simulation panel — an inline, collapsible right pane (the sim.ai
 * workspace pattern): the chat column shrinks in place, the panel sits flush
 * against the edge behind a hairline left border, and its collapse control
 * lives in its own header. No overlay, no rounding.
 */

import dynamic from "next/dynamic";
import { useState } from "react";
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
    <div role="status" className="flex h-full items-center justify-center text-sm text-muted-foreground">
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
  const { robot, activity, status, simBooting, cameraFeed } = useRobot();
  // A real arm with a camera shows both: the twin the arm plans in, and what
  // the camera sees. One is the picture, the other an inset; a click swaps
  // them. The sim and the mock have no camera, and no inset.
  const [cameraLarge, setCameraLarge] = useState(false);
  if (!open) return null;
  const twin = <SimView />;
  const camera = cameraFeed ? (
    // eslint-disable-next-line @next/next/no-img-element -- a motion-JPEG stream, not an asset
    <img src={cameraFeed} alt="What the robot's camera sees" className="size-full object-contain" />
  ) : null;

  return (
    <div data-sim-panel className="relative z-10 flex h-full w-1/2 min-w-0 flex-col overflow-hidden border-l border-border bg-background">
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
        <span className="min-w-0 truncate text-sm">{robot?.name ?? "Simulation"}</span>
        {simBooting && (
          <span className="min-w-0 truncate text-xs text-muted-foreground">{simBooting}…</span>
        )}
        {status === "connected" && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <LiveDot />
            {activity}
          </span>
        )}
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-surface-2">
        {camera && cameraLarge ? camera : twin}
        {camera && (
          <button
            type="button"
            onClick={() => setCameraLarge((large) => !large)}
            aria-label={cameraLarge ? "Show the simulation large" : "Show the camera large"}
            title={cameraLarge ? "Simulation — click to swap" : "Camera — click to swap"}
            className="absolute right-3 bottom-3 aspect-[4/3] w-2/5 cursor-pointer overflow-hidden rounded-md border border-border bg-background shadow-sm"
          >
            {cameraLarge ? twin : camera}
            <span className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <LiveDot /> {cameraLarge ? "twin" : "camera"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
