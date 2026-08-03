"use client";

import dynamic from "next/dynamic";

import { RobotProvider } from "@/components/app/robot-provider";

const SimView = dynamic(() => import("@/components/app/sim-view"), {
  ssr: false,
  loading: () => <div className="p-8 text-sm">loading simulation…</div>,
});

export function SimPreviewClient() {
  return (
    <RobotProvider>
      <div className="h-screen w-screen bg-surface-2">
        <SimView />
      </div>
    </RobotProvider>
  );
}
