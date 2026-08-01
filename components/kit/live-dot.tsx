import { cn } from "@/lib/utils";

/** Status dot with a slow halo — "this thing is alive" without a spinner. */
export function LiveDot({
  className,
  tone = "ok",
}: {
  className?: string;
  tone?: "ok" | "signal";
}) {
  const color = tone === "ok" ? "bg-runner-primitive" : "bg-signal";
  return (
    <span className={cn("relative inline-flex size-1.5", className)}>
      <span
        className={cn(
          "absolute inline-flex size-full animate-ping rounded-full opacity-60",
          color,
        )}
        style={{ animationDuration: "2.4s" }}
      />
      <span className={cn("relative inline-flex size-full rounded-full", color)} />
    </span>
  );
}
