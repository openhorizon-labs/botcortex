/** The canonical site origin, derived from the host we're deployed on.
 *  Vercel injects VERCEL_PROJECT_PRODUCTION_URL (prod domain, no protocol)
 *  at build time; custom domains flow through automatically. */
const host =
  process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "";

export const SITE_URL = host ? `https://${host}` : "http://localhost:3000";
