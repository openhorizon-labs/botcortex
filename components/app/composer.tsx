"use client";

import { ArrowUp, Plus, ShieldCheck, SlashSquare, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  dryRun: boolean;
  onDryRunChange: (dryRun: boolean) => void;
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
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            aria-label="Add context"
          >
            <Plus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            aria-label="Commands"
          >
            <SlashSquare className="size-4" />
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onDryRunChange(!dryRun)}
                className={cn(
                  "ml-1 flex h-6 items-center gap-1 rounded-full px-2.5 text-xs transition-colors",
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
