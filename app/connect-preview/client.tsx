"use client";

import { useEffect, useState } from "react";

import { ConnectRobotDialog } from "@/components/app/connect-robot-dialog";
import { RobotProvider, useRobot } from "@/components/app/robot-provider";

/** `?platform=<name>` boots the in-tab robot first, so the dialog can be
 *  measured in its CONNECTED state — the one with the robot's name in it,
 *  which is the state that grew a scrollbar. */
function Preview() {
  const { connectBrowserSim, robot } = useRobot();
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const platform = new URLSearchParams(window.location.search).get("platform");
    if (platform) void connectBrowserSim(platform);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <main className="h-dvh w-full bg-surface-2" data-connect-preview="ready" data-robot={robot?.platform ?? ""}>
      <ConnectRobotDialog open={open} onOpenChange={setOpen} />
    </main>
  );
}

export function ConnectPreviewClient() {
  return (
    <RobotProvider>
      <Preview />
    </RobotProvider>
  );
}
