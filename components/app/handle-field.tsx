"use client";

/**
 * The handle skills are published under: "@sai".
 *
 * Nobody is asked to choose one. The api makes it from the name the first time
 * it is needed; this is where it can be changed. It is public and it is in the
 * address of the owner's page, which is why the rules are shown before the
 * server has to refuse anything.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const RULE = /^[a-z0-9_]{3,24}$/;

export function HandleField() {
  const [saved, setSaved] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { handle?: string } | null) => {
        if (!live || !body?.handle) return;
        setSaved(body.handle);
        setValue(body.handle);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const wanted = value.trim().toLowerCase().replace(/^@/, "");
  const changed = saved !== null && wanted !== saved;
  const valid = RULE.test(wanted);

  async function save() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: wanted }),
      });
      const body = (await res.json().catch(() => ({}))) as { handle?: string; error?: string };
      if (!res.ok || !body.handle) {
        setNote({ text: body.error ?? "Could not save the handle.", bad: true });
        return;
      }
      setSaved(body.handle);
      setValue(body.handle);
      setNote({ text: "Saved. Your published skills now show this handle.", bad: false });
    } catch {
      setNote({ text: "Could not reach BotCortex. Try again.", bad: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0">
      <h3 className="text-sm font-medium">Public handle</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Skills that run successfully are published under this name, with a page of everything you have taught.
        Your email is never shown.
      </p>
      <form
        className="mt-3 flex min-w-0 flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed && valid && !busy) void save();
        }}
      >
        <div className="flex min-w-0 flex-1 items-center rounded-lg border border-border pl-3 focus-within:border-foreground">
          <span className="text-sm text-muted-foreground">@</span>
          <Input
            value={value}
            onChange={(e) => { setValue(e.target.value); setNote(null); }}
            aria-label="Public handle"
            placeholder={saved === null ? "loading…" : "handle"}
            disabled={saved === null}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={25}
            className="h-9 min-w-0 border-0 px-1 shadow-none focus-visible:ring-0"
          />
        </div>
        <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={!changed || !valid || busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
        </Button>
      </form>
      <p className={`mt-2 break-words text-xs ${note?.bad || (changed && !valid) ? "text-destructive" : "text-muted-foreground"}`}>
        {note?.text ??
          (changed && !valid
            ? "3 to 24 characters: lowercase letters, numbers and underscores."
            : saved && (
                <>
                  Your page:{" "}
                  <Link href={`/u/${saved}`} className="underline underline-offset-2 hover:text-foreground">
                    /u/{saved}
                  </Link>{" "}
                  (appears once you have published a skill)
                </>
              ))}
      </p>
    </div>
  );
}
