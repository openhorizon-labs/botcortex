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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RobotKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface Credit {
  balanceMicros: number;
  spentMicros: number;
  grantedMicros: number;
  display: string;
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
        className="cursor-pointer"
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

export function RobotKeysDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [keys, setKeys] = useState<RobotKey[]>([]);
  const [credit, setCredit] = useState<Credit | null>(null);
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
      const [keysRes, creditRes] = await Promise.all([
        fetch("/api/keys"),
        fetch("/api/credits"),
      ]);
      if (!keysRes.ok) throw new Error("Could not load your keys.");
      setKeys((await keysRes.json()).keys);
      if (creditRes.ok) setCredit(await creditRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
    else setFreshKey(null);
  }, [open, load]);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Robot keys</DialogTitle>
          <DialogDescription>
            A key lets your robot use BotCortex credits to author new skills.
            Skills it has already learned keep running without one.
          </DialogDescription>
        </DialogHeader>

        {credit && (
          <div className="flex items-baseline justify-between rounded-lg border border-border bg-surface-2 px-3 py-2.5">
            <span className="text-sm text-muted-foreground">Credit remaining</span>
            <span className="font-mono text-sm font-medium">{credit.display}</span>
          </div>
        )}

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
      </DialogContent>
    </Dialog>
  );
}
