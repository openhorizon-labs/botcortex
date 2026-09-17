"use client";

import { HandleField } from "@/components/app/handle-field";
import { ModelKeyPanel } from "@/components/app/model-key-panel";
import { RobotProvider } from "@/components/app/robot-provider";
import { WelcomeDialog } from "@/components/app/welcome-dialog";

export function DialogsPreviewClient() {
  return (
    <RobotProvider>
      <main className="min-h-dvh w-full bg-surface-2 p-8" data-dialogs-preview="ready">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-background p-5">
          <ModelKeyPanel />
        </div>
        <div className="mx-auto mt-4 max-w-md rounded-2xl border border-border bg-background p-5">
          <HandleField />
        </div>
        <WelcomeDialog />
      </main>
    </RobotProvider>
  );
}
