"use client";

import { ProfileDialog } from "@/components/app/profile-dialog";
import { SettingsProfile } from "@/components/app/settings-profile";
import { AccountIdentity } from "@/components/app/account-identity";
import { ModelKeyPanel } from "@/components/app/model-key-panel";
import { RobotProvider } from "@/components/app/robot-provider";
import { WelcomeDialog } from "@/components/app/welcome-dialog";

export function DialogsPreviewClient() {
  return (
    <RobotProvider>
      <main className="min-h-dvh w-full bg-surface-2 p-8" data-dialogs-preview="ready">
        <div data-account-button className="mx-auto mb-4 flex w-60 items-center gap-2 rounded-lg border border-border bg-background p-2">
          <AccountIdentity sessionName="Test Owner" email="owner@example.com" />
        </div>
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-background p-5">
          <ModelKeyPanel />
        </div>
        <div className="mx-auto mt-4 max-w-md rounded-2xl border border-border bg-background p-5">
          <SettingsProfile />
        </div>
        <ProfileDialog>
          <WelcomeDialog />
        </ProfileDialog>
      </main>
    </RobotProvider>
  );
}
