import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://botcortex.dev";
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/demo`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/signup`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
