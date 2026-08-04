/**
 * The authoring loop for the browser sim: model call → tool calls → repeat.
 *
 * This is the ONE part of the agent that is genuinely reimplemented rather
 * than shared, and it is worth being clear about why. The loop's whole job is
 * to make network calls to a model, which Pyodide is a poor place to do — the
 * OpenAI SDK is built on sockets that do not exist in a browser. What the loop
 * decides, though — what the agent is told, which tools it may reach for, how
 * many turns it gets — is not decided here: it is read from
 * `agent_contract.json` inside the runtime's own wheel. So the thing that
 * forked is the plumbing, and the thing that matters did not.
 *
 * The tools themselves execute in Pyodide, against the same primitives and the
 * same restricted skill executor a real robot uses.
 *
 * Emits the same protocol events the WebSocket runtime emits, so the chat
 * pane, the tool trace and the sim view cannot tell the difference.
 */

import type { RobotMessage } from "@/lib/robot/protocol";
import { type AgentContract, toolsForOpenAI } from "@/lib/robot/agent/contract";
import { explain } from "@/lib/robot/agent/explain";

/** Runs one tool and returns whatever the runtime would have returned — a
 *  string, always, because that is what the model is handed back. */
export type ToolDispatch = (
  name: string,
  args: Record<string, unknown>,
) => Promise<string>;

export interface TeachOptions {
  contract: AgentContract;
  model: string;
  /** What the owner typed, already prefixed with any recalled episodes. */
  prompt: string;
  dispatch: ToolDispatch;
  emit: (event: RobotMessage) => void;
  /** Aborts the run — the STOP button, or the owner starting something else. */
  signal?: AbortSignal;
  /** Where inference goes. Cookie-authenticated; the browser holds no key. */
  endpoint?: string;
}

export interface TeachOutcome {
  text: string;
  outcome: "ok" | "fail";
  error?: string;
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/**
 * Some model families refuse function tools unless reasoning is switched off,
 * and others reject that value outright. The runtime learns which is which at
 * run time rather than carrying a list that goes stale (agent.py's
 * `_NEEDS_EFFORT_NONE`); the browser does the same, per session.
 */
const needsEffortNone = new Set<string>();

async function callModel(
  endpoint: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<any> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const text = await response.text();
  if (!response.ok) {
    // Carry the vendor's own words into the error so explain() can recognise
    // them; the owner never sees this string, only what explain() makes of it.
    throw new Error(`${response.status} ${text.slice(0, 400)}`);
  }
  return JSON.parse(text);
}

export async function teach({
  contract,
  model,
  prompt,
  dispatch,
  emit,
  signal,
  endpoint = "/api/inference/chat",
}: TeachOptions): Promise<TeachOutcome> {
  // Echoed back rather than assumed: an owner who picked an expensive model
  // and was quietly downgraded has been charged for something they did not
  // choose.
  emit({ type: "model", name: model, provider: "openai" });

  const tools = toolsForOpenAI(contract);
  const messages: ChatMessage[] = [
    { role: "system", content: contract.system_prompt },
    { role: "user", content: prompt },
  ];

  let text = "";
  try {
    for (let turn = 0; turn < contract.max_iterations; turn++) {
      if (signal?.aborted) {
        return { text: "Stopped.", outcome: "fail", error: "aborted" };
      }

      const request: Record<string, unknown> = { model, messages, tools };
      if (needsEffortNone.has(model)) request.reasoning_effort = "none";

      let data: any;
      try {
        data = await callModel(endpoint, request, signal);
      } catch (error) {
        // Learn the model's requirement once, then retry. Asking every model
        // for reasoning_effort:"none" upfront is not an option — the cheaper
        // families reject that value.
        const message = String(error);
        if (!needsEffortNone.has(model) && message.includes("reasoning_effort")) {
          needsEffortNone.add(model);
          request.reasoning_effort = "none";
          data = await callModel(endpoint, request, signal);
        } else {
          throw error;
        }
      }

      const choice = data.choices?.[0]?.message;
      if (!choice) return { text: "The agent produced no response.", outcome: "fail" };

      if (choice.content) {
        text = choice.content;
        emit({ type: "chat", text: choice.content });
      }

      const calls: ToolCall[] = choice.tool_calls ?? [];
      if (calls.length === 0) {
        return { text, outcome: "ok" };
      }

      messages.push({
        role: "assistant",
        content: choice.content ?? null,
        tool_calls: calls,
      });

      for (const call of calls) {
        // Checked per CALL, not just per turn. A model routinely asks for
        // several tools in one turn; aborting only at the top of the loop let
        // every remaining one dispatch after STOP, each moving the arm.
        if (signal?.aborted) {
          return { text: "Stopped.", outcome: "fail", error: "aborted" };
        }
        // Sequential, matching the runtime: two tools moving the same arm at
        // once is not something the primitives are built for, and the trace an
        // owner watches would interleave into nonsense.
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          /* a malformed arg list is the model's problem to fix; tell it so */
        }
        emit({ type: "tool", id: call.id, name: call.function.name, input: args });

        let result: string;
        let ok = true;
        try {
          result = await dispatch(call.function.name, args);
          // Tool bodies report failure by RETURNING it, not by throwing — the
          // model has to read what went wrong to repair it. Classified with
          // the runtime's own prefixes rather than a guess, or a failed call
          // shows "Completed" here and "Error" on a robot.
          ok = !(contract.failure_prefixes ?? []).some((prefix) => result.startsWith(prefix));
        } catch (error) {
          ok = false;
          // The MODEL gets the real error — it is the one that has to repair
          // the skill, and a friendly paraphrase would hide what broke.
          result = `error: ${error instanceof Error ? error.message : String(error)}`;
        }
        emit({ type: "tool_result", id: call.id, ok, result });
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
    }

    return {
      text: text || "Stopped after the iteration limit.",
      outcome: "ok",
    };
  } catch (error) {
    if (signal?.aborted) return { text: "Stopped.", outcome: "fail", error: "aborted" };
    // Full detail to the console for whoever is debugging; one actionable
    // sentence to the owner.
    console.error("[botcortex] teach failed", error);
    const friendly = explain(error);
    emit({ type: "chat", text: friendly });
    return { text: friendly, outcome: "fail", error: String(error) };
  }
}
