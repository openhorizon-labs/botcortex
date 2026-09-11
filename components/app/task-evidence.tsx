"use client";

import { Download, FileCheck2 } from "lucide-react";
import { useRobot } from "@/components/app/robot-provider";
import { createTaskEvidence, summarizeEvidence } from "@/lib/robot/evidence";
import { Button } from "@/components/ui/button";

export function TaskEvidence() {
  const { toolCalls, conversationId } = useRobot();
  if (!toolCalls.length) return null;
  const summary = summarizeEvidence(toolCalls);

  function download() {
    const evidence = createTaskEvidence(conversationId, toolCalls);
    const url = URL.createObjectURL(new Blob([JSON.stringify(evidence, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "botcortex-task-evidence.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section aria-label="Task evidence" className="rounded-xl border border-border bg-surface-2 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-medium"><FileCheck2 className="size-3.5" /> Task evidence</h2>
        <Button variant="outline" size="sm" onClick={download}>
          <Download className="size-3.5" /> Download evidence
        </Button>
      </div>
      <p className="mt-2 text-muted-foreground">
        {summary.completed} tool calls completed · {summary.failed} failed · {summary.pending} awaiting results
        {summary.unknown > 0 && ` · ${summary.unknown} outcomes unknown`}
        {summary.lessonsRecorded > 0 && ` · ${summary.lessonsRecorded} lessons recorded`}
      </p>
      <p className="mt-1 text-muted-foreground">Tool results are evidence, not proof of task completion. The export includes loaded arguments, generated code, and results.</p>
    </section>
  );
}
