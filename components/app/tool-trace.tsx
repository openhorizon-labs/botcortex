"use client";

/**
 * What the agent actually did, as it does it.
 *
 * A teach used to be a spinner followed by a sentence. This shows the reach
 * into the runtime — reading joints, recalling past failures, writing a skill,
 * running it, repairing it — which is both the interesting part and the honest
 * one: the generated code is right there rather than behind a curtain.
 *
 * Only the CODE gets a syntax highlighter. AI Elements' ToolInput/ToolOutput
 * push everything through a JSON CodeBlock, which rendered as empty boxes here
 * — and colouring a one-line result was never the point. Arguments and results
 * are plain text, which cannot fail to draw.
 */

import { Tool, ToolContent } from "@/components/ai-elements/tool";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { Badge } from "@/components/ui/badge";
import { CollapsibleTrigger } from "@/components/ui/collapsible";
import type { ToolCall } from "@/components/app/robot-provider";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  TriangleAlertIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";

/** Plain-language labels — these are robot owners, not programmers. */
function describe(call: ToolCall): string {
  const input = call.input as Record<string, string | undefined>;
  switch (call.name) {
    case "get_positions":
      return `Reading the ${input.arm} arm`;
    case "move_to":
      return `Moving the ${input.arm} arm`;
    case "gripper":
      return `Setting the ${input.arm} gripper`;
    case "list_skills":
      return "Checking what it already knows";
    case "save_skill":
      return `Writing “${input.name}”`;
    case "run_skill":
      return `Trying “${input.name}”`;
    case "recall_episodes":
      return "Recalling past attempts";
    case "log_lesson":
      return "Noting what went wrong";
    default:
      return call.name;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </h4>
      {children}
    </div>
  );
}

/**
 * The vendored ToolHeader maps every finished call to a green "Completed" —
 * which put ✅ beside "Noting what went wrong" after a failed task, and Sai
 * read it exactly the way anyone would: as the UI saying everything went
 * fine. Recording a failure is a step that WORKS while meaning bad news, so
 * it gets its own amber badge. Local copy of the header layout rather than
 * an edit to ai-elements, same reasoning as the CodeBlock override below.
 */
function badge(call: ToolCall) {
  if (call.result === undefined) {
    return (
      <>
        <ClockIcon className="size-4 animate-pulse" /> Running
      </>
    );
  }
  if (call.ok === false) {
    return (
      <>
        <XCircleIcon className="size-4 text-red-600" /> Error
      </>
    );
  }
  if (call.name === "log_lesson") {
    return (
      <>
        <TriangleAlertIcon className="size-4 text-amber-600" /> Lesson recorded
      </>
    );
  }
  return (
    <>
      <CheckCircleIcon className="size-4 text-green-600" /> Completed
    </>
  );
}

export function ToolTrace({ call }: { call: ToolCall }) {
  const failed = call.ok === false;
  const { code, ...args } = call.input as { code?: string };
  const hasArgs = Object.keys(args).length > 0;

  return (
    <Tool defaultOpen={typeof code === "string"}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 p-3">
        <div className="flex items-center gap-2">
          <WrenchIcon className="size-4 text-muted-foreground" />
          <span className="font-medium text-sm">{describe(call)}</span>
          <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
            {badge(call)}
          </Badge>
        </div>
        <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <ToolContent>
        <div className="space-y-3 p-4">
          {typeof code === "string" && (
            <Field label="Skill">
              {/* Wrapped, not scrolled. The skill is the product's main
                  artifact and roughly two thirds of it sat outside the
                  viewport: the block DID scroll horizontally, but macOS
                  overlay scrollbars leave no visible affordance, so every
                  ctx.move_to line simply ended mid-argument. Overriding the
                  vendored CodeBlock's <pre> here rather than editing it keeps
                  ai-elements re-syncable. */}
              <div className="[&_pre]:whitespace-pre-wrap [&_pre]:break-words">
                <CodeBlock code={code} language="python" />
              </div>
            </Field>
          )}

          {hasArgs && (
            <Field label={typeof code === "string" ? "Saved as" : "Arguments"}>
              <dl className="grid gap-1 text-xs">
                {Object.entries(args).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <dt className="shrink-0 text-muted-foreground">{key}</dt>
                    <dd className="min-w-0 truncate font-mono">
                      {typeof value === "string" ? value : JSON.stringify(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </Field>
          )}

          {call.result !== undefined && (
            <Field label={failed ? "Error" : "Result"}>
              <pre
                className={
                  "max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-3 p-2.5 font-mono text-xs " +
                  (failed ? "text-destructive" : "")
                }
              >
                {call.result}
              </pre>
            </Field>
          )}
        </div>
      </ToolContent>
    </Tool>
  );
}
