/**
 * The public skill registry, as the site reads it.
 *
 * Server-side, straight from botcortex-api: no session, no cookie, and a
 * short revalidation so a freshly published skill shows within a minute
 * without rebuilding the site. When the api is unreachable the page still
 * renders, with the arms and an honest "could not load" line — a marketing
 * page must not 500 because a backend blinked.
 */

export type PublishedSkill = {
  name: string;
  description: string;
  code: string;
  platform: string;
  /** Milliseconds since the epoch. */
  updatedAt: number;
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
