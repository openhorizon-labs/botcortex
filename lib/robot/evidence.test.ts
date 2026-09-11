import { expect, test } from "bun:test";
import { createTaskEvidence, summarizeEvidence, type EvidenceCall } from "./evidence";

const call = (overrides: Partial<EvidenceCall>): EvidenceCall => ({ id: "one", name: "run_skill", input: {}, at: 1, ...overrides });

test("a recorded lesson is not counted as task success", () => {
  const calls = [call({ ok: false, result: "error: slipped" }), call({ id: "two", name: "log_lesson", ok: true, result: "saved" })];
  const evidence = createTaskEvidence("task", calls);
  expect(evidence.summary).toMatchObject({ completed: 1, failed: 1, lessonsRecorded: 1 });
  expect(evidence.taskCompletion).toBe("not-attested");
});

test("missing results and unknown legacy verdicts are never counted as completed", () => {
  expect(summarizeEvidence([call({}), call({ result: "legacy output" })])).toMatchObject({ completed: 0, pending: 1, unknown: 1 });
});

test("export is ordered, versioned, portable and does not mutate the trace", () => {
  const calls = [call({ at: 2, id: "two", input: { code: "def run(ctx): pass" }, result: "saved", ok: true }), call({ at: 1 })];
  const exported = JSON.parse(JSON.stringify(createTaskEvidence("task", calls, "2026-09-11T00:00:00.000Z")));
  expect(exported.schemaVersion).toBe(1);
  expect(exported.calls.map((c: { id: string }) => c.id)).toEqual(["one", "two"]);
  expect(exported.calls[0].ok).toBeNull();
  expect(exported.calls[1].input.code).toBe("def run(ctx): pass");
  expect(calls[0].id).toBe("two");
  expect(exported.scope).toBe("loaded-task-trace");
});
