"use client";

/**
 * Who is signed in, as the sidebar's account button shows them: their picture,
 * their name, their handle.
 *
 * Read from the profile, not the sign-in session. The session is a snapshot
 * taken at login, so after "Save profile" this went on showing the old name
 * and a bare initial while the form beside it showed the new name and a face.
 * Until the profile has loaded, the session's name stands in.
 */
import { AuthorAvatar } from "@/components/site/author-avatar";
import { fullName, useProfile } from "@/lib/profile";

export function AccountIdentity({ sessionName, email }: { sessionName?: string | null; email?: string | null }) {
  const { profile } = useProfile();
  const name = (profile && fullName(profile)) || sessionName || "";
  return (
    <>
      <AuthorAvatar name={name || email || "?"} avatar={profile?.avatar} className="size-7 rounded-lg text-xs" />
      <div className="grid min-w-0 flex-1 text-left leading-tight">
        <span className="truncate text-sm font-medium">{name || "Owner"}</span>
        <span className="truncate text-xs text-muted-foreground">{profile ? `@${profile.handle}` : email}</span>
      </div>
    </>
  );
}
