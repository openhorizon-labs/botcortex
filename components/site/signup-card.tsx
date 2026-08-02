"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyCommand } from "@/components/kit/copy-command";

/** Honest signup for a pre-launch open-source product: the free path is the
 *  runtime install (real today); the email path is early access to Pro
 *  (waitlist via prefilled email until accounts exist). */
export function SignupCard() {
  const [email, setEmail] = useState("");

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-center text-[1.75rem] font-normal tracking-tight">
        Get started with BotCortex
      </h1>
      <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">
        The runtime is open source — install it now. Accounts and the cloud tier
        are coming with Pro.
      </p>

      <div className="mt-8 rounded-2xl border border-border bg-background p-5">
        <p className="text-sm font-medium">Free · on your robot today</p>
        <CopyCommand command="pip install botcortex" className="mt-3 w-full justify-center" />
        <Button
          asChild
          variant="outline"
          className="mt-2.5 h-10 w-full rounded-lg border-border text-sm"
        >
          <a href="https://github.com/openhorizon-labs/botcortex-runtime">
            Read the quickstart on GitHub
          </a>
        </Button>
      </div>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-[11px] text-muted-foreground uppercase">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form
        className="rounded-2xl border border-border bg-background p-5"
        onSubmit={(e) => {
          e.preventDefault();
          window.location.href = `mailto:hello@openhorizon.so?subject=${encodeURIComponent(
            "BotCortex Pro early access",
          )}&body=${encodeURIComponent(
            `Put me on the early-access list.\n\nEmail: ${email}\nRobot: `,
          )}`;
        }}
      >
        <p className="text-sm font-medium">Pro · early access</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Memory sync, remote access, fleet learning — $200/robot/mo when it ships.
        </p>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@lab.edu"
          className="mt-3 w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 ease-standard placeholder:text-muted-foreground/70 focus:border-foreground/40"
        />
        <Button
          type="submit"
          className="mt-2.5 h-10 w-full rounded-lg bg-foreground text-sm font-medium text-background hover:bg-foreground/90"
        >
          Request early access
          <ArrowRight className="size-4" />
        </Button>
      </form>

      <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
        No account needed for the free tier — your robot, your data.
      </p>
    </div>
  );
}
