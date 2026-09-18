"use client";

import { useState } from "react";
import { Check, Globe, Loader2, MoreHorizontal, Play, Trash2 } from "lucide-react";
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
 * The hover menu on a skill row: run it, see where it stands on the public
 * registry, and delete it while it is still a draft.
 *
 * Publishing is automatic and not reversible here. A skill joins the registry
 * the first time it is proven, and taking one down is a paid capability, so
 * the control is shown disabled rather than hidden: an owner should be able
 * to see that the choice exists and is not theirs yet, which a missing menu
 * item cannot say. The api refuses the same thing with the same reason, so
 * this is not a lock that a curl gets past.
 *
 * Delete follows the same line. A skill that has never been seen to work is
 * the owner's to throw away — it is what a failed teach leaves behind. A
 * proven one is published, and deleting it would be the withdrawal the
 * publish menu refuses, under another name. The robot decides (the rule is
 * the runtime's) and answers in chat; the item is disabled here only so the
 * button does not lie about what will happen.
 *
 * State is read when the menu opens rather than kept in the provider: it is
 * one small request per open, and the sidebar never has to track a flag that
 * lives in the account, not on the robot.
 */
export function SkillRowMenu({
  name,
  platform,
  busy,
  unproven,
  onRun,
  onDelete,
}: {
  name: string;
  platform: string | undefined;
  busy: boolean;
  unproven: boolean;
  onRun: () => void;
  onDelete: () => void;
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

  /** Only ever puts a skill BACK. A re-taught skill is unlisted by the
   *  runtime until its new version runs; this is the manual nudge for that
   *  case. Withdrawing is refused by the api. */
  async function relist() {
    if (!platform || working || published) return;
    setWorking(true);
    setNote(null);
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(name)}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, published: true }),
      });
      const body = (await res.json().catch(() => ({}))) as { published?: boolean; error?: string };
      if (!res.ok) {
        setNote(body.error ?? `Could not update the registry (${res.status}).`);
        return;
      }
      setPublished(body.published === true);
      setNote("Listed on the public registry.");
    } catch {
      setNote("Could not reach the registry.");
    } finally {
      setWorking(false);
    }
  }

  // Only a draft can go. Busy is refused by the robot too; disabling here
  // just keeps the item honest about what pressing it would do.
  const deletable = unproven && !busy;

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
        <DropdownMenuLabel className="break-all font-mono text-xs font-normal text-muted-foreground">{name}</DropdownMenuLabel>
        <DropdownMenuItem disabled={busy} onSelect={onRun}>
          <Play /> {busy ? "Robot busy" : "Run"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={published === true || unproven || working || !platform || published === null}
          onSelect={(event) => {
            event.preventDefault();
            void relist();
          }}
        >
          {working ? <Loader2 className="animate-spin" /> : <Globe />}
          {published ? "Remove from public registry" : "Put back on public registry"}
        </DropdownMenuItem>
        {/* Not styled as destructive: red is STOP's, and this is a draft
            going in the bin, not an arm being halted. */}
        <DropdownMenuItem disabled={!deletable} onSelect={onDelete}>
          <Trash2 /> {busy ? "Robot busy" : "Delete"}
        </DropdownMenuItem>
        <p className={cn("px-2 pt-1 pb-1.5 text-xs leading-relaxed text-muted-foreground", note && "text-foreground")}>
          {note
            ? note
            : unproven
              ? "Never seen to work, so it can be deleted. Run it successfully and it joins the public registry on its own — and stays."
              : published === null
                ? "Checking the registry…"
                : published
                  ? "Listed on the public registry at /skills, as every proven skill is. Taking one down, or deleting it, comes with a paid plan."
                  : "Unlisted until this version runs. Run it, or put it back now."}
        </p>
        {note?.startsWith("Listed") && <Check className="sr-only" />}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
