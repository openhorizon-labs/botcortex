import { expect, test } from "bun:test";

import { validateArguments } from "@/lib/robot/agent/schema";

const MOVE_TO = {
  type: "object",
  properties: {
    arm: { type: "string", enum: ["right", "left"] },
    targets: { type: "object", additionalProperties: { type: "number" } },
    duration: { type: ["number", "null"] },
    waypoints: { type: "array", items: { type: "object" } },
  },
  required: ["arm", "targets"],
};

test("well-formed arguments pass", () => {
  expect(validateArguments(MOVE_TO, { arm: "right", targets: { j1: 10 }, duration: null })).toBeNull();
  expect(validateArguments(MOVE_TO, { arm: "left", targets: {}, duration: 2, waypoints: [{}] })).toBeNull();
});

test("a missing required key is named", () => {
  expect(validateArguments(MOVE_TO, { arm: "right" })).toBe("arguments.targets is required");
});

test("a wrong type is named with what was received", () => {
  expect(validateArguments(MOVE_TO, { arm: 7, targets: {} })).toBe("arguments.arm must be string, got integer");
  expect(validateArguments(MOVE_TO, { arm: "right", targets: [] })).toBe("arguments.targets must be object, got array");
  expect(validateArguments(MOVE_TO, { arm: "right", targets: {}, waypoints: [1] })).toBe("arguments.waypoints[0] must be object, got integer");
});

test("enum membership is enforced", () => {
  expect(validateArguments(MOVE_TO, { arm: "middle", targets: {} })).toBe('arguments.arm must be one of "right", "left"');
});

test("integers satisfy number, and an absent schema judges nothing", () => {
  expect(validateArguments({ type: "number" }, 3)).toBeNull();
  expect(validateArguments({ type: "integer" }, 3.5)).toBe("arguments must be integer, got number");
  expect(validateArguments(undefined, "anything")).toBeNull();
});

test("additionalProperties: false rejects an unknown parameter", () => {
  expect(validateArguments({ type: "object", properties: { a: {} }, additionalProperties: false }, { a: 1, b: 2 }))
    .toBe("arguments.b is not a parameter of this tool");
});
