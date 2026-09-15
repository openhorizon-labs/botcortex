/**
 * The committed wheel must be the one the manifest describes.
 *
 * public/botcortex/MANIFEST.json is the human-readable provenance for the
 * runtime artifact the browser sim boots: which wheel, its SHA-256, the agent
 * contract version inside it, the platform, and the runtime commit it was
 * built from. Swapping the wheel without updating the manifest — or the other
 * way round — fails here, explicitly, rather than shipping a browser robot
 * that quietly disagrees with the runtime it claims to mirror.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "bun:test";

const DIR = join(import.meta.dir, "../../public/botcortex");

const manifest = JSON.parse(readFileSync(join(DIR, "MANIFEST.json"), "utf8")) as {
  wheel: string;
  sha256: string;
  contractVersion: string;
  platform: string;
  runtimeCommit: string;
  runtimeRepo: string;
  recordedAt: string;
  catalog: { name: string; displayName: string }[];
  bodies: { name: string; displayName: string; kind: string; joints: number; arms: number; reachM: number; browser: boolean }[];
};

const wheelPath = join(DIR, manifest.wheel);

test("the manifest names a wheel that exists and matches its SHA-256", () => {
  const bytes = readFileSync(wheelPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  expect(sha256).toBe(manifest.sha256);
});

test("the contract version inside the wheel is the one the manifest records", () => {
  // `unzip` ships with macOS and ubuntu runners; the wheel is a plain zip.
  const proc = Bun.spawnSync(["unzip", "-p", wheelPath, "botcortex/agent_contract.json"]);
  expect(proc.exitCode).toBe(0);
  const contract = JSON.parse(proc.stdout.toString()) as { version?: unknown };
  expect(contract.version).toBe(manifest.contractVersion);
});

test("the manifest's catalog is exactly the wheel's browser-capable bodies", () => {
  // Every platforms/<name>/platform.json in the wheel whose sim block is
  // browser-capable and whose model ships inside the wheel. The connect
  // dialog offers this list BEFORE booting, so it must not drift from what
  // the worker will accept.
  const listing = Bun.spawnSync(["unzip", "-Z1", wheelPath]).stdout.toString().split("\n");
  const specs = listing.filter((path) => /^botcortex\/platforms\/[^/]+\/platform\.json$/.test(path));
  const expected: { name: string; displayName: string }[] = [];
  for (const spec of specs) {
    const platform = JSON.parse(Bun.spawnSync(["unzip", "-p", wheelPath, spec]).stdout.toString()) as {
      name: string; display_name: string; sim?: { browser?: boolean; mjcf?: string; model_dir?: string };
    };
    const sim = platform.sim ?? {};
    const shipsModel = !!sim.mjcf && !sim.model_dir && listing.includes(`botcortex/platforms/${platform.name}/${sim.mjcf}`);
    if ((sim.browser ?? true) && shipsModel) expected.push({ name: platform.name, displayName: platform.display_name });
  }
  expected.sort((a, b) => a.name.localeCompare(b.name));
  expect([...manifest.catalog].sort((a, b) => a.name.localeCompare(b.name))).toEqual(expected);
  expect(manifest.catalog[0].name).toBe("openarm_v1");
});

test("the manifest's bodies are every platform in the wheel, with the descriptor's own numbers", () => {
  // The public registry lists EVERY body the runtime knows — arms, bimanual
  // rigs, and whatever comes next — not only the ones the browser can boot.
  const listing = Bun.spawnSync(["unzip", "-Z1", wheelPath]).stdout.toString().split("\n");
  const specs = listing.filter((path) => /^botcortex\/platforms\/[^/]+\/platform\.json$/.test(path));
  const expected = specs.map((spec) => {
    const platform = JSON.parse(Bun.spawnSync(["unzip", "-p", wheelPath, spec]).stdout.toString()) as {
      name: string; display_name: string; arms: string[];
      capabilities?: { positioning_joints?: number; bimanual?: boolean; reach_m?: number; kind?: string };
      sim?: { browser?: boolean; mjcf?: string; model_dir?: string };
    };
    const caps = platform.capabilities ?? {};
    const sim = platform.sim ?? {};
    const shipsModel = !!sim.mjcf && !sim.model_dir && listing.includes(`botcortex/platforms/${platform.name}/${sim.mjcf}`);
    return {
      name: platform.name,
      displayName: platform.display_name,
      kind: caps.kind ?? (caps.bimanual ? "bimanual" : "arm"),
      joints: caps.positioning_joints ?? 0,
      arms: platform.arms.length,
      reachM: caps.reach_m ?? 0,
      browser: (sim.browser ?? true) && shipsModel,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  expect([...manifest.bodies].sort((a, b) => a.name.localeCompare(b.name))).toEqual(expected);
  // The bootable catalog is the browser-capable subset, in the same order.
  expect(manifest.catalog.map((b) => b.name)).toEqual(manifest.bodies.filter((b) => b.browser).map((b) => b.name));
});

test("the manifest's provenance fields are filled in", () => {
  expect(manifest.platform).toBe("openarm_v1");
  expect(manifest.runtimeRepo).toBe("openhorizon-labs/botcortex-runtime");
  expect(manifest.runtimeCommit).toMatch(/^[0-9a-f]{40}$/);
  expect(Number.isNaN(Date.parse(manifest.recordedAt))).toBe(false);
});
