"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { signInDestination } from "@/lib/auth-redirect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Better Auth's own minimum. Saying it up front beats a server round-trip
 *  that comes back to tell you the same thing. */
const MIN_PASSWORD = 8;

export function SignUpForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Only ever an in-app path — an absolute URL here would make this an open
  // redirect, and the value arrives from the query string.
  const destination = signInDestination(params.get("next"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const short = password.length > 0 && password.length < MIN_PASSWORD;
  const ready = name.trim() && email.trim() && password.length >= MIN_PASSWORD;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      // Sign-up returns a session cookie, so there is no second sign-in step.
      const result = await authClient.signUp.email({
        email: email.trim(),
        password,
        name: name.trim(),
      });
      if (result.error) {
        setError(result.error.message ?? "Could not create the account.");
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
        if (!busy && ready) submit();
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        aria-label="Name"
        autoComplete="name"
        className="h-11"
        autoFocus
      />
      <Input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@lab.dev"
        type="email"
        aria-label="Email"
        autoComplete="email"
        className="h-11"
      />
      <Input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={`Password — at least ${MIN_PASSWORD} characters`}
        type="password"
        aria-label="Password"
        autoComplete="new-password"
        className="h-11"
      />
      {/* The length rule is the one people hit, and hearing it from the server
          after a round-trip reads as a rejection rather than a rule. */}
      {short && !error && (
        <p className="text-xs text-muted-foreground">
          {MIN_PASSWORD - password.length} more character
          {MIN_PASSWORD - password.length === 1 ? "" : "s"} to go.
        </p>
      )}
      {error && <p className="break-words text-xs text-destructive">{error}</p>}
      <Button type="submit" disabled={busy || !ready} className="h-11 gap-1.5 rounded-lg">
        {busy && <Loader2 className="size-4 animate-spin" />}
        Create account
      </Button>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        You get a simulated robot in the browser straight away, no hardware
        needed, and $2.00 of credit to teach it with. Or bring your own OpenAI
        or Anthropic key.
      </p>
    </form>
  );
}
