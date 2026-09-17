import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Nav } from "@/components/site/nav";
import { SkillPlayer } from "@/components/site/skill-player";
import { fetchSkill } from "@/lib/registry";
import { KIND_LABELS, MESH_CREDITS, bodyFor, shortBodyName } from "@/lib/robot/bodies";

/**
 * One published skill, and a button that runs it.
 *
 * This is what a share link opens. It has to work for a stranger with no
 * account in under a minute, because that is the whole of its job: someone
 * taught a robot something, sent this URL to someone else, and the someone
 * else should see the robot do it.
 */
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ run?: string }> };

const title = (name: string) => name.replace(/_/g, " ");

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const skill = await fetchSkill((await params).id);
  if (!skill) return { title: "Skill not found", robots: { index: false, follow: false } };
  const body = shortBodyName(bodyFor(skill.platform).displayName);
  const heading = `${title(skill.name)} — on the ${body}`;
  return {
    title: heading,
    description: `${skill.description} Run it in your browser: real physics, nothing to install.`,
    alternates: { canonical: `/skills/${skill.id}` },
    openGraph: {
      title: heading,
      description: `${skill.description} Run it in your browser.`,
      url: `/skills/${skill.id}`,
      images: [{ url: `/robots/cards/${skill.platform}.png`, width: 640, height: 480, alt: `${body} in the simulation` }],
    },
    twitter: { card: "summary_large_image", title: heading, description: skill.description, images: [`/robots/cards/${skill.platform}.png`] },
  };
}

export default async function Page({ params, searchParams }: Props) {
  const skill = await fetchSkill((await params).id);
  if (!skill) notFound();
  const body = bodyFor(skill.platform);
  const bodyName = shortBodyName(body.displayName);
  const autorun = (await searchParams).run === "1";
  const credit = MESH_CREDITS[skill.platform];

  return (
    <main className="flex min-h-screen flex-col">
      <Nav />
      <div className="mx-auto w-full max-w-[1368px] flex-1 px-6 py-10 sm:px-10">
        <Link href="/skills" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-3.5" /> All skills
        </Link>
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0">
            <SkillPlayer
              skill={{ id: skill.id, name: skill.name, code: skill.code, platform: skill.platform }}
              bodyName={bodyName}
              autorun={autorun && body.browser}
            />
            {!body.browser && (
              <p className="mt-3 text-sm text-muted-foreground">
                The {bodyName} does not run in the browser yet, so this one can only be read here.
              </p>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              {KIND_LABELS[body.kind] ?? body.kind} · {bodyName}
            </p>
            <h1 className="mt-1 break-words text-[32px] font-normal leading-[1.1] tracking-[-0.01em] first-letter:uppercase sm:text-[40px]">
              {title(skill.name)}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">{skill.description}</p>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Someone taught their robot this by typing a sentence. It ran successfully, so it was
              published. What you see is the same program running against the same physics.
            </p>
            {credit && (
              <p className="mt-4 text-xs text-muted-foreground">
                Model and meshes:{" "}
                <a href={credit.url} className="underline underline-offset-2 hover:text-foreground">
                  {credit.source}
                </a>
                , {credit.licence}.
              </p>
            )}
            <div className="mt-6 overflow-hidden rounded-2xl border border-border">
              <p className="truncate border-b border-border bg-surface-2 px-4 py-2 font-mono text-xs text-muted-foreground">
                {skill.name}.py
              </p>
              <pre className="max-h-[420px] overflow-auto bg-surface-3 p-4 font-mono text-xs leading-relaxed">{skill.code}</pre>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
