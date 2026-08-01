import { cn } from "@/lib/utils";

/** A cortex fold rendered as a joint path: three linked segments over a spine. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("text-signal", className)}
    >
      <path
        d="M4 18V9.5A5.5 5.5 0 0 1 9.5 4h1A4.5 4.5 0 0 1 15 8.5v0A3.5 3.5 0 0 1 11.5 12H9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M20 20v-4.2a3.8 3.8 0 0 0-3.8-3.8H13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.55"
      />
      <circle cx="4" cy="18" r="1.9" fill="currentColor" />
      <circle cx="20" cy="20" r="1.4" fill="currentColor" opacity="0.55" />
    </svg>
  );
}
