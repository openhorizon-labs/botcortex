import { Skeleton } from "@/components/ui/skeleton";

export function WorkspaceSkeleton() {
  return (
    <div role="status" className="h-svh w-full bg-sidebar">
      <span className="sr-only">Loading workspace…</span>
      <div aria-hidden="true" className="flex h-full overflow-hidden motion-reduce:[&_[data-slot=skeleton]]:animate-none">
        <div className="hidden w-[248px] shrink-0 flex-col gap-6 p-2 md:flex">
          <div className="flex h-12 items-center gap-2 px-2">
            <Skeleton className="size-7 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          </div>

          <div className="space-y-3 px-2">
            {["w-24", "w-16"].map(width => (
              <div key={width} className="flex h-5 items-center gap-2">
                <Skeleton className="size-4 shrink-0" />
                <Skeleton className={`h-3 ${width}`} />
              </div>
            ))}
          </div>

          {["tasks", "skills"].map(section => (
            <div key={section} className="space-y-4 px-2">
              <Skeleton className="h-2.5 w-12" />
              {["w-36", "w-28", "w-32"].map(width => (
                <div key={width} className="flex items-center gap-2">
                  <Skeleton className="size-4 shrink-0" />
                  <Skeleton className={`h-3 ${width}`} />
                </div>
              ))}
            </div>
          ))}

          <div className="mt-auto space-y-4 p-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
            <div className="flex items-center gap-2">
              <Skeleton className="size-7 shrink-0 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-2.5 w-32" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background md:my-2 md:mr-2">
          <div className="flex h-12 shrink-0 items-center justify-between px-3">
            <Skeleton className="size-7" />
            <Skeleton className="size-7" />
          </div>
          <div className="mx-auto flex min-h-0 w-full max-w-[768px] flex-1 flex-col justify-center overflow-y-auto px-4 py-8">
            <Skeleton className="mx-auto h-9 w-3/4 max-w-[440px]" />
            <div className="mt-7 rounded-2xl border border-border bg-surface-2 p-3.5">
              <Skeleton className="h-4 w-3/4" />
              <div className="mt-5 flex items-center gap-2">
                <Skeleton className="h-6 w-28 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="ml-auto size-7 shrink-0 rounded-full" />
              </div>
            </div>
            <div className="mt-8">
              <Skeleton className="mb-3 h-3 w-28" />
              <div className="divide-y divide-border">
                {["w-3/4", "w-2/3", "w-1/2", "w-3/5"].map(width => (
                  <div key={width} className="flex h-9 items-center gap-2.5 px-2">
                    <Skeleton className="size-4 shrink-0" />
                    <Skeleton className={`h-3 ${width}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
