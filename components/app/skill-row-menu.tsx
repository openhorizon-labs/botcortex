"use client";

import { useState } from "react";
import { Check, Globe, GlobeLock, Loader2, MoreHorizontal, Play } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuAction } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * The hover menu on a skill row: run it, or put it on the public registry.
 *
 * Publishing is the owner's call and only ever offered for a skill that has
 * run (the api refuses otherwise, and so does this menu, with the reason).
 * State is read when the menu opens rather than kept in the provider: it
 * is one small request per open, and the sidebar never has to track a
 * flag that lives in the account, not on the robot.
 */
export function SkillRowMenu({
  name,
  platform,
  busy,
  unproven,
  onRun,
}: {
  name: string;
  platform: string | undefined;
  busy: boolean;
  unproven: boolean;
  onRun: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [published, setPublished] = useState<boolean | null>(null);
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function load() {
    if (!platform) return;
    try {
      const res = await fetch(`/api/skills?platform=${encodeURIComponent(platform)}`);
      if (!res.ok) return;
      const body = (await res.json()) as { skills?: { name: string; published?: boolean }[] };
      const row = body.skills?.find((skill) => skill.name === name);
      setPublished(row ? row.published === true : null);
    } catch {
      /* the menu still offers Run */
    }
  }

  async function toggle() {
    if (!platform || working) return;
    setWorking(true);
    setNote(null);
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(name)}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, published: !published }),
      });
      const body = (await res.json().catch(() => ({}))) as { published?: boolean; error?: string };
      if (!res.ok) {
        setNote(body.error ?? `Could not update the registry (${res.status}).`);
        return;
      }
      setPublished(body.published === true);
      setNote(body.published ? "Listed on the public registry." : "Removed from the public registry.");
    } catch {
      setNote("Could not reach the registry.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setNote(null);
          void load();
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <SidebarMenuAction
          showOnHover
          aria-label={`${name} — actions`}
          className="cursor-pointer group-data-[collapsible=icon]:hidden data-[state=open]:opacity-100"
        >
          <MoreHorizontal />
        </SidebarMenuAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="w-64">
        <DropdownMenuLabel className="font-mono text-xs font-normal text-muted-foreground">{name}</DropdownMenuLabel>
        <DropdownMenuItem disabled={busy} onSelect={onRun}>
          <Play /> {busy ? "Robot busy" : "Run"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={unproven || working || !platform || published === null}
          onSelect={(event) => {
            event.preventDefault();
            void toggle();
          }}
        >
          {working ? <Loader2 className="animate-spin" /> : published ? <GlobeLock /> : <Globe />}
          {published ? "Remove from public registry" : "Publish to public registry"}
        </DropdownMenuItem>
        <p className={cn("px-2 pt-1 pb-1.5 text-xs leading-relaxed text-muted-foreground", note && "text-foreground")}>
          {note
            ? note
            : unproven
              ? "Run it successfully first — the registry lists only skills that have run."
              : published === null
                ? "Checking the registry…"
                : published
                  ? "Anyone can read this skill at /skills."
                  : "Lists the program and its description, per arm, on the public /skills page."}
        </p>
        {note?.startsWith("Listed") && <Check className="sr-only" />}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
