import { expect, test } from "bun:test";

import { gifSize } from "@/lib/gif";

test("a GIF keeps the canvas's aspect, never upscales, and has even sides", () => {
  expect(gifSize(1800, 1360, 480)).toEqual([480, 362]);
  // A canvas narrower than the target is not blown up to meet it.
  expect(gifSize(300, 200, 480)).toEqual([300, 200]);
  // Odd sizes round to even: some players mis-render odd-width GIFs.
  expect(gifSize(481, 333, 480)[0] % 2).toBe(0);
  // A canvas that has not been laid out yet produces nothing, not a crash.
  expect(gifSize(0, 0, 480)).toEqual([0, 0]);
});
