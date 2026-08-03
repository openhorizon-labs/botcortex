"use client";

/**
 * Robot keys — where an owner mints the credential their robot uses to reach
 * a model through BotCortex credits.
 *
 * The agent runs on the robot; this key is what lets it call a model without
 * the owner holding a vendor account. Minting shows the key exactly once,
 * because only its hash is stored.
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RobotKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface-3 px-3 py-2 font-mono text-xs">
        {value}
      </code>
      <Button
        variant="outline"
        size="icon"
        className="shrink-0 cursor-pointer"
        aria-label="Copy"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}

export function RobotKeysPanel() {
  const [keys, setKeys] = useState<RobotKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [minting, setMinting] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** The one and only moment this value exists outside the robot. */
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/keys");
      if (!res.ok) throw new Error("Could not load your keys.");
      setKeys((await res.json()).keys);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function mint() {
    setMinting(true);
    setError(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "My robot" }),
      });
      if (!res.ok) throw new Error("Could not create a key.");
      const created = await res.json();
      setFreshKey(created.key);
      setName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setMinting(false);
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    await load();
  }

  const live = keys.filter((k) => !k.revokedAt);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Robot access</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          A key your robot uses to reach BotCortex and spend your credit.
          Running{" "}
          <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-xs">
            botcortex login
          </code>{" "}
          mints one for you — this is the manual route, and where you revoke.
          Paired robots themselves are listed in the switcher at the top of the
          sidebar.
        </p>
      </div>

        {freshKey && (
          <div className="space-y-2.5 rounded-lg border border-border bg-surface-2 p-3">
            <p className="text-sm font-medium">Copy this now — it won&apos;t be shown again.</p>
            <CopyField value={freshKey} />
            <p className="text-xs text-muted-foreground">
              On the robot, add it to{" "}
              <code className="rounded bg-surface-3 px-1 py-0.5 font-mono">.env</code>{" "}
              beside the runtime:
            </p>
            <CopyField value={`BOTCORTEX_API_KEY=${freshKey}`} />
          </div>
        )}

        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name this robot — Thor rig, bench arm, sim"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !minting) void mint();
            }}
          />
          <Button onClick={mint} disabled={minting} className="cursor-pointer shrink-0">
            {minting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            New key
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="space-y-1.5">
          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
          ) : live.length === 0 ? (
            <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <KeyRound className="size-4" /> No keys yet.
            </p>
          ) : (
            live.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{key.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {key.prefix}…{" "}
                    {key.lastUsedAt
                      ? `· last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                      : "· never used"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="cursor-pointer text-muted-foreground hover:text-destructive"
                  aria-label={`Revoke ${key.name}`}
                  onClick={() => revoke(key.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))
          )}
      </div>
    </div>
  );
}
