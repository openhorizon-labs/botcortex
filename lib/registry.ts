/**
 * The public skill registry, as the site reads it.
 *
 * Server-side, straight from botcortex-api: no session, no cookie, and a
 * short revalidation so a freshly published skill shows within a minute
 * without rebuilding the site. When the api is unreachable the page still
 * renders, with the arms and an honest "could not load" line — a marketing
 * page must not 500 because a backend blinked.
 */

/** Who taught a skill, as the registry publishes them: the name they signed up
 *  with and what they have done in public. Never an email or an account id. */
export type SkillAuthor = {
  handle: string;
  name: string;
  /** Milliseconds since the epoch. */
  joinedAt: number;
  skills: number;
  platforms: string[];
};

export type PublishedSkill = {
  /** The skill's own public id — what a share link addresses. */
  id: string;
  name: string;
  description: string;
  code: string;
  platform: string;
  /** Milliseconds since the epoch. */
  updatedAt: number;
  /** Only on a single skill's page; the list carries no authors. */
  author?: SkillAuthor;
};

export type Registry = {
  platforms: { name: string; skills: PublishedSkill[] }[];
  count: number;
};

const API = process.env.API_URL ?? "http://localhost:8787";

export async function fetchRegistry(): Promise<Registry | null> {
  try {
    const res = await fetch(`${API}/api/registry`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<Registry>;
    if (!Array.isArray(body.platforms)) return null;
    return { platforms: body.platforms, count: body.count ?? 0 };
  } catch {
    return null;
  }
}

/** One published skill by id, for its own page. Null when it does not exist,
 *  is no longer published, or the api cannot be reached. */
export async function fetchSkill(id: string): Promise<PublishedSkill | null> {
  try {
    const res = await fetch(`${API}/api/registry/skills/${encodeURIComponent(id)}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const body = (await res.json()) as { skill?: PublishedSkill };
    return body.skill && typeof body.skill.code === "string" ? body.skill : null;
  } catch {
    return null;
  }
}
