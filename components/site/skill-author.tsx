"use client";

/**
 * "@sai", with a card about them on hover.
 *
 * The card holds only what the registry publishes about an author: the name
 * they signed up with, when they joined, and what they have on the public
 * registry. There is no profile page behind it, so the handle is a button, not
 * a link to nowhere.
 *
 * A hover card alone is invisible on a phone — there is no hover — so the
 * handle also opens it on tap and on keyboard focus.
 */
import { useState } from "react";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { SkillAuthor as Author } from "@/lib/registry";
import { bodyFor, shortBodyName } from "@/lib/robot/bodies";

const joined = (ms: number) => new Date(ms).toLocaleDateString("en", { month: "long", year: "numeric" });

export function SkillAuthor({ author }: { author: Author }) {
  const [open, setOpen] = useState(false);
  const arms = author.platforms.map((platform) => shortBodyName(bodyFor(platform).displayName));
  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          className="rounded font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          @{author.handle}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-72 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-3 text-sm font-medium uppercase"
          >
            {[...author.name.trim()][0] ?? "?"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{author.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              @{author.handle} · joined {joined(author.joinedAt)}
            </p>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs">
          <div>
            <dt className="text-muted-foreground">Published skills</dt>
            <dd className="mt-0.5 text-base font-medium tabular-nums">{author.skills}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Robots taught</dt>
            <dd className="mt-0.5 text-base font-medium tabular-nums">{author.platforms.length}</dd>
          </div>
        </dl>
        {arms.length > 0 && <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground">{arms.join(" · ")}</p>}
      </HoverCardContent>
    </HoverCard>
  );
}
