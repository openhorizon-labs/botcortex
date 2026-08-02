"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Waitlist card — we're validating demand before opening the doors. */
export function SignupCard() {
  const [email, setEmail] = useState("");
  const [robot, setRobot] = useState("");

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-center text-[1.75rem] font-normal tracking-tight">
        Join the waitlist
      </h1>
      <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">
        Teach your robot by typing. We&rsquo;re onboarding a small group first —
        tell us where to find you.
      </p>

      <form
        className="mt-8 rounded-2xl border border-border bg-background p-5"
        onSubmit={(e) => {
          e.preventDefault();
          window.location.href = `mailto:contact@openhorizon.so?subject=${encodeURIComponent(
            "BotCortex waitlist",
          )}&body=${encodeURIComponent(
            `Put me on the waitlist.\n\nEmail: ${email}\nRobot: ${robot || "—"}`,
          )}`;
        }}
      >
        <label className="block">
          <span className="mb-1.5 block text-sm">Email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@lab.edu"
            className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 ease-standard placeholder:text-muted-foreground/70 focus:border-foreground/40"
          />
        </label>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm">
            What robot do you have?{" "}
            <span className="text-muted-foreground">(optional)</span>
          </span>
          <input
            value={robot}
            onChange={(e) => setRobot(e.target.value)}
            placeholder="SO-101 arms, a UR5, a humanoid…"
            className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 ease-standard placeholder:text-muted-foreground/70 focus:border-foreground/40"
          />
        </label>
        <Button
          type="submit"
          className="mt-5 h-11 w-full rounded-lg bg-foreground text-sm font-medium text-background hover:bg-foreground/90"
        >
          Join the waitlist
          <ArrowRight className="size-4" />
        </Button>
      </form>

      <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
        No spam — one email when it&rsquo;s your turn.
      </p>
    </div>
  );
}
