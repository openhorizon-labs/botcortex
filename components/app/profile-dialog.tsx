"use client";

/**
 * "Set up your profile" — once, the first time an account opens the app.
 *
 * Asked once per ACCOUNT, not per browser: the api holds whether it has been
 * answered (`profile.onboarded`), and skipping is an answer. It can all be
 * changed later in Settings -> Account.
 *
 * `children` render only once this step is out of the way, so a new owner is
 * not handed two dialogs at once: this one first, then the welcome credit.
 */
import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProfileForm } from "@/components/app/profile-form";
import { fetchProfile, saveProfile, type Profile } from "@/lib/profile";

export function ProfileDialog({ children }: { children?: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  /** Known to be out of the way: answered, skipped, or the api could not say
   *  (then nothing here should block whatever comes next). */
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchProfile().then((found) => {
      if (!live) return;
      setProfile(found);
      setSettled(!found || found.onboarded);
    });
    return () => { live = false; };
  }, []);

  const skip = () => {
    setSettled(true);
    void saveProfile({ done: true });
  };

  return (
    <>
      <Dialog open={Boolean(profile) && !settled} onOpenChange={(open) => { if (!open) skip(); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Set up your profile</DialogTitle>
            <DialogDescription>
              Skills you teach that work are published, with your name on them. This is how you will appear.
            </DialogDescription>
          </DialogHeader>
          {profile && (
            <ProfileForm
              profile={profile}
              submitLabel="Save and continue"
              onSaved={() => setSettled(true)}
              secondary={
                <button type="button" onClick={skip} className="px-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  Skip for now
                </button>
              }
            />
          )}
        </DialogContent>
      </Dialog>
      {settled && children}
    </>
  );
}
