import { expect, test } from "bun:test";

import { newlyProven } from "@/lib/robot/proven";

test("a skill is 'just proven' only when it leaves the unproven list while still existing", () => {
  // Saved, then ran: the moment worth sharing.
  expect(newlyProven(["wave"], ["wave", "nod"], [])).toBe("wave");
  // Still unproven after a failed run: nothing to share.
  expect(newlyProven(["wave"], ["wave"], ["wave"])).toBeNull();
  // Deleted, not proven: leaving the list by disappearing is not a success.
  expect(newlyProven(["wave"], ["nod"], [])).toBeNull();
  // Connecting to a robot that already knows forty skills announces none of them.
  expect(newlyProven(null, ["wave", "nod"], [])).toBeNull();
  // Re-teaching drops the proof; earning it back is a new success.
  expect(newlyProven(["nod"], ["wave", "nod"], [])).toBe("nod");
});
