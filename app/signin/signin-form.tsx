"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Only ever an in-app path — an absolute URL here would make this an open
  // redirect, and the value arrives from the query string.
  const nextParam = params.get("next");
  const destination = nextParam?.startsWith("/") && !nextParam.startsWith("//")
    ? nextParam
    : "/app";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await authClient.signIn.email({ email, password });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "Sign-in failed — check your credentials.");
      return;
    }
    router.push(destination);
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
        autoComplete="email"
        className="h-11"
        autoFocus
      />
      <Input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        type="password"
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
