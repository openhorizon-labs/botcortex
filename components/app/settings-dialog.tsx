"use client";

/**
 * Settings — one dialog, a left nav of sections, content on the right.
 *
 * Sections earn their place by having something real in them; a "General" tab
 * holding a placeholder is worse than not existing. Today that's three:
 * robot access, credit, and the account itself.
 */

import { useState } from "react";
import { CircleUser, Coins, Cpu, LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { authClient, useSession } from "@/lib/auth-client";
import { useRobot } from "@/components/app/robot-provider";
import { RobotKeysPanel } from "@/components/app/robot-keys-panel";

type SectionId = "access" | "credit" | "account";

const SECTIONS: { id: SectionId; label: string; icon: typeof Cpu }[] = [
  { id: "access", label: "Robot access", icon: Cpu },
  { id: "credit", label: "Credit", icon: Coins },
  { id: "account", label: "Account", icon: CircleUser },
];

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [section, setSection] = useState<SectionId>("access");
  const { data: session } = useSession();
  const { credit, conversations } = useRobot();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Robot access, credit, and account settings
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-[22rem] flex-col sm:flex-row">
          <nav className="shrink-0 border-b border-border p-2 sm:w-44 sm:border-b-0 sm:border-r">
            <ul className="flex gap-1 sm:flex-col">
              {SECTIONS.map(({ id, label, icon: Icon }) => (
                <li key={id} className="flex-1">
                  <button
                    onClick={() => setSection(id)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                      section === id
                        ? "bg-surface-3 font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto p-5">
            {section === "access" && <RobotKeysPanel />}

            {section === "credit" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium">Credit</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Spent when your robot authors a new skill. Skills it has
                    already learned run without it.
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface-2 p-4">
                  <p className="font-mono text-2xl">{credit?.display ?? "—"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    remaining
                    {credit
                      ? ` · $${(credit.spentMicros / 1_000_000).toFixed(2)} used so far`
                      : ""}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Need more? Reply to your invite email and we&apos;ll top you up.
                </p>
              </div>
            )}

            {section === "account" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium">Account</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {session?.user.email ?? "Not signed in"}
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border border-border p-3">
                    <dt className="text-xs text-muted-foreground">Name</dt>
                    <dd className="truncate">{session?.user.name || "—"}</dd>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <dt className="text-xs text-muted-foreground">Tasks</dt>
                    <dd>{conversations.length}</dd>
                  </div>
                </dl>
                <Button
                  variant="outline"
                  className="cursor-pointer"
                  onClick={async () => {
                    await authClient.signOut();
                    window.location.href = "/signin";
                  }}
                >
                  <LogOut className="size-4" /> Sign out
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
