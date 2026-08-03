"use client";

/**
 * The pairing approval screen.
 *
 * A robot ran `botcortex login` and is waiting. The owner lands here — signed
 * in already, which is the entire point of the device flow — types the short
 * code, sees WHICH robot is asking, and approves.
 *
 * The order matters: Better Auth requires GET /device?user_code=… from a
 * signed-in session to claim the code before approve or deny will work.
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Cpu, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PendingRobot {
  name: string;
  platform: string;
  arms: number;
}

type Phase = "entering" | "confirming" | "approved" | "denied";

export function DeviceForm() {
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("entering");
  const [robot, setRobot] = useState<PendingRobot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Claim the code against this session, then find out what it belongs to. */
  const lookup = useCallback(async (raw: string) => {
    const userCode = raw.trim().toUpperCase();
    if (!userCode) return;
    setBusy(true);
    setError(null);
    try {
      const claim = await fetch(
        `/api/auth/device?user_code=${encodeURIComponent(userCode)}`,
      );
      if (!claim.ok) {
        setError("That code isn't valid, or it has expired. Check the robot's terminal.");
        return;
      }
      const pending = await fetch(
        `/api/device/pending?user_code=${encodeURIComponent(userCode)}`,
      );
      setRobot(pending.ok ? (await pending.json()).robot : null);
      setCode(userCode);
      setPhase("confirming");
    } catch {
      setError("Could not reach BotCortex. Check your connection.");
    } finally {
      setBusy(false);
    }
  }, []);

  // The robot prints a URL with the code already in it, so most owners never
  // type anything — they just confirm.
  useEffect(() => {
    const fromUrl = params.get("user_code");
    if (fromUrl) void lookup(fromUrl);
  }, [params, lookup]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/device/${approve ? "approve" : "deny"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode: code }),
      });
      if (!res.ok) {
        setError("That didn't go through — the code may have expired.");
        return;
      }
      setPhase(approve ? "approved" : "denied");
    } finally {
      setBusy(false);
    }
  }

  if (phase === "approved") {
    return (
      <Done
        icon={<Check className="size-5" />}
        title={robot ? `${robot.name} is paired` : "Robot paired"}
        body="Its terminal should now show a confirmation. You can close this tab."
      />
    );
  }

  if (phase === "denied") {
    return (
      <Done
        icon={<X className="size-5" />}
        title="Pairing denied"
        body="Nothing was granted. If that wasn't you, no action is needed — the request expires on its own."
      />
    );
  }

  if (phase === "confirming") {
    return (
      <div className="mt-8">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
            <Cpu className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{robot?.name ?? "A robot"}</p>
            <p className="truncate text-sm text-muted-foreground">
              {robot ? `${robot.platform} · ${robot.arms} arms` : "identity not reported"}
            </p>
          </div>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          Approving lets this robot author skills using your BotCortex credits.
          It never gains access to your password or your account.
        </p>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-5 flex gap-2">
          <Button onClick={() => decide(true)} disabled={busy} className="flex-1 cursor-pointer">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Approve
          </Button>
          <Button
            variant="outline"
            onClick={() => decide(false)}
            disabled={busy}
            className="cursor-pointer"
          >
            Deny
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="mt-8 flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void lookup(code);
      }}
    >
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="XXXXXXXX"
        autoFocus
        autoComplete="off"
        spellCheck={false}
        className="text-center font-mono text-lg tracking-[0.3em]"
        aria-label="Pairing code"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy || !code.trim()} className="cursor-pointer">
        {busy && <Loader2 className="size-4 animate-spin" />}
        Continue
      </Button>
    </form>
  );
}

function Done({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="mt-8 flex flex-col items-center text-center">
      <div className="flex size-11 items-center justify-center rounded-full border border-border">
        {icon}
      </div>
      <p className="mt-4 font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
