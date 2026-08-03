import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * NOTE (ours, not shadcn's — re-add after any `shadcn add input`):
 * suppressHydrationWarning.
 *
 * Password managers and autofill blockers rewrite inputs before React
 * hydrates — one seen here rewrote autoComplete="email" to "off" and stashed
 * the original in data-bro-original-autocomplete. The server HTML is correct
 * and the client DOM is correct-for-that-user; only the comparison is noise,
 * and React's own guidance names extensions as a cause.
 *
 * This suppresses ONE level (the <input> itself), so real mismatches on
 * anything else still surface. We keep sending proper autoComplete values —
 * suppressing the warning, not the feature.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      suppressHydrationWarning
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
