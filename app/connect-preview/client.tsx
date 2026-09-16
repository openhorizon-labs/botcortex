"use client";

import { useState } from "react";

import { ConnectRobotDialog } from "@/components/app/connect-robot-dialog";
import { RobotProvider } from "@/components/app/robot-provider";

export function ConnectPreviewClient() {
  const [open, setOpen] = useState(true);
  return (
    <RobotProvider>
      <main className="h-dvh w-full bg-surface-2" data-connect-preview="ready">
        <ConnectRobotDialog open={open} onOpenChange={setOpen} />
      </main>
    </RobotProvider>
  );
}
