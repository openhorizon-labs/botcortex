/** Browser-smoke prerequisites shared by audit-smoke and review-smoke. */
import { createConnection } from "node:net";

export const FIXTURE_HEADER = "x-botcortex-smoke-fixture";

/** macOS can let an IPv4 fixture coexist with an IPv6 API on the same port.
 * Check BOTH families before creating the fixture or starting Chrome. A bind
 * probe is insufficient: a specific-address listener can coexist with an
 * existing wildcard listener on macOS. Connect without sending any HTTP/data. */
export async function assertFixturePortAvailable(port = 8787): Promise<void> {
  for (const host of ["127.0.0.1", "::1"]) {
    const occupied = await new Promise<boolean>((resolve, reject) => {
      const socket = createConnection({ host, port });
      let settled = false;
      const finish = (inUse: boolean, error?: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) reject(error); else resolve(inUse);
      };
      socket.setTimeout(1000, () => finish(false, new Error(`Timed out checking smoke port ${port} on ${host}; refusing to start.`)));
      socket.once("connect", () => finish(true));
      socket.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "ECONNREFUSED" || (host === "::1" && ["EAFNOSUPPORT", "EADDRNOTAVAIL", "ENETUNREACH"].includes(error.code ?? ""))) {
          finish(false);
        } else {
          finish(false, new Error(`Cannot check smoke fixture port ${port} on ${host}: ${error.code ?? "unknown error"}`));
        }
      });
    });
    if (occupied) {
      throw new Error(`Smoke fixture port ${port} is already in use on ${host}. Stop botcortex-api (and any other fixture) before running audit-smoke or review-smoke.`);
    }
  }
}

/** Catch a wrong API_URL, stale dev-server rewrites, or a listener starting
 * between preflight and bind. A bare 200/401 does not establish fixture identity. */
export async function assertFixtureRouting(base: string, fixtureId: string, cookie: string) {
  const response = await fetch(`${base}/api/me`, {
    headers: { cookie },
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
  });
  if (response.headers.get(FIXTURE_HEADER) !== fixtureId) {
    throw new Error(`The dev server at ${base} is not routing /api/me to this smoke fixture (HTTP ${response.status}). Set API_URL=http://localhost:8787, restart bun dev, and stop the real API before retrying.`);
  }
}

/** Browser requests may never happen after a redirect or hydration failure. */
export async function waitForFixtureRequest<T>(promise: Promise<T>, label: string, timeoutMs = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Smoke timed out waiting for ${label}. Check API_URL, port 8787, and the browser page.`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
