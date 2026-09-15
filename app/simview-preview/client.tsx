"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";

import { RobotProvider, useRobot } from "@/components/app/robot-provider";

const SimView = dynamic(() => import("@/components/app/sim-view"), {
  ssr: false,
  loading: () => <div className="p-8 text-sm">loading simulation…</div>,
});

/**
 * `?platform=<catalog name>` boots the in-tab robot on that body so a
 * screenshot shows the LIVE simulation, drawn the way the app draws it —
 * the URDF arm for the OpenArm, the kinematic tree for anything else.
 * Without the parameter the viewport mounts robot-less, as before.
 */
function BootFromQuery() {
  const { connectBrowserSim, robot, status, simBooting } = useRobot();
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    const platform = new URLSearchParams(window.location.search).get("platform");
    if (!platform) return;
    asked.current = true;
    void connectBrowserSim(platform);
  }, [connectBrowserSim]);
  return (
    <div
      className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-border bg-background/90 px-2.5 py-1.5 text-xs text-muted-foreground"
      data-status={status}
      data-platform={robot?.platform ?? ""}
    >
      {simBooting ? `${simBooting}…` : robot ? `${robot.name} · ${robot.platform}` : "no robot"}
    </div>
  );
}

export function SimPreviewClient() {
  return (
    <RobotProvider>
      <div className="relative h-screen w-screen bg-surface-2">
        <BootFromQuery />
        <SimView />
      </div>
    </RobotProvider>
  );
}
