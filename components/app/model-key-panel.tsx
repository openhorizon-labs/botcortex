"use client";

/**
 * Settings -> Model key: teach on your own OpenAI or Anthropic account.
 *
 * One field. Which provider the key is for is read off the key, and which
 * model to use is ours to choose well — asking for either was asking the owner
 * to do our job. The panel says where the key goes before it is typed, because
 * a field that takes a secret owes the person typing it that much.
 */
import { useEffect, useState } from "react";
import { Check, KeyRound, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ANTHROPIC_MODEL_LABEL,
  PROVIDER_LABEL,
  forgetLegacyKey,
  removeModelKey,
  saveModelKey,
  useModelKey,
} from "@/lib/robot/model-key";

export function ModelKeyPanel() {
  const { key: saved, loaded } = useModelKey();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [hadLegacy, setHadLegacy] = useState(false);
  useEffect(() => { setHadLegacy(forgetLegacyKey()); }, []);

  async function save() {
    setBusy("save");
    setNote(null);
    const outcome = await saveModelKey(value);
    setBusy(null);
    if (!outcome.ok) {
      setNote({ text: outcome.error, bad: true });
      return;
    }
    // Gone from this page the moment it is safe on the server.
    setValue("");
    setNote({
      text: outcome.verified
        ? `${PROVIDER_LABEL[outcome.key.provider]} accepted the key. Teaching now uses it.`
        : `Saved. ${PROVIDER_LABEL[outcome.key.provider]} could not be reached to check it, so the first teach will tell.`,
      bad: false,
    });
  }

  async function remove() {
    setBusy("remove");
    setNote(null);
    const removed = await removeModelKey();
    setBusy(null);
    setNote(removed ? { text: "Removed. Teaching uses BotCortex credit again.", bad: false } : { text: "Could not remove the key. Try again.", bad: true });
  }

  return (
    <div className="min-w-0 space-y-4">
      <div>
        <h3 className="text-sm font-medium">Model key</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Teach on your own OpenAI or Anthropic account instead of BotCortex credit. Your provider bills you
          directly, and your BotCortex balance is never touched or checked.
        </p>
      </div>

      {saved && (
        <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border p-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-3">
            <KeyRound className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {PROVIDER_LABEL[saved.provider]} key <span className="font-mono text-muted-foreground">…{saved.last4}</span>
            </p>
            <p className="break-words text-xs leading-relaxed text-muted-foreground">
              {saved.provider === "anthropic"
                ? `Teaching runs on ${ANTHROPIC_MODEL_LABEL}.`
                : "Teaching runs on the model you pick in the composer."}
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5" disabled={busy !== null} onClick={() => void remove()}>
            {busy === "remove" ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Remove
          </Button>
        </div>
      )}

      <form
        className="flex min-w-0 flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim() && !busy) void save();
        }}
      >
        <Input
          value={value}
          onChange={(e) => { setValue(e.target.value); setNote(null); }}
          type="password"
          aria-label="API key"
          placeholder={saved ? "Paste a different key to replace it" : "Paste your OpenAI or Anthropic API key"}
          autoComplete="off"
          spellCheck={false}
          disabled={!loaded}
          className="h-10 min-w-0 flex-1 font-mono text-sm"
        />
        <Button type="submit" className="h-10 gap-1.5" disabled={!value.trim() || busy !== null}>
          {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save key
        </Button>
      </form>
      {note && <p className={`break-words text-xs ${note.bad ? "text-destructive" : "text-muted-foreground"}`}>{note.text}</p>}

      <p className="break-words text-xs leading-relaxed text-muted-foreground">
        The key is sent to BotCortex once, encrypted, and used only to make your teaching calls. It is never sent
        back to this or any browser: after saving, all anyone can see here is the provider and the last four
        characters. Remove it at any time and it is deleted.
      </p>
      {hadLegacy && (
        <p className="break-words text-xs leading-relaxed text-muted-foreground">
          An older version kept a key in this browser. That copy has been deleted; paste the key above to keep using it.
        </p>
      )}
    </div>
  );
}
