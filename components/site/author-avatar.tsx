"use client";

/**
 * An author's generated avatar, with their initial behind it.
 *
 * The initial is not a loading state: it is what shows if the image service
 * was down when we first asked for this picture. A profile with a broken-image
 * icon on it looks abandoned; one with a letter looks deliberate.
 */
import { useState } from "react";

import { cn } from "@/lib/utils";
import { avatarSrc } from "@/lib/profile";

export function AuthorAvatar({ name, avatar, className }: { name: string; avatar?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = avatarSrc(avatar);
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-3 text-sm font-medium uppercase",
        className,
      )}
    >
      {[...name.trim()][0] ?? "?"}
      {src && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover" draggable={false} />
      )}
    </span>
  );
}
