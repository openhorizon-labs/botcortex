"use client";

import { useState } from "react";
import { Cable, KeyRound, Loader2, MonitorPlay, Unplug } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRobot } from "@/components/app/robot-provider";

type Mode = "token" | "local";

export function ConnectRobotDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { status, robot, host, error, connect, disconnect, connectBrowserSim, simBooting } =
    useRobot();
  const [mode, setMode] = useState<Mode>("local");
  const [attempted, setAttempted] = useState(false);
  const [address, setAddress] = useState("");
  const [token, setToken] = useState("");

  const connecting = status === "connecting";
  const connected = status === "connected";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect a robot</DialogTitle>
          <DialogDescription>
            On the robot, run{" "}
            <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-xs">
              botcortex connect
            </code>{" "}
            — it probes the arms and prints both a pairing token and the
            robot&apos;s local address.
          </DialogDescription>
        </DialogHeader>

        {connected ? (
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {robot?.name ?? "Robot"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {robot?.platform} · {host}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={disconnect}
            >
              <Unplug className="size-3.5" /> Disconnect
            </Button>
          </div>
        ) : (
          <>
            {/* First, because it is the only option that works for someone who
                does not own an arm — which is most people opening this. */}
            <button
              onClick={() => {
                setAttempted(true);
                void connectBrowserSim();
              }}
              disabled={connecting}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border border-border bg-surface-2 p-3 text-left transition-colors",
                "hover:bg-surface-3 disabled:cursor-default disabled:opacity-70",
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
                {simBooting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <MonitorPlay className="size-4" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {simBooting ? `${simBooting}…` : "No robot? Teach one here"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {simBooting
                    ? "First run downloads the robot runtime — about 14 MB."
                    : "Runs the real runtime and real physics in this tab. Skills stay in this tab until you pair real hardware."}
                </span>
              </span>
            </button>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[11px] text-muted-foreground">or connect real hardware</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="flex gap-1 rounded-lg bg-surface-3 p-1">
              {(
                [
                  { id: "local", icon: Cable, label: "Local address" },
                  { id: "token", icon: KeyRound, label: "Pairing token" },
                ] as const
              ).map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  className={cn(
                    "flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors",
                    mode === id
                      ? "border border-border bg-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </div>

            {mode === "local" ? (
              <div className="flex flex-col gap-2">
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="192.168.1.42:9090 or thor.local:9090"
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    setAttempted(true);
                    connect(address);
                  }}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Direct connection over your local network. Works with zero
                  internet — browser and robot just need the same Wi-Fi.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Input
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="ABCD-1234"
                  disabled
                />
                <p className="text-xs text-muted-foreground">
                  Pairs through the OpenHorizon relay so this hosted app can
                  reach a robot on any network. Coming with the cloud relay —
                  use the local address for now.
                </p>
              </div>
            )}

            {/* Only errors from an attempt the USER made in this dialog. The
                provider retries a remembered robot on every page load, so its
                failure was sitting here in red before anyone had touched
                anything — a first-timer's first impression of the product was
                "Lost connection to the robot." */}
            {error && !connecting && attempted && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </>
        )}

        <DialogFooter>
          {connected ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <Button
              onClick={() => {
                setAttempted(true);
                connect(address);
              }}
              disabled={mode === "token" || !address.trim() || connecting}
              className="gap-1.5"
            >
              {connecting && <Loader2 className="size-3.5 animate-spin" />}
              {connecting ? "Connecting…" : "Connect"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
