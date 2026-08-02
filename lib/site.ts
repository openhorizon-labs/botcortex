/** The canonical site origin. Set NEXT_PUBLIC_PRODUCTION_URL in the deploy
 *  environment (with or without protocol); falls back to Vercel's deployment
 *  URL, then localhost for local builds. */
const raw =
  process.env.NEXT_PUBLIC_PRODUCTION_URL || process.env.VERCEL_URL || "";
const host = raw.replace(/^https?:\/\//, "").replace(/\/$/, "");

export const SITE_URL = host ? `https://${host}` : "http://localhost:3000";
