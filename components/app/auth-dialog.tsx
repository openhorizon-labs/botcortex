"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { signIn, signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AuthDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const result =
      mode === "signin"
        ? await signIn.email({ email, password })
        : await signUp.email({ name: name || email.split("@")[0], email, password });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "Something went wrong.");
      return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {mode === "signin" ? "Sign in" : "Create your account"}
          </DialogTitle>
          <DialogDescription>
            Your robots, skills, and task history stay attached to your account.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {mode === "signup" && (
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              autoComplete="name"
            />
          )}
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@lab.dev"
            type="email"
            autoComplete="email"
            autoFocus
          />
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            onKeyDown={(e) => e.key === "Enter" && !busy && submit()}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {mode === "signin"
              ? "New here? Create an account"
              : "Already have an account? Sign in"}
          </button>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={busy || !email || !password} className="gap-1.5">
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
