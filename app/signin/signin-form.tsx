"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { signInDestination } from "@/lib/auth-redirect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Only ever an in-app path — an absolute URL here would make this an open
  // redirect, and the value arrives from the query string.
  const destination = signInDestination(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? "Sign-in failed — check your credentials.");
        return;
      }
      router.push(destination);
    } catch {
      setError("Could not reach BotCortex. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="mt-8 flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) submit();
      }}
    >
      <Input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@lab.dev"
        type="email"
        aria-label="Email"
        autoComplete="email"
        className="h-11"
        autoFocus
      />
      <Input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        type="password"
        aria-label="Password"
        autoComplete="current-password"
        className="h-11"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button
        type="submit"
        disabled={busy || !email || !password}
        className="h-11 gap-1.5 rounded-lg"
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        Sign in
      </Button>
    </form>
  );
}
