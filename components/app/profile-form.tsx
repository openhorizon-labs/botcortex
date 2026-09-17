"use client";

/**
 * The public profile: a picture, a name, a handle, a line about you.
 *
 * One form, used twice — as the step after sign-up and in Settings — so the
 * rules and the wording cannot drift between them. Everything here is shown
 * on the public registry next to the skills you teach, which the form says
 * once, plainly, rather than leaving to be discovered.
 *
 * The picture is generated, not uploaded: "Shuffle" asks the api for another
 * one. It is made from a random seed, never from anything about the person.
 */
import { useEffect, useState } from "react";
import { Check, Loader2, Shuffle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AuthorAvatar } from "@/components/site/author-avatar";
import { HANDLE_RULE, MAX_BIO, MAX_NAME, checkHandle, saveProfile, type Profile, type ProfileField } from "@/lib/profile";

export function ProfileForm({
  profile,
  submitLabel,
  onSaved,
  secondary,
}: {
  profile: Profile;
  submitLabel: string;
  onSaved: (profile: Profile) => void;
  /** Rendered beside the submit button — "Skip for now" in the sign-up step. */
  secondary?: React.ReactNode;
}) {
  const [avatar, setAvatar] = useState(profile.avatar);
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [handle, setHandle] = useState(profile.handle);
  const [bio, setBio] = useState(profile.bio);
  const [busy, setBusy] = useState<"save" | "shuffle" | null>(null);
  const [problem, setProblem] = useState<{ field: ProfileField | null; error: string } | null>(null);

  const wanted = handle.trim().toLowerCase().replace(/^@/, "");
  const handleOk = HANDLE_RULE.test(wanted);
  /** The name they already hold: nothing to ask the api about. */
  const [held, setHeld] = useState(profile.handle);

  // Asked WHILE it is typed, so a taken username is refused here and not after
  // the whole form has been filled in and submitted. Debounced, and an answer
  // to a name that is no longer in the box is thrown away. Saving checks again
  // on the server: a name that was free a second ago is not a promise.
  const [checked, setChecked] = useState<{ handle: string; error: string | null } | null>(null);
  useEffect(() => {
    if (!handleOk || wanted === held) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      void checkHandle(wanted, abort.signal).then((answer) => {
        if (abort.signal.aborted || !answer) return;
        setChecked({ handle: wanted, error: answer.available ? null : answer.error });
      });
    }, 350);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [wanted, handleOk, held]);
  const answer = checked?.handle === wanted ? checked : null;
  const checking = handleOk && wanted !== held && !answer;
  const taken = answer?.error ?? null;
  const free = handleOk && (wanted === held || (answer !== null && !answer.error));

  const ready = firstName.trim().length > 0 && handleOk && !taken && !checking && bio.length <= MAX_BIO;
  const said = (field: ProfileField) => (problem?.field === field ? problem.error : null);

  async function shuffle() {
    setBusy("shuffle");
    const outcome = await saveProfile({ shuffleAvatar: true });
    if (outcome.ok) setAvatar(outcome.profile.avatar);
    else setProblem({ field: null, error: outcome.error });
    setBusy(null);
  }

  async function save() {
    setBusy("save");
    setProblem(null);
    const outcome = await saveProfile({ firstName, lastName, handle: wanted, bio, done: true });
    setBusy(null);
    if (!outcome.ok) {
      setProblem({ field: outcome.field, error: outcome.error });
      return;
    }
    setHandle(outcome.profile.handle);
    setHeld(outcome.profile.handle);
    onSaved(outcome.profile);
  }

  return (
    <form
      className="flex min-w-0 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) void save();
      }}
    >
      <div className="flex min-w-0 items-center gap-4">
        <AuthorAvatar name={firstName || profile.firstName} avatar={avatar} className="size-16 text-xl" />
        <div className="min-w-0">
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" disabled={busy !== null} onClick={() => void shuffle()}>
            {busy === "shuffle" ? <Loader2 className="size-3.5 animate-spin" /> : <Shuffle className="size-3.5" />}
            Shuffle picture
          </Button>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Generated for you. Shuffle until you like it.</p>
        </div>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Field label="First name" error={said("firstName")}>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={MAX_NAME} autoComplete="given-name" className="h-10" />
        </Field>
        <Field label="Last name" hint="optional" error={said("lastName")}>
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={MAX_NAME} autoComplete="family-name" className="h-10" />
        </Field>
      </div>

      <Field
        label="Username"
        error={said("handle") ?? taken ?? (wanted && !handleOk ? "3 to 24 characters: lowercase letters, numbers and underscores." : null)}
        note={checking ? "Checking…" : free ? `Available. Your page will be /u/${wanted}` : null}
      >
        {/* The wrapper carries the invalid look; the input inside keeps the
            aria-invalid a screen reader needs and gives up its own red ring,
            which drew a second box inside this one. */}
        <div
          className={`flex min-w-0 items-center rounded-lg border pl-3 ${
            taken || (wanted.length > 0 && !handleOk) ? "border-destructive" : "border-border focus-within:border-foreground"
          }`}
        >
          <span className="text-sm text-muted-foreground">@</span>
          <Input
            value={handle}
            onChange={(e) => { setHandle(e.target.value); if (problem?.field === "handle") setProblem(null); }}
            aria-label="Username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={25}
            aria-invalid={Boolean(taken) || (wanted.length > 0 && !handleOk)}
            className="h-10 min-w-0 border-0 px-1 shadow-none focus-visible:ring-0 aria-invalid:border-0 aria-invalid:ring-0"
          />
          <span className="flex w-8 shrink-0 items-center justify-center text-muted-foreground" aria-hidden>
            {checking ? <Loader2 className="size-3.5 animate-spin" /> : free ? <Check className="size-3.5 text-foreground" /> : null}
          </span>
        </div>
      </Field>

      <Field label="Bio" hint="optional" error={said("bio")} note={`${bio.length}/${MAX_BIO}`}>
        <Textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={MAX_BIO}
          rows={2}
          placeholder="What you build, or what you want your robot to do."
          className="min-h-[64px] resize-none"
        />
      </Field>

      <p className="text-xs leading-relaxed text-muted-foreground">
        This is public: it appears beside the skills you teach. Your email is never shown.
      </p>
      {problem && problem.field === null && <p className="break-words text-xs text-destructive">{problem.error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" className="h-10 gap-1.5 rounded-lg" disabled={!ready || busy !== null}>
          {busy === "save" && <Loader2 className="size-4 animate-spin" />}
          {submitLabel}
        </Button>
        {secondary}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  note,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  note?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium">
        {label} {hint && <span className="font-normal text-muted-foreground">· {hint}</span>}
      </span>
      {children}
      {(error || note) && (
        <span className={`break-words text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}>{error ?? note}</span>
      )}
    </label>
  );
}
