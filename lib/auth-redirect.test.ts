import { expect, test } from "bun:test";
import { signInDestination } from "./auth-redirect";

test("preserves the pairing code and task destination", () => {
  expect(signInDestination("/app/device?user_code=ABCD")).toBe("/app/device?user_code=ABCD");
  expect(signInDestination("/app/tasks/example")).toBe("/app/tasks/example");
});

test.each([null, "https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "/app/../../signin", "/signin", "/application"])("rejects a destination outside the app: %s", (raw) => {
  expect(signInDestination(raw)).toBe("/app");
});
