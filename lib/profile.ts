/**
 * The signed-in owner's public profile, as the api holds it.
 */
export type Profile = {
  handle: string;
  firstName: string;
  lastName: string;
  bio: string;
  /** The generated avatar's upstream URL; show it with `avatarSrc`. */
  avatar: string;
  /** False until they have filled the profile step in, or skipped it. */
  onboarded: boolean;
};

export type ProfileChange = Partial<Pick<Profile, "handle" | "firstName" | "lastName" | "bio">> & {
  shuffleAvatar?: true;
  done?: true;
};

export type ProfileField = "handle" | "firstName" | "lastName" | "bio";

export const HANDLE_RULE = /^[a-z0-9_]{3,24}$/;
export const MAX_NAME = 40;
export const MAX_BIO = 160;

/** Where to load an avatar from: our own cache of it (app/avatar/[seed]), so a
 *  visitor's browser never talks to the image service. Anything that is not a
 *  generated avatar is returned as it came. */
export function avatarSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  const seed = /[?&]seed=([0-9a-f]{16})(?:&|$)/.exec(url)?.[1];
  return seed && url.startsWith("https://api.dicebear.com/") ? `/avatar/${seed}` : url;
}

export async function fetchProfile(): Promise<Profile | null> {
  try {
    const res = await fetch("/api/profile");
    return res.ok ? ((await res.json()) as Profile) : null;
  } catch {
    return null;
  }
}

export type SaveOutcome = { ok: true; profile: Profile } | { ok: false; field: ProfileField | null; error: string };

export async function saveProfile(change: ProfileChange): Promise<SaveOutcome> {
  try {
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(change),
    });
    const body = (await res.json().catch(() => ({}))) as Partial<Profile> & { field?: ProfileField; error?: string };
    if (!res.ok || typeof body.handle !== "string") {
      return { ok: false, field: body.field ?? null, error: body.error ?? "Could not save your profile." };
    }
    return { ok: true, profile: body as Profile };
  } catch {
    return { ok: false, field: null, error: "Could not reach BotCortex. Try again." };
  }
}

export type Availability = { available: true } | { available: false; error: string };

/** Whether a username is free for this account. Null when the api could not
 *  say — the form then does not block: saving asks again and is the authority. */
export async function checkHandle(handle: string, signal?: AbortSignal): Promise<Availability | null> {
  try {
    const res = await fetch(`/api/profile/handle/${encodeURIComponent(handle)}`, { signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { available?: boolean; error?: string };
    if (body.available === true) return { available: true };
    return { available: false, error: body.error ?? "That username is not available." };
  } catch {
    return null;
  }
}
