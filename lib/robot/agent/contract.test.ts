import { expect, test } from "bun:test";

import { contractProblem, parseContract } from "@/lib/robot/agent/contract";

const GOOD = {
  version: "0.0.1",
  system_prompt: "You are BotCortex.",
  max_iterations: 20,
  max_follow_ups: 2,
  failure_prefixes: ["error:"],
  tools: [{ name: "move_to", description: "Move.", parameters: { type: "object", properties: {} } }],
};

test("the shipped wheel's contract passes", async () => {
  const raw = Bun.spawnSync(["unzip", "-p", "public/botcortex/botcortex-0.0.1-py3-none-any.whl", "botcortex/agent_contract.json"]).stdout.toString();
  expect(contractProblem(JSON.parse(raw))).toBeNull();
  expect(parseContract(raw).tools.length).toBeGreaterThan(0);
});

test.each<[string, unknown]>([
  ["not an object", []],
  ["version missing", { ...GOOD, version: 1 }],
  ["system_prompt missing", { ...GOOD, system_prompt: "  " }],
  ["max_iterations must be an integer between 1 and 500", { ...GOOD, max_iterations: "20" }],
  ["max_follow_ups must be an integer between 0 and 20", { ...GOOD, max_follow_ups: -1 }],
  ["failure_prefixes must be non-empty strings", { ...GOOD, failure_prefixes: [""] }],
  ["tools missing", { ...GOOD, tools: [] }],
  ['tool name "Move To" is invalid', { ...GOOD, tools: [{ ...GOOD.tools[0], name: "Move To" }] }],
  ["tool move_to is listed twice", { ...GOOD, tools: [GOOD.tools[0], GOOD.tools[0]] }],
  ["tool move_to has no object parameter schema", { ...GOOD, tools: [{ ...GOOD.tools[0], parameters: { type: "string" } }] }],
])("names the problem: %s", (problem, contract) => {
  expect(contractProblem(contract)).toBe(problem);
  expect(() => parseContract(JSON.stringify(contract))).toThrow(problem);
});

test("malformed JSON is named as such", () => {
  expect(() => parseContract("{")).toThrow("not JSON");
});
