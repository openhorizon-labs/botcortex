import { expect, test } from "bun:test";

import { visitorSummary } from "./visitor-summary";

test("a moved block is reported without joints, ticks or coordinates", () => {
  const { text, ok } = visitorSummary(
    "The right arm swept j4 122°, j2 88°, j1 74° over 600 control ticks. Moved: blue_block moved 20 cm and is now on table, at [0.225, -0.225, 0.22].",
  );
  expect(text).toBe("The blue block moved 20 cm and ended up on the table.");
  expect(ok).toBe(true);
  expect(text).not.toMatch(/j\d|tick|\[/);
});

test("several objects are joined into one sentence, and where each landed is kept", () => {
  const { text } = visitorSummary(
    "The arm swept j1 40° over 900 control ticks. Moved: red_block moved 31 cm and is now on tray_right, at [0.3, 0.1, 0.23]; green_block moved 12 cm and is now off the workcell entirely, at [1, 1, 0].",
  );
  expect(text).toBe("The red block moved 31 cm and ended up in the right tray and the green block moved 12 cm and fell off the workcell.");
});

test("an arm-only skill says the arm moved and the table is untouched", () => {
  expect(visitorSummary("It ran: the right arm swept j1 60° over 300 control ticks. Nothing on the table moved.").text)
    .toBe("The arm ran the whole motion. Nothing on the table was touched.");
});

test("a refusal passes through unchanged and is not a success", () => {
  const said = "It didn't run — it would have hit the table.";
  expect(visitorSummary(said)).toEqual({ text: said, ok: false });
});
