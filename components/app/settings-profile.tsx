"use client";

/** The profile form, in Settings -> Account. Same form as the sign-up step. */
import { useEffect, useState } from "react";
import Link from "next/link";

import { ProfileForm } from "@/components/app/profile-form";
import { fetchProfile, type Profile } from "@/lib/profile";

export function SettingsProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let live = true;
    void fetchProfile().then((found) => { if (live) setProfile(found); });
    return () => { live = false; };
  }, []);

  return (
    <div className="min-w-0 border-t border-border pt-4">
      <h3 className="text-sm font-medium">Public profile</h3>
      {profile ? (
        <div className="mt-3">
          <ProfileForm profile={profile} submitLabel="Save profile" onSaved={(next) => { setProfile(next); setSaved(true); }} />
          {saved && (
            <p className="mt-2 text-xs text-muted-foreground">
              Saved.{" "}
              <Link href={`/u/${profile.handle}`} className="underline underline-offset-2 hover:text-foreground">
                See your page
              </Link>{" "}
              (it appears once you have published a skill).
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      )}
    </div>
  );
}
