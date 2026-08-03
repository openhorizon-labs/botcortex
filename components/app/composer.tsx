"use client";

import { ArrowUp, ShieldCheck, Zap } from "lucide-react";

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
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onDryRunChange(!dryRun)}
                className={cn(
                  "flex h-6 cursor-pointer items-center gap-1 rounded-full px-2.5 text-xs transition-colors",
                  dryRun
                    ? "border border-border bg-background text-muted-foreground hover:text-foreground"
                    : "bg-primary text-primary-foreground",
                )}
                aria-pressed={!dryRun}
              >
                {dryRun ? (
                  <ShieldCheck className="size-3" />
                ) : (
                  <Zap className="size-3" />
                )}
                {dryRun ? "Dry run" : "Execute"}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              Dry run previews every step without moving the arms. Real
              execution needs an operator present.
            </TooltipContent>
          </Tooltip>
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
        <span className="hidden h-6 shrink-0 items-center rounded-full px-1.5 font-mono text-xs text-muted-foreground sm:flex">
          {credit.display}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {credit.display} of BotCortex credit left · {credit.spentDisplay} used
        so far. Teaching spends it; skills already learned run free.
      </TooltipContent>
    </Tooltip>
  );
}
