"use client";

import { ArrowUp, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModelPicker } from "@/components/app/model-picker";
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
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  dryRun: boolean;
  onDryRunChange: (dryRun: boolean) => void;
  model: string | null;
  onModelChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[16px] border border-border bg-surface-2 transition-colors focus-within:border-border-strong",
        className,
      )}
    >
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder='Teach it: "sort the red parts into the left bin"'
        className="min-h-9 resize-none border-0 bg-transparent px-4 pt-3.5 text-[15px] shadow-none focus-visible:ring-0"
        rows={1}
      />
      <div className="flex items-center justify-between px-2.5 pb-2 pt-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <ModelPicker value={model} onChange={onModelChange} />
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
          <CreditReadout />
        </div>
        <Button
          size="icon"
          disabled={!value.trim()}
          onClick={onSend}
          className="size-7 rounded-full"
          aria-label="Send"
        >
          <ArrowUp className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * The balance, beside the thing that spends it.
 *
 * It lives in the sidebar too, but the sidebar collapses to a 16px icon rail
 * — and there the figure is not shortened, it is GONE, leaving a coin icon
 * that says nothing. Reported, reasonably, as "credit is not visible". A rail
 * that narrow cannot hold a currency figure at all, so the readout belongs
 * where it is always on screen and where it is actually relevant: next to the
 * model picker, in the row that chooses what the next teach will cost.
 *
 * Hidden entirely unless the connected robot can spend it — the same reason
 * the sidebar row hides the number for an unpaired robot. A balance shown
 * beside a Send button implies pressing it draws down that balance.
 */
function CreditReadout() {
  const { credit, pairing } = useRobot();
  if (!credit || pairing !== "paired") return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* "left", not a bare figure. Unlabelled beside a Send button it read
            as the price of this task; the sidebar shows used/total and
            Settings shows both, so this is the third rendering of one number
            and the only one that had no word attached. */}
        <span className="hidden h-6 shrink-0 items-center gap-1 rounded-full px-1.5 text-xs text-muted-foreground sm:flex">
          <span className="font-mono">{credit.display}</span>
          <span className="opacity-70">left</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {credit.display} of BotCortex credit left · {credit.spentDisplay} used
        so far. Teaching spends it; skills already learned run free.
      </TooltipContent>
    </Tooltip>
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
