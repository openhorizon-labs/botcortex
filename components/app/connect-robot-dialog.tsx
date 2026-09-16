"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Cable, KeyRound, Loader2, MonitorPlay, Unplug } from "lucide-react";

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
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { useRobot } from "@/components/app/robot-provider";
import { BODY_CARDS, BOOTABLE_BODIES } from "@/lib/robot/bodies";

/** The bodies the shipped wheel can boot in a browser — from the manifest,
 *  which a test keeps equal to the wheel's own catalog, so the choice
 *  offered here is exactly what the worker will accept. */
const SIM_BODIES = BOOTABLE_BODIES;

/** What each body IS, for someone choosing one. Copy, not capability data —
 *  the runtime's descriptor is the source for what a body can do. */

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
  /** The "teach one here" button turns the dialog into a chooser: one card
   *  per body the wheel can boot, then back to the connect view. */
  const [step, setStep] = useState<"connect" | "choose">("connect");
  const [address, setAddress] = useState("");
  const [token, setToken] = useState("");

  const connecting = status === "connecting";
  const connected = status === "connected";

  if (step === "choose") {
    return (
      <Dialog open={open} onOpenChange={(next) => { if (!next) setStep("connect"); onOpenChange(next); }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Which robot?</DialogTitle>
            <DialogDescription>
              Every one of these runs the real runtime and real physics in this
              tab. Pick the body to teach; you can switch later from the
              simulation panel.
            </DialogDescription>
          </DialogHeader>
          {/* One row that scrolls sideways, not a grid that grows downward.
              With two bodies a 2-column grid fitted; with six it was three
              rows of tall cards and the dialog ran off the bottom of a laptop
              screen, taking the Back button with it. A carousel keeps the
              dialog one screenful whatever the wheel ships. */}
          {/* min-w-0: the track is a flex row six cards wide, and a grid child
              defaults to min-width:auto, so without this the dialog stretched
              to the track's full width and clipped its own heading. */}
          <Carousel
            opts={{ align: "start", containScroll: "trimSnaps" }}
            className="w-full min-w-0"
          >
            {/* Above the cards, in flow. They were overlaid on the track,
                which put the left arrow on top of the first card and the
                right one on top of the third: hovering an arrow lit the card
                underneath, and a click that missed the 28-pixel circle booted
                that robot instead of scrolling. Nothing now overlaps anything
                clickable, and a disabled arrow is legible as an end rather
                than as a dead control stuck to a card. */}
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {SIM_BODIES.length} bodies — drag or use the arrows
              </p>
              <div className="flex shrink-0 gap-1.5">
                <CarouselPrevious className="static size-7 translate-x-0 translate-y-0" />
                <CarouselNext className="static size-7 translate-x-0 translate-y-0" />
              </div>
            </div>
            <CarouselContent className="-ml-3">
              {SIM_BODIES.map((body) => {
                const card = BODY_CARDS[body.name];
                return (
                  <CarouselItem key={body.name} className="basis-[15rem] pl-3 sm:basis-[16rem]">
                    <button
                      disabled={connecting}
                      onClick={() => {
                        setAttempted(true);
                        setStep("connect");
                        void connectBrowserSim(body.name);
                      }}
                      className={cn(
                        "group flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-surface-2 text-left transition-colors",
                        "hover:border-foreground/40 hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70",
                      )}
                    >
                      <span className="relative block aspect-[4/3] w-full bg-surface-3">
                        {/* Rendered from the simulation itself — the same model
                            the tab will boot — not an illustration. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/robots/cards/${body.name}.png`}
                          alt={`${body.displayName} in the simulation`}
                          className="absolute inset-0 size-full object-cover"
                          draggable={false}
                        />
                      </span>
                      <span className="flex flex-1 flex-col gap-1 p-3.5">
                        <span className="text-sm font-medium">{body.displayName}</span>
                        {/* The tagline only. The full card copy is what made
                            these tall enough to overflow; it lives on /skills,
                            where there is room to read it. */}
                        {card && (
                          <span className="text-xs leading-relaxed text-muted-foreground">
                            {card.tagline}
                          </span>
                        )}
                        <span className="mt-auto flex items-center gap-1 pt-2 text-xs font-medium">
                          {simBooting ? (
                            <><Loader2 className="size-3.5 animate-spin" /> {simBooting}…</>
                          ) : (
                            <>Teach this robot <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></>
                          )}
                        </span>
                      </span>
                    </button>
                  </CarouselItem>
                );
              })}
            </CarouselContent>
          </Carousel>
          <DialogFooter className="sm:justify-start">
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setStep("connect")}>
              <ArrowLeft className="size-3.5" /> Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
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
          /* min-w-0 twice and shrink-0 on the button, or `truncate` cannot
             bite: a grid child and a flex child both default to min-width
             auto, so a long robot name widened the row, the row widened the
             dialog, and the description and the Disconnect button were
             clipped off the right edge rather than the name being shortened. */
          <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={robot?.name ?? undefined}>
                {robot?.name ?? "Robot"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {robot?.platform} · {host}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
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
              onClick={() => setStep("choose")}
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
