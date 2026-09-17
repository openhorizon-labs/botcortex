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
  /** A line about them, in their words. May be empty. */
  bio?: string;
  /** Their generated avatar; show it through `avatarSrc`. */
  avatar?: string;
  /** Milliseconds since the epoch. */
  joinedAt: number;
  skills: number;
  platforms: string[];
  /** Times someone other than them has run one of their skills. */
  runs: number;
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
  /** Times someone other than the author has run it. The registry is ranked
   *  by this, so the order the api sends is the order to show. */
  runs?: number;
  /** A handle in a list; the whole card on the skill's own page. */
  author?: { handle: string } | SkillAuthor;
};

export const isAuthorCard = (author: PublishedSkill["author"]): author is SkillAuthor =>
  Boolean(author && "name" in author);

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

/** An author's public page: who they are and what they have published. Null
 *  for an unknown handle, and for someone who has published nothing. */
export async function fetchAuthor(handle: string): Promise<{ author: SkillAuthor; skills: PublishedSkill[] } | null> {
  try {
    const res = await fetch(`${API}/api/registry/authors/${encodeURIComponent(handle)}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const body = (await res.json()) as { author?: SkillAuthor; skills?: PublishedSkill[] };
    return body.author && Array.isArray(body.skills) ? { author: body.author, skills: body.skills } : null;
  } catch {
    return null;
  }
}
