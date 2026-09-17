"use client";

import { useEffect, useState } from "react";
import { ArrowUp, KeyRound, ShieldCheck, Square } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModelPicker } from "@/components/app/model-picker";
import { BYO_CHANGED, type ByoKey, loadByoKey } from "@/lib/robot/byo-key";
import { useRobot } from "@/components/app/robot-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function Composer({
  value,
  onChange,
  onSend,
  dryRun,
  onDryRunChange,
  model,
  onModelChange,
  onNeedRobot,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  dryRun: boolean;
  onDryRunChange: (dryRun: boolean) => void;
  model: string | null;
  onModelChange: (id: string) => void;
  /** Called instead of anything else while no robot is connected: the
   *  owner cannot type to nobody, so touching the box asks for a robot. */
  onNeedRobot?: () => void;
  className?: string;
}) {
  const { activity, stopped, status, interrupt, interruptible, host } = useRobot();
  // Read after mount (localStorage does not exist on the server) and again
  // whenever Settings saves or removes it.
  const [ownKey, setOwnKey] = useState<ByoKey | null>(null);
  useEffect(() => {
    const read = () => setOwnKey(loadByoKey());
    read();
    window.addEventListener(BYO_CHANGED, read);
    return () => window.removeEventListener(BYO_CHANGED, read);
  }, []);
  const connected = status === "connected";
  const blocked = stopped || activity.startsWith("teaching") || activity.startsWith("running");
  const needRobot = () => {
    if (!connected) onNeedRobot?.();
  };
  return (
    <div
      className={cn(
        "rounded-[16px] border border-border bg-surface-2 transition-colors focus-within:border-border-strong",
        className,
      )}
    >
      <Textarea
        value={connected ? value : ""}
        readOnly={!connected}
        onChange={(e) => onChange(e.target.value)}
        onFocus={needRobot}
        onMouseDown={(e) => {
          if (!connected) {
            e.preventDefault();
            needRobot();
          }
        }}
        onKeyDown={(e) => {
          if (!connected) {
            e.preventDefault();
            needRobot();
            return;
          }
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (!blocked) onSend();
          }
        }}
        placeholder={connected ? 'Teach it: "sort the red parts into the left bin"' : "Connect a robot to start teaching"}
        aria-label="Describe a robot task"
        className="min-h-9 resize-none border-0 bg-transparent px-4 pt-3.5 text-[15px] shadow-none focus-visible:ring-0"
        rows={1}
      />
      <div className="flex items-center justify-between px-2.5 pb-2 pt-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {/* With the owner's own key saved, the picker would be a lie: it
              lists the models BotCortex credit buys, and none of them is what
              will run. Only for the in-tab robot — a real one teaches with the
              key in its own environment and never reads this. */}
          {ownKey && host === "this browser" ? (
            <span
              className="flex h-7 min-w-0 items-center gap-1.5 rounded-lg border border-border px-2 text-xs text-muted-foreground"
              title="Teaching uses your own key. Change it in Settings, under Model key."
            >
              <KeyRound className="size-3.5 shrink-0" />
              <span className="truncate">
                Your key · <span className="font-mono">{ownKey.model}</span>
              </span>
            </span>
          ) : (
            <ModelPicker value={model} onChange={onModelChange} />
          )}
          {/* A STATE, not a switch.
              This was a Dry run / Execute toggle whose tooltip promised that
              dry run "previews every step without moving the arms". It did no
              such thing: `dryRun` rides the wire (protocol.ts) and NO backend
              reads it — not server.py, not the browser transport — so both
              positions moved the arm, and a UX review confirmed it by teaching
              in each. A safety control that lies is worse than none, and the
              label would be the most dangerous string in the app the day
              hardware lands.
              Every v0 backend is a simulation twin (`--execute` still exits
              with "real hardware lands at milestone 3"), so the honest thing
              to show is what is true. The dryRun plumbing is deliberately left
              in place for when the hardware path arrives and can honour it. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex h-6 items-center gap-1 rounded-full border border-border bg-background px-2.5 text-xs text-muted-foreground">
                <ShieldCheck className="size-3" />
                Simulation
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Every robot BotCortex drives today is a simulation twin — in this
              tab, or MuJoCo on the machine running the runtime. Moving real
              hardware will need an operator present, and is not wired yet.
            </TooltipContent>
          </Tooltip>
          <RanOnNotice />
        </div>
        {/* While the agent is working this IS the stop button, the way it is
            in every chat the owner already uses. Not the red STOP in the
            header: that is the e-stop and it latches, which is right for "the
            arm is about to hit something" and far too heavy for "not that
            task". This one leaves the robot idle and ready. */}
        {interruptible ? (
          <Button
            size="icon"
            variant="outline"
            onClick={() => interrupt()}
            className="size-7 rounded-full"
            aria-label="Stop the robot's current task"
            title="Stop this task"
          >
            <Square className="size-3 fill-current" />
          </Button>
        ) : (
          <Button
            size="icon"
            disabled={connected ? !value.trim() || blocked : false}
            onClick={connected ? onSend : needRobot}
            className="size-7 rounded-full"
            aria-label="Send"
          >
            <ArrowUp className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Says which model the last teach ACTUALLY ran on — but only when that differs
 * from the one selected.
 *
 * The robot echoes the model back precisely because it is what the account was
 * billed for, and the client used to drop that message on the floor. An owner
 * who picked an expensive model and was served a different one had no way to
 * find out. Silent when they agree, because then it is noise.
 */
function RanOnNotice() {
  const { ranModel, model } = useRobot();
  if (!ranModel || !model || ranModel === model) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="hidden h-6 shrink-0 items-center rounded-full border border-border px-2 font-mono text-[11px] text-muted-foreground sm:flex">
          ran on {ranModel}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        The last teach ran on {ranModel}, not the model selected here — and that
        is what your credit paid for.
      </TooltipContent>
    </Tooltip>
  );
}
