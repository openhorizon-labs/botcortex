"use client";

import { useEffect, useState } from "react";
import { Check, KeyRound, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BYO_CHANGED,
  BYO_PROVIDERS,
  type ByoKey,
  type ByoProvider,
  clearByoKey,
  loadByoKey,
  maskKey,
  saveByoKey,
} from "@/lib/robot/byo-key";

/**
 * Settings → Model key: teach on your own OpenAI or Anthropic account.
 *
 * Says where the key goes, in the panel, in plain words — a field that takes
 * a secret owes the person typing it that much before they type it.
 */
export function ModelKeyPanel() {
  const [saved, setSaved] = useState<ByoKey | null>(null);
  const [provider, setProvider] = useState<ByoProvider>("openai");
  const [key, setKey] = useState("");
  const [model, setModel] = useState(BYO_PROVIDERS.openai.defaultModel);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    const read = () => {
      const current = loadByoKey();
      setSaved(current);
      if (current) {
        setProvider(current.provider);
        setModel(current.model);
      }
    };
    read();
    window.addEventListener(BYO_CHANGED, read);
    return () => window.removeEventListener(BYO_CHANGED, read);
  }, []);

  const pick = (next: ByoProvider) => {
    setProvider(next);
    // Follow the provider's default unless the owner typed a model of their own.
    if (!model.trim() || Object.values(BYO_PROVIDERS).some((p) => p.defaultModel === model)) {
      setModel(BYO_PROVIDERS[next].defaultModel);
    }
  };

  const save = () => {
    const secret = key.trim() || (saved?.provider === provider ? saved.key : "");
    if (!secret) return;
    saveByoKey({ provider, key: secret, model: model.trim() || BYO_PROVIDERS[provider].defaultModel });
    setKey("");
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1600);
  };

  const keepsSavedKey = saved?.provider === provider;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Model key</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Teach on your own OpenAI or Anthropic account instead of BotCortex credit. For robots
          simulated in this browser; a real robot uses the key in its own environment.
        </p>
      </div>

      {saved && (
        <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
          <KeyRound className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {BYO_PROVIDERS[saved.provider].label} · <span className="font-mono">{maskKey(saved.key)}</span>
            </p>
            <p className="break-words text-xs leading-relaxed text-muted-foreground">
              Teaching uses <span className="font-mono">{saved.model}</span>. Your BotCortex credit is not touched.
            </p>
          </div>
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={clearByoKey}>
            <Trash2 className="size-3.5" /> Remove
          </Button>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex gap-1 rounded-lg bg-surface-3 p-1">
          {(Object.keys(BYO_PROVIDERS) as ByoProvider[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => pick(id)}
              className={cn(
                "flex h-7 flex-1 cursor-pointer items-center justify-center rounded-md text-xs font-medium transition-colors",
                provider === id ? "border border-border bg-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {BYO_PROVIDERS[id].label}
            </button>
          ))}
        </div>
        <Input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          type="password"
          autoComplete="off"
          spellCheck={false}
          aria-label={`${BYO_PROVIDERS[provider].label} API key`}
          placeholder={keepsSavedKey ? "Leave blank to keep the saved key" : BYO_PROVIDERS[provider].keyHint}
        />
        <Input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          spellCheck={false}
          aria-label="Model"
          placeholder={BYO_PROVIDERS[provider].defaultModel}
          className="font-mono text-sm"
        />
        <Button onClick={save} disabled={!key.trim() && !keepsSavedKey} className="h-9 gap-1.5 rounded-lg">
          {justSaved && <Check className="size-3.5" />}
          {justSaved ? "Saved" : saved ? "Update" : "Save key"}
        </Button>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        The key is stored in this browser only and is sent straight from this tab to{" "}
        {BYO_PROVIDERS[provider].label}. It is never sent to BotCortex. Like any key kept in a
        browser, a script running on this page could read it, so use one you can revoke, with a
        spending limit.
      </p>
    </div>
  );
}
