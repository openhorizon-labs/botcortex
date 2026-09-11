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

test("the manifest's provenance fields are filled in", () => {
  expect(manifest.platform).toBe("openarm_v1");
  expect(manifest.runtimeRepo).toBe("openhorizon-labs/botcortex-runtime");
  expect(manifest.runtimeCommit).toMatch(/^[0-9a-f]{40}$/);
  expect(Number.isNaN(Date.parse(manifest.recordedAt))).toBe(false);
});
