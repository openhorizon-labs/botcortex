"use client";

import { useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PublishedSkill } from "@/lib/registry";

/** One published skill: the name as the robot knows it, what it does, when
 *  it was last proven, and the program behind a fold. Grayscale, hairlines,
 *  the same card grammar as the rest of the site. */
export function SkillCard({ skill }: { skill: PublishedSkill }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const when = new Date(skill.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const lines = skill.code.split("\n").length;

  return (
    <article className="min-w-0 rounded-2xl border border-border bg-background transition-colors duration-150 ease-standard hover:border-border-strong">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-4 p-4 text-left sm:p-5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="font-mono text-[15px] font-medium text-foreground">{skill.name}</h3>
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-2 py-0.5 text-xs text-foreground/80">
              <Check className="size-3" /> ran on this arm
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{skill.description}</p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {lines} lines · proven {when}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-standard",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="border-t border-border">
          <div className="flex items-center justify-between px-4 py-2 sm:px-5">
            <span className="font-mono text-xs text-muted-foreground">{skill.name}.py</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(skill.code).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }, () => {});
              }}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors duration-150 ease-standard hover:bg-surface-3 hover:text-foreground"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="overflow-x-auto rounded-b-2xl bg-surface-3 px-4 py-4 sm:px-5">
            <pre className="font-mono text-[12.5px] leading-[1.6] text-foreground/90">
              <code>{skill.code}</code>
            </pre>
          </div>
        </div>
      )}
    </article>
  );
}
