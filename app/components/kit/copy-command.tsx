"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** Click-to-copy install line. The one interaction every dev tries first. */
export function CopyCommand({
  command,
  className,
}: {
  command: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(command).then(
          () => setCopied(true),
          () => {},
        );
      }}
      aria-label={`Copy: ${command}`}
      className={cn(
        "group inline-flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-3.5 py-2.5",
        "transition-colors duration-150 ease-standard hover:border-border-strong hover:bg-surface-2",
        className,
      )}
    >
      <span className="select-none font-mono text-xs text-muted-foreground">$</span>
      <span className="font-mono text-[13px] text-foreground">{command}</span>
      <span className="relative ml-1 grid size-4 place-items-center">
        <Copy
          className={cn(
            "absolute size-3.5 text-muted-foreground transition-all duration-150 ease-standard",
            "group-hover:text-foreground",
            copied ? "scale-75 opacity-0" : "scale-100 opacity-100",
          )}
        />
        <Check
          className={cn(
            "absolute size-3.5 text-runner-primitive transition-all duration-150 ease-standard",
            copied ? "scale-100 opacity-100" : "scale-75 opacity-0",
          )}
        />
      </span>
    </button>
  );
}
