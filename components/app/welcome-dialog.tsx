"use client";

import { Gift } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRobot } from "@/components/app/robot-provider";

/**
 * "You have $2 to teach with." Once per account.
 *
 * Whether to show it is the api's answer, not this browser's: `credit.welcome`
 * is present exactly until the owner dismisses this, on any device. A flag in
 * localStorage would have shown it again on every new laptop and never at all
 * in a private window.
 */
export function WelcomeDialog() {
  const { credit, acknowledgeWelcome } = useRobot();
  const welcome = credit?.welcome ?? null;

  return (
    <Dialog open={Boolean(welcome)} onOpenChange={(open) => { if (!open) acknowledgeWelcome(); }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <span className="mb-1 flex size-10 items-center justify-center rounded-xl bg-surface-3">
            <Gift className="size-5" />
          </span>
          <DialogTitle>You have {welcome?.display ?? "$2.00"} to teach with</DialogTitle>
          <DialogDescription>
            A welcome credit, on us. It pays for the AI that writes a skill when you describe a
            task. Teaching one usually costs between a few cents and a quarter, depending on the
            model and how many tries it takes.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
          <li>Running a skill your robot already knows is free, always.</li>
          <li>The balance is in the sidebar. Nothing is charged to you when it runs out.</li>
          <li>Prefer your own OpenAI or Anthropic key? Add it in Settings and teaching never touches this.</li>
        </ul>
        <DialogFooter>
          <Button onClick={acknowledgeWelcome} className="h-10 rounded-lg">
            Start teaching
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
