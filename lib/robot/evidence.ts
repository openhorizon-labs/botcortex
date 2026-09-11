/** A portable record of observed tool events, not a task-success certificate. */
export type EvidenceCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: string;
  ok?: boolean;
  at: number;
};

export function summarizeEvidence(calls: readonly EvidenceCall[]) {
  return {
    total: calls.length,
    completed: calls.filter((call) => call.result !== undefined && call.ok === true).length,
    failed: calls.filter((call) => call.ok === false).length,
    pending: calls.filter((call) => call.result === undefined && call.ok !== false).length,
    unknown: calls.filter((call) => call.result !== undefined && call.ok === undefined).length,
    lessonsRecorded: calls.filter((call) => call.name === "log_lesson" && call.ok === true && call.result !== undefined).length,
  };
}

export function createTaskEvidence(
  taskId: string | null,
  calls: readonly EvidenceCall[],
  exportedAt = new Date().toISOString(),
) {
  return {
    schemaVersion: 1,
    kind: "botcortex.task-evidence",
    taskId,
    exportedAt,
    scope: "loaded-task-trace",
    source: "browser-observed-or-rehydrated-tool-events",
    taskCompletion: "not-attested",
    limitations: [
      "Completed tool calls do not prove that the requested physical task succeeded.",
      "Only the trace currently loaded in this tab is included; missing events are not reconstructed.",
      "No runtime signature, scene snapshot, skill hash, or per-run robot identity is attached.",
    ],
    summary: summarizeEvidence(calls),
    calls: [...calls].sort((a, b) => a.at - b.at).map((call) => ({
      id: call.id,
      name: call.name,
      input: call.input,
      result: call.result ?? null,
      ok: call.ok ?? null,
      observedAtMs: call.at,
    })),
  };
}
