import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Nav } from "@/components/site/nav";
import { Footer } from "@/components/site/footer";
import { SkillCard } from "@/components/site/skill-card";
import { KIND_LABELS, MESH_CREDITS, SUPPORTED_BODIES, bodyFor } from "@/lib/robot/bodies";
import { type PublishedSkill, fetchRegistry } from "@/lib/registry";

export const metadata: Metadata = {
  title: "Skill registry",
  description:
    "Every skill taught by typing and proven on a robot BotCortex supports, per body, with the program behind it. Arms today, humanoids as they join the catalog.",
  alternates: { canonical: "/skills" },
  openGraph: {
    title: "BotCortex skill registry",
    description: "Skills taught by typing and proven on each supported robot.",
    url: "/skills",
  },
};

export default async function Page() {
  const registry = await fetchRegistry();
  const published = new Map<string, PublishedSkill[]>();
  for (const platform of registry?.platforms ?? []) published.set(platform.name, platform.skills);

  // Every body the runtime knows, in catalog order; then any other body a
  // robot has published for, so nothing that made it into the registry is
  // hidden. Not "arms": the catalog is whatever robots we support.
  const bodies = [
    ...SUPPORTED_BODIES,
    ...[...published.keys()].filter((name) => !SUPPORTED_BODIES.some((body) => body.name === name)).map(bodyFor),
  ];
  const total = registry?.count ?? 0;

  return (
    <>
      <Nav />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-[1368px] px-6 pt-12 pb-10 lg:px-10 lg:pt-16">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <h1 className="text-[2.25rem] font-normal leading-[1.08] tracking-[-0.01em] sm:text-[3rem] lg:text-[3.5rem]">
                Skills that ran.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-6 text-foreground/80">
                Every program here was taught by typing, written by the agent, and seen to
                run to completion on the robot it is filed under. Every successful skill,
                on any robot, by anyone, lands here on its own. Nothing is listed on a promise.
                Copy one, or teach your own.
              </p>
            </div>
            <div className="flex items-end gap-10 border-l border-border pl-6 lg:pb-1">
              <div>
                <p className="text-[2.5rem] leading-none tracking-tight">{total}</p>
                <p className="mt-2 text-sm text-muted-foreground">published {total === 1 ? "skill" : "skills"}</p>
              </div>
              <div>
                <p className="text-[2.5rem] leading-none tracking-tight">{bodies.length}</p>
                <p className="mt-2 text-sm text-muted-foreground">{bodies.length === 1 ? "robot" : "robots"}</p>
              </div>
            </div>
          </div>
          {registry === null && (
            <p className="mt-6 rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 font-mono text-xs text-muted-foreground">
              The registry could not be reached just now. The robots below are current; their skills will appear when it answers.
            </p>
          )}
        </section>

        <section className="mx-auto w-full max-w-[1368px] space-y-10 px-6 pb-24 lg:px-10">
          {bodies.map((arm) => {
            const skills = published.get(arm.name) ?? [];
            const shape = [
              KIND_LABELS[arm.kind] ?? arm.kind,
              arm.joints ? `${arm.joints} joints${arm.arms > 1 ? ` × ${arm.arms}` : ""}` : null,
              arm.reachM ? `${arm.reachM} m reach` : null,
              arm.browser ? "runs in your browser" : "native simulation",
            ].filter(Boolean);
            return (
              <div
                key={arm.name}
                id={arm.name}
                className="relative scroll-mt-24 rounded-3xl border border-border bg-background p-4 sm:p-5"
              >
                <div className="grid gap-8 lg:grid-cols-[1fr_1.6fr] lg:gap-10">
                  <div className="min-w-0">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-surface-3">
                      {arm.image ? (
                        <Image
                          src={arm.image}
                          alt={`${arm.displayName}, rendered from its simulation`}
                          fill
                          sizes="(min-width: 1024px) 480px, 100vw"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center font-mono text-xs text-muted-foreground">
                          no render yet
                        </div>
                      )}
                    </div>
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <h2 className="break-words text-[26px] font-medium leading-tight tracking-tight sm:text-[28px]">
                        {arm.displayName}
                      </h2>
                      <span className="rounded-lg bg-surface-3 px-3 py-1.5 text-sm">
                        {skills.length} {skills.length === 1 ? "skill" : "skills"}
                      </span>
                    </div>
                    {arm.card && <p className="mt-1 text-sm text-muted-foreground">{arm.card.tagline}</p>}
                    <p className="mt-2 font-mono text-xs text-muted-foreground">{shape.join(" · ")}</p>
                    {arm.card && (
                      <p className="mt-3 max-w-md text-base leading-relaxed text-muted-foreground">{arm.card.body}</p>
                    )}
                    {MESH_CREDITS[arm.name] && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Model and meshes:{" "}
                        <Link
                          href={MESH_CREDITS[arm.name].url}
                          className="underline underline-offset-2 hover:text-foreground"
                        >
                          {MESH_CREDITS[arm.name].source}
                        </Link>
                        , {MESH_CREDITS[arm.name].licence}.
                      </p>
                    )}
                    {arm.browser ? (
                      <Link
                        href="/app"
                        className="group mt-5 inline-flex items-center gap-1.5 text-base font-medium text-foreground"
                      >
                        Teach this robot in your browser
                        <ArrowRight className="size-4 transition-transform duration-150 ease-standard group-hover:translate-x-0.5" />
                      </Link>
                    ) : (
                      <Link
                        href="https://github.com/openhorizon-labs"
                        className="group mt-5 inline-flex items-center gap-1.5 text-base font-medium text-foreground"
                      >
                        Teach it with the runtime
                        <ArrowRight className="size-4 transition-transform duration-150 ease-standard group-hover:translate-x-0.5" />
                      </Link>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col gap-3">
                    {skills.length === 0 ? (
                      <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center">
                        <p className="max-w-xs text-sm text-muted-foreground">
                          Nothing proven on this robot yet. The first skill that runs to completion
                          on it lands here on its own.
                        </p>
                      </div>
                    ) : (
                      skills.map((skill) => <SkillCard key={skill.name} skill={skill} />)
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      </main>
      <Footer />
    </>
  );
}
