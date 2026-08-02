"use client";

import { useState } from "react";
import { Cable, KeyRound, Loader2, Unplug } from "lucide-react";

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
  const { status, robot, host, error, connect, disconnect } = useRobot();
  const [mode, setMode] = useState<Mode>("local");
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
                  onKeyDown={(e) => e.key === "Enter" && connect(address)}
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

            {error && !connecting && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </>
        )}

        <DialogFooter>
          {connected ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <Button
              onClick={() => connect(address)}
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
