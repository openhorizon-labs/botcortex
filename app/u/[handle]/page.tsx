import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AuthorAvatar } from "@/components/site/author-avatar";
import { Nav } from "@/components/site/nav";
import { SkillCard } from "@/components/site/skill-card";
import { fetchAuthor } from "@/lib/registry";
import { BOOTABLE_BODIES, bodyFor, shortBodyName } from "@/lib/robot/bodies";

/**
 * An author's public page: who taught these skills, and the skills.
 *
 * It exists only for someone who has published something. An account that
 * merely signed up has no page here, and the api answers 404 for it the same
 * way it does for a handle nobody has.
 */
type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await fetchAuthor((await params).handle);
  if (!page) return { title: "Nobody here", robots: { index: false, follow: false } };
  const { author } = page;
  const description = author.bio || `${author.name} has taught ${author.skills} robot ${author.skills === 1 ? "skill" : "skills"} on BotCortex. Run any of them in your browser.`;
  return {
    title: `@${author.handle}`,
    description,
    alternates: { canonical: `/u/${author.handle}` },
    openGraph: { title: `@${author.handle} on BotCortex`, description, url: `/u/${author.handle}` },
  };
}

export default async function Page({ params }: Props) {
  const page = await fetchAuthor((await params).handle);
  if (!page) notFound();
  const { author, skills } = page;
  const runnable = new Set(BOOTABLE_BODIES.map((body) => body.name));
  const joined = new Date(author.joinedAt).toLocaleDateString("en", { month: "long", year: "numeric" });
  const byArm = author.platforms.map((platform) => ({
    platform,
    name: shortBodyName(bodyFor(platform).displayName),
    skills: skills.filter((skill) => skill.platform === platform),
  }));

  return (
    <main className="flex min-h-screen flex-col">
      <Nav />
      <div className="mx-auto w-full max-w-[1368px] flex-1 px-6 py-10 sm:px-10">
        <Link href="/skills" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-3.5" /> All skills
        </Link>

        <header className="mt-6 flex min-w-0 flex-wrap items-center gap-5">
          <AuthorAvatar name={author.name} avatar={author.avatar} className="size-20 text-3xl" />
          <div className="min-w-0">
            <h1 className="break-words text-[32px] font-normal leading-[1.1] tracking-[-0.01em] sm:text-[40px]">{author.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              @{author.handle} · joined {joined}
            </p>
            {author.bio && <p className="mt-3 max-w-xl break-words text-base leading-relaxed text-foreground/80">{author.bio}</p>}
          </div>
        </header>

        <dl className="mt-8 grid max-w-xl grid-cols-3 gap-4 border-y border-border py-5">
          {[
            ["Skills published", author.skills],
            ["Robots taught", author.platforms.length],
            ["Runs by other people", author.runs ?? 0],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dd className="text-2xl font-medium tabular-nums">{value}</dd>
              <dt className="mt-1 text-xs text-muted-foreground">{label}</dt>
            </div>
          ))}
        </dl>

        {byArm.map((arm) => (
          <section key={arm.platform} className="mt-10">
            <h2 className="text-[22px] font-medium">On the {arm.name}</h2>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {arm.skills.map((skill) => (
                <SkillCard key={skill.id} skill={skill} runnable={runnable.has(skill.platform)} showAuthor={false} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
