import { expect, test } from "bun:test";

import { avatarSrc } from "./profile";

test("a generated avatar is loaded from our own cache, never hot-linked", () => {
  expect(avatarSrc("https://api.dicebear.com/9.x/bottts-neutral/svg?seed=0123456789abcdef")).toBe("/avatar/0123456789abcdef");
});

test("anything else is left alone, and nothing is not an image", () => {
  expect(avatarSrc("https://example.com/me.png")).toBe("https://example.com/me.png");
  // A seed that is not ours is not turned into a path on this site.
  expect(avatarSrc("https://api.dicebear.com/9.x/x/svg?seed=../../etc")).toBe("https://api.dicebear.com/9.x/x/svg?seed=../../etc");
  expect(avatarSrc(null)).toBeNull();
  expect(avatarSrc("")).toBeNull();
});

test("a full name is the parts that exist, with no stray space", async () => {
  const { fullName } = await import("./profile");
  expect(fullName({ firstName: "Ada", lastName: "Lovelace" })).toBe("Ada Lovelace");
  expect(fullName({ firstName: "Ada", lastName: "" })).toBe("Ada");
  expect(fullName({ firstName: "", lastName: "" })).toBe("");
});
