"use client";

/**
 * The e-stop. The blueprint requires it to be always visible and never queued
 * behind chat traffic (it's its own REST endpoint) — but a permanently loud red
 * button in the top bar becomes wallpaper, which is the opposite of safe.
 *
 * So prominence is contextual: a quiet outline while the robot is idle, solid
 * red with a halo the moment anything is moving, and a persistent banner once
 * the stop is LATCHED. Fixed bottom-right, clear of the send button so it can
 * never be mis-clicked.
 *
 * The latch matters. The e-stop is a file on the robot and it blocks every
 * motion until something removes it. A toast that fades after two seconds
 * while the robot stays blocked is how an owner ends up with a robot that
 * "doesn't work" and no idea why — which is exactly what happened here.
 *
 * Clearing is two-step on purpose: un-blocking motion on a machine the clicker
 * may not be looking at deserves more than one click.
 */

import { useEffect, useState } from "react";
import { OctagonX, RotateCcw, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRobot } from "@/components/app/robot-provider";

/** What kind of robot the latch is on — said out loud beside STOP, so a
 *  simulation twin is never mistaken for hardware, or the reverse. */
function backendLabel(platform: string | undefined, host: string | null): string {
  if (host === "this browser" || platform === "wasm") return "Simulation in this tab";
  if (platform === "mock") return "Mock robot";
  if (platform?.startsWith("sim")) return "Simulation";
  return platform ? `${platform} (hardware path)` : "Robot";
}

export function StopControl() {
  const { status, activity, stop, stopped, stopState, resetStop, host, robot, simOpen } = useRobot();
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const connected = status === "connected";
  // REST may still be reachable after the conversational socket drops.
  const canStop = connected || Boolean(host && host !== "this browser");
  const backend = backendLabel(robot?.platform, host);
  // Teaching moves the arm too — get_positions, move_to, gripper, and running
  // the skill it just wrote. Matching only "running" meant the button stayed
  // quiet through the ENTIRE authoring pass, which is the longest stretch of
  // motion in the product. workspace.tsx checks both prefixes; this did not.
  const moving =
    connected && (activity.startsWith("running") || activity.startsWith("teaching"));

  // Never leave a confirm hanging: the CLI or another operator can clear the
  // latch out from under this tab.
  useEffect(() => {
    if (!stopped) setConfirming(false);
  }, [stopped]);

  // Nothing to stop and nothing connected: no control at all, so the device
  // page is not decorated with a dead button. After every hook, so the
  // hook order is the same on every render.
  if (!canStop && stopState === "clear" && status === "disconnected") return null;
  // The in-tab sim: STOP belongs with the viewer. With the viewer closed the
  // pill is clutter over the chat (Sai, Sep 16), and the viewer opens on its
  // own the moment the robot starts working, so the button is back before
  // there is anything to stop. A latched stop still shows, so the clear
  // control is never hidden. A real robot keeps STOP on every route (B07).
  if (host === "this browser" && !simOpen && !stopped) return null;

  async function handleStop() {
    setFailure(null);
    setStopping(true);
    try {
      if (!await stop()) setFailure("STOP was not confirmed. Check the robot and use its physical stop if needed.");
    } catch {
      setFailure("STOP was not confirmed. Check the robot and use its physical stop if needed.");
    } finally {
      setStopping(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    setFailure(null);
    try {
      if (await resetStop()) setConfirming(false);
      else setFailure("Could not clear the stop. Wait for the task to finish and retry.");
    } catch {
      setFailure("Could not clear the stop. Check the connection and retry.");
    } finally {
      setClearing(false);
    }
  }

  if (stopped) {
    return (
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex max-w-[min(28rem,calc(100vw-2.5rem))] items-center gap-3 rounded-xl border border-destructive/30 bg-background px-3.5 py-3 shadow-lg">
        <TriangleAlert className="size-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-destructive">
            {stopState === "unknown" ? "Stop state unknown" : "Motion blocked"}
          </p>
          {failure && <p role="alert" className="text-xs text-destructive">{failure}</p>}
          <p className="text-xs text-muted-foreground">
            {confirming
              ? "Check the area around the robot is clear."
              : stopState === "unknown"
                ? `The connection dropped while the stop was latched — ${backend.toLowerCase()} may still be stopped. Reconnect to confirm.`
                : `E-stop latched on ${backend.toLowerCase()} — skills won't run until it's cleared.`}
          </p>
        </div>
        {confirming ? (
          <div className="pointer-events-auto flex shrink-0 items-center gap-1">
            <button
              onClick={() => setConfirming(false)}
              className="h-8 cursor-pointer rounded-lg px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleClear}
              disabled={clearing}
              className="h-8 cursor-pointer rounded-lg bg-destructive px-3 text-xs font-semibold text-white hover:bg-destructive/90 disabled:opacity-60"
            >
              {clearing ? "Clearing…" : "Area is clear"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="pointer-events-auto flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:border-destructive/40 hover:text-destructive"
          >
            <RotateCcw className="size-3.5" />
            Clear
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex items-center gap-2">
      {failure && <p role="alert" className="max-w-64 rounded-lg border border-destructive/30 bg-background p-3 text-xs text-destructive">{failure}</p>}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleStop}
            disabled={!canStop || stopping}
            className={cn(
              "pointer-events-auto flex items-center gap-1.5 rounded-full text-xs font-semibold tracking-wide transition-all",
              moving
                ? "h-11 bg-destructive px-5 text-white shadow-lg shadow-destructive/25 ring-4 ring-destructive/20 hover:bg-destructive/90"
                : "h-9 border border-border bg-background px-3.5 text-muted-foreground hover:border-destructive/40 hover:text-destructive",
               canStop ? "cursor-pointer" : "cursor-not-allowed opacity-50",
            )}
            aria-label="Emergency stop"
          >
            <OctagonX className={cn("size-4", moving && "animate-pulse")} />
            {stopping || stopState === "pending" ? "Stopping…" : "STOP"}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {canStop
            ? `${backend}. ${host === "this browser" ? "Stops playback and latches the sim's stop file." : "Requests the runtime's independent STOP endpoint; the button reports only what the runtime confirms."} Not a physical emergency stop.`
            : "Connect a robot first"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
