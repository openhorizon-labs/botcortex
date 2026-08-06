/**
 * The transcript the browser sim hands its agent.
 *
 * "keep the red block back" only means something WITH the exchange it
 * answers — each teach is a fresh model conversation, and this rendering is
 * how the conversation reaches it. Mirrors agent.py's _transcript, pinned on
 * both sides so a robot and a browser read the same words the same way.
 */
import { expect, test } from "bun:test";

import { transcriptOf } from "@/lib/robot/browser-sim/transport";

test("no history, no block", () => {
  expect(transcriptOf(undefined)).toBe("");
  expect(transcriptOf([])).toBe("");
  expect(transcriptOf([{ role: "owner", text: "" }])).toBe("");
});

test("the conversation renders as Owner/Robot lines, in order", () => {
  const rendered = transcriptOf([
    { role: "owner", text: "Put the red block in the right tray" },
    { role: "robot", text: "The red block was placed in the right tray." },
    { role: "owner", text: "keep the red block back" },
  ]);
  expect(rendered).toContain("The conversation so far");
  expect(rendered).toContain("Owner: Put the red block in the right tray");
  expect(rendered).toContain("Robot: The red block was placed in the right tray.");
  expect(rendered.indexOf("Owner: Put the red block")).toBeLessThan(
    rendered.indexOf("Owner: keep the red block back"),
  );
  expect(rendered.endsWith("\n\n")).toBe(true);
});
