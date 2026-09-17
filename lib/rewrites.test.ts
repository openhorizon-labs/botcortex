import { expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every same-origin /api call the app makes must have a rewrite to the api.
 *
 * The rewrites in next.config.ts are an explicit list, so a new endpoint that
 * nobody adds there 404s in the browser and nowhere else: the api's own tests
 * pass, and a preview that stubs the route passes. That is how the welcome
 * dialog's "seen" call shipped broken. This reads the calls out of the source
 * and checks each one against the list.
 */
const root = join(import.meta.dir, "..");
const config = readFileSync(join(root, "next.config.ts"), "utf8");
const patterns = [...config.matchAll(/source: "([^"]+)"/g)].map(([, source]) =>
  new RegExp(`^${source.replace(/:[a-z]+\*/g, ".+").replace(/:[a-z]+/g, "[^/]+")}$`),
);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

/** Meant to 404 here: it asks "is this page being served by a robot?", and on
 *  the hosted site the answer is no. */
const PROBES = new Set(["/api/status"]);

test("every /api path the app fetches is rewritten to the api", () => {
  const called = new Set<string>();
  for (const file of ["app", "components", "lib"].flatMap((dir) => sources(join(root, dir)))) {
    for (const [, path] of readFileSync(file, "utf8").matchAll(/fetch\(\s*[`"'](\/api\/[^`"'?]+)/g)) {
      // A template hole is one path segment: `/api/skills/${name}/ran`.
      called.add(path.replace(/\$\{[^}]+\}/g, "x"));
    }
  }
  expect(called.size).toBeGreaterThan(5);
  const unrouted = [...called].filter((path) => !PROBES.has(path) && !patterns.some((pattern) => pattern.test(path)));
  expect(unrouted).toEqual([]);
});
