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
import { type JsonSchema, validateArguments } from "@/lib/robot/agent/schema";
import type { Fetcher } from "@/lib/robot/outbox";

/** Runs one tool and returns whatever the runtime would have returned — a
 *  string, always, because that is what the model is handed back. */
export type ToolDispatch = (
  name: string,
  args: Record<string, unknown>,
) => Promise<string>;

/** Why the robot may not call the task done — see RobotSession.unverified. */
export interface Pushback {
  /** What to tell the model, in words it can act on. */
  agent: string;
  /** What to tell the owner, if the model still cannot back its claim up. */
  owner: string;
  /** No version of this ends with the task done — a latched e-stop, say. The
   *  loop stops rather than arguing, which would only spend the owner's
   *  credit on turns that cannot move anything. */
  final?: boolean;
}

export interface TeachOptions {
  contract: AgentContract;
  model: string;
  /** What the owner typed, already prefixed with any recalled episodes. */
  prompt: string;
  dispatch: ToolDispatch;
  emit: (event: RobotMessage) => void;
  /**
   * Asks the runtime whether the task has actually been shown to work.
   *
   * The model does not get to decide it succeeded. This is the same
   * `RobotSession.unverified()` the runtime's own loop consults — a model that
   * saved a skill and never ran it, or whose last run was refused, is sent
   * back to work rather than believed. Optional only so tests can leave it
   * out; the transport always wires it.
   */
  verify?: () => Promise<Pushback | null>;
  /** Aborts the run — the STOP button, or the owner starting something else. */
  signal?: AbortSignal;
  /** Where inference goes. Cookie-authenticated; the browser holds no key. */
  endpoint?: string;
  fetcher?: Fetcher;
}

export interface TeachOutcome {
  text: string;
  outcome: "ok" | "fail";
  error?: string;
  /** What the inference api said actually served the run — null when it
   *  never answered, which is not the same as "the model that was asked for". */
  ranOn: { model: string; provider: string } | null;
}

/** The subset of a chat-completions reply the loop reads, checked at the
 *  boundary. The api is ours, but it forwards vendor envelopes, and a vendor
 *  that returns `tool_calls: null` or an id-less call used to crash the
 *  loop with a TypeError the owner saw as "teach failed" and nothing more. */
interface ModelReply {
  model: string | null;
  provider: string | null;
  content: string | null;
  toolCalls: ToolCall[];
}

function readReply(data: unknown): ModelReply {
  const record = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === "object" && !Array.isArray(value);
  if (!record(data)) throw new Error("The agent returned a malformed response (not an object).");
  const choice = Array.isArray(data.choices) && record(data.choices[0]) ? data.choices[0].message : undefined;
  if (!record(choice)) throw new Error("The agent produced no response.");
  const content = typeof choice.content === "string" ? choice.content : null;
  const rawCalls = choice.tool_calls ?? [];
  if (!Array.isArray(rawCalls)) throw new Error("The agent returned a malformed response (tool_calls).");
  const toolCalls = rawCalls.map((call, index): ToolCall => {
    const fn = record(call) ? call.function : undefined;
    if (!record(call) || typeof call.id !== "string" || !call.id || !record(fn) ||
        typeof fn.name !== "string" || typeof fn.arguments !== "string") {
      throw new Error(`The agent returned a malformed tool call (#${index + 1}).`);
    }
    return { id: call.id, type: "function", function: { name: fn.name, arguments: fn.arguments } };
  });
  return {
    model: typeof data.model === "string" ? data.model : null,
    provider: typeof data.provider === "string" ? data.provider : null,
    content,
    toolCalls,
  };
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
  fetcher: Fetcher,
  signal?: AbortSignal,
): Promise<any> {
  const response = await fetcher(endpoint, {
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
  verify,
  signal,
  endpoint = "/api/inference/chat",
  fetcher = (url, init) => fetch(url, init),
}: TeachOptions): Promise<TeachOutcome> {
  // Announced from the REPLY, never from the request: an owner who picked an
  // expensive model and was quietly routed to another has been charged for
  // something they did not choose, and a notice built from the request would
  // have told them the opposite. Until the api answers, nothing is claimed.
  let ranOn: TeachOutcome["ranOn"] = null;
  const attribute = (reply: ModelReply) => {
    if (ranOn) return;
    ranOn = { model: reply.model ?? model, provider: reply.provider ?? "openai" };
    emit({ type: "model", name: ranOn.model, provider: ranOn.provider });
  };

  const tools = toolsForOpenAI(contract);
  const schemaOf = new Map<string, JsonSchema>(
    contract.tools.map((tool) => [tool.name, tool.parameters as unknown as JsonSchema]),
  );
  const messages: ChatMessage[] = [
    { role: "system", content: contract.system_prompt },
    { role: "user", content: prompt },
  ];

  /**
   * The last word to the owner, checked against what the robot actually did.
   *
   * When the claim is unbacked the model's own words are NOT shown: it has
   * been told twice what was missing and is still saying otherwise, which
   * makes its account the least reliable thing available. And the outcome
   * carries "fail", which is what reaches `memory.log` — an attempt filed as a
   * success comes back out of recall_episodes as an example worth following.
   */
  const finish = (said: string, pushback: Pushback | null): TeachOutcome => {
    const spoken = (pushback ? pushback.owner : said).trim();
    if (spoken) emit({ type: "chat", text: spoken });
    return pushback
      ? { text: spoken, outcome: "fail", error: "unverified", ranOn }
      : { text: spoken, outcome: "ok", ranOn };
  };
  const stopped = (): TeachOutcome => ({ text: "Stopped.", outcome: "fail", error: "aborted", ranOn });

  let text = "";
  let followUps = contract.max_follow_ups ?? 2;
  try {
    for (let turn = 0; turn < contract.max_iterations; turn++) {
      if (signal?.aborted) return stopped();

      const request: Record<string, unknown> = { model, messages, tools };
      if (needsEffortNone.has(model)) request.reasoning_effort = "none";

      let data: any;
      try {
        data = await callModel(endpoint, request, fetcher, signal);
      } catch (error) {
        // Learn the model's requirement once, then retry. Asking every model
        // for reasoning_effort:"none" upfront is not an option — the cheaper
        // families reject that value.
        const message = String(error);
        if (!needsEffortNone.has(model) && message.includes("reasoning_effort")) {
          needsEffortNone.add(model);
          request.reasoning_effort = "none";
          data = await callModel(endpoint, request, fetcher, signal);
        } else {
          throw error;
        }
      }

      const reply = readReply(data);
      attribute(reply);

      if (reply.content) text = reply.content;

      const calls = reply.toolCalls;
      if (calls.length === 0) {
        // The model believes it is finished. Whether it is, is not its call —
        // hence nothing emitted above: "Done, the block is in the tray!" must
        // not reach the chat pane one turn before the robot is sent back to
        // try again.
        const pushback = (await verify?.()) ?? null;
        if (signal?.aborted) return stopped();
        if (pushback && followUps > 0 && !pushback.final) {
          followUps--;
          messages.push({ role: "assistant", content: reply.content ?? "" });
          messages.push({ role: "user", content: pushback.agent });
          continue;
        }
        return finish(text, pushback);
      }

      // A turn that also calls tools is the agent narrating its work, and goes
      // straight through to the owner.
      if (reply.content) emit({ type: "chat", text: reply.content });

      messages.push({
        role: "assistant",
        content: reply.content,
        tool_calls: calls,
      });

      for (const call of calls) {
        // Checked per CALL, not just per turn. A model routinely asks for
        // several tools in one turn; aborting only at the top of the loop let
        // every remaining one dispatch after STOP, each moving the arm.
        if (signal?.aborted) return stopped();
        // Sequential, matching the runtime: two tools moving the same arm at
        // once is not something the primitives are built for, and the trace an
        // owner watches would interleave into nonsense.
        let args: Record<string, unknown> = {};
        let argumentError: string | null = null;
        try {
          const parsed: unknown = JSON.parse(call.function.arguments);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("Tool arguments must be a JSON object.");
          }
          args = parsed as Record<string, unknown>;
        } catch {
          argumentError = "Tool arguments must be a valid JSON object. Correct the arguments and retry.";
        }
        emit({ type: "tool", id: call.id, name: call.function.name, input: args });

        let result: string;
        let ok = true;
        try {
          if (argumentError) throw new Error(argumentError);
          if (!schemaOf.has(call.function.name)) {
            throw new Error(`Tool ${call.function.name} is not offered by this runtime.`);
          }
          // Against the wheel's own schema, before the primitives see it. The
          // runtime still checks values (limits, arm names); this refuses the
          // SHAPES it would have had to throw on — a string where an object
          // was required never reaches a motion primitive.
          const shape = validateArguments(schemaOf.get(call.function.name), args);
          if (shape) throw new Error(`${shape}. Correct the arguments and retry.`);
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
        // report() IS the answer — the prompt says so — and some models call
        // it without writing any closing prose, which left every SUCCESSFUL
        // teach silent in the chat: the owner watched the arm move and was
        // never told what the robot believed it did. The summary becomes the
        // final text finish() speaks; a verification pushback still replaces
        // it, so an unbacked claim is no easier to make this way.
        if (
          call.function.name === "report" &&
          ok &&
          typeof args.summary === "string" &&
          args.summary.trim()
        ) {
          text = args.summary.trim();
        }
      }
    }

    // Out of turns. Checked too — running out of iterations is not evidence
    // that anything worked, and it used to be reported as a success.
    if (signal?.aborted) return stopped();
    const pushback = (await verify?.()) ?? null;
    if (signal?.aborted) return stopped();
    if (pushback) return finish(text, pushback);
    const limited = "Stopped after the iteration limit. Task completion was not confirmed.";
    emit({ type: "chat", text: limited });
    return { text: limited, outcome: "fail", error: "iteration_limit", ranOn };
  } catch (error) {
    if (signal?.aborted) return stopped();
    // Full detail to the console for whoever is debugging; one actionable
    // sentence to the owner.
    console.error("[botcortex] teach failed", error);
    const friendly = explain(error);
    emit({ type: "chat", text: friendly });
    return { text: friendly, outcome: "fail", error: String(error), ranOn };
  }
}
