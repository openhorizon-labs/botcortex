import { afterEach, expect, mock, test } from "bun:test";
import { createServer, type Server } from "node:net";
import { assertFixturePortAvailable, assertFixtureRouting, FIXTURE_HEADER, waitForFixtureRequest } from "./smoke-fixture";

const realFetch = globalThis.fetch;
const listeners: Server[] = [];
afterEach(async () => {
  globalThis.fetch = realFetch;
  await Promise.all(listeners.splice(0).filter(server => server.listening).map(server =>
    new Promise<void>(resolve => server.close(() => resolve())),
  ));
});

async function listen(host: string) {
  const server = createServer(socket => socket.destroy());
  listeners.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host, port: 0, ipv6Only: host.includes(":") }, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No TCP listener address");
  return { server, port: address.port };
}

test.each(["127.0.0.1", "::1", "0.0.0.0", "::"])("an existing %s API listener is refused and left running", async host => {
  const { server, port } = await listen(host);
  const loopback = host === "::" ? "::1" : host === "0.0.0.0" ? "127.0.0.1" : host;
  await expect(assertFixturePortAvailable(port)).rejects.toThrow(`already in use on ${loopback}`);
  expect(server.listening).toBe(true);
});

test("available-port probes release both families after checking", async () => {
  const { server, port } = await listen("127.0.0.1");
  await new Promise<void>(resolve => server.close(() => resolve()));
  await assertFixturePortAvailable(port);
  // A second preflight fails if the first leaked either listener.
  await assertFixturePortAvailable(port);
});

test("a successful response from the wrong API is rejected", async () => {
  globalThis.fetch = mock(async () => Response.json({ user: { id: "real-api" } })) as unknown as typeof fetch;
  await expect(assertFixtureRouting("http://localhost:3000", "this-run", "fixture-cookie")).rejects.toThrow("not routing");
});

test("the fixture identity must match this exact run", async () => {
  globalThis.fetch = mock(async () => Response.json({}, { headers: { [FIXTURE_HEADER]: "this-run" } })) as unknown as typeof fetch;
  await expect(assertFixtureRouting("http://localhost:3000", "this-run", "fixture-cookie")).resolves.toBeUndefined();
  await expect(assertFixtureRouting("http://localhost:3000", "previous-run", "fixture-cookie")).rejects.toThrow("not routing");
});

test("missing fixture requests fail instead of hanging forever", async () => {
  await expect(waitForFixtureRequest(new Promise(() => {}), "history request", 5)).rejects.toThrow("waiting for history request");
  await expect(waitForFixtureRequest(Promise.resolve("loaded"), "history request", 5)).resolves.toBe("loaded");
});
