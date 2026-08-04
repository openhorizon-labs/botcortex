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

import {
  Tool,
  ToolContent,
  ToolHeader,
} from "@/components/ai-elements/tool";
import { CodeBlock } from "@/components/ai-elements/code-block";
import type { ToolCall } from "@/components/app/robot-provider";

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

export function ToolTrace({ call }: { call: ToolCall }) {
  const running = call.result === undefined;
  const failed = call.ok === false;
  const state = running
    ? ("input-available" as const)
    : failed
      ? ("output-error" as const)
      : ("output-available" as const);

  const { code, ...args } = call.input as { code?: string };
  const hasArgs = Object.keys(args).length > 0;

  return (
    <Tool defaultOpen={typeof code === "string"}>
      <ToolHeader
        type="dynamic-tool"
        toolName={call.name}
        title={describe(call)}
        state={state}
      />
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
