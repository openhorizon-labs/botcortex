"use client";

import { useState } from "react";
import { Check, Globe, Loader2, MoreHorizontal, Play } from "lucide-react";
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
 * The hover menu on a skill row: run it, and see where it stands on the
 * public registry.
 *
 * Publishing is automatic and not reversible here. A skill joins the registry
 * the first time it runs, and taking one down is a paid capability, so the
 * control is shown disabled rather than hidden: an owner should be able to
 * see that the choice exists and is not theirs yet, which a missing menu item
 * cannot say. The api refuses the same thing with the same reason, so this is
 * not a lock that a curl gets past.
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
          disabled={published === true || unproven || working || !platform || published === null}
          onSelect={(event) => {
            event.preventDefault();
            void relist();
          }}
        >
          {working ? <Loader2 className="animate-spin" /> : <Globe />}
          {published ? "Remove from public registry" : "Put back on public registry"}
        </DropdownMenuItem>
        <p className={cn("px-2 pt-1 pb-1.5 text-xs leading-relaxed text-muted-foreground", note && "text-foreground")}>
          {note
            ? note
            : unproven
              ? "Run it successfully first — it joins the public registry on its own once it has."
              : published === null
                ? "Checking the registry…"
                : published
                  ? "Listed on the public registry at /skills, as every successful skill is. Taking one down comes with a paid plan."
                  : "Unlisted until this version runs. Run it, or put it back now."}
        </p>
        {note?.startsWith("Listed") && <Check className="sr-only" />}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
