/**
 * The agent's instructions and reach, loaded from the runtime's own wheel.
 *
 * Nothing here is authored. `botcortex/agent_contract.json` is exported from
 * the Python that drives a real robot and shipped inside the wheel Pyodide
 * installs, so the browser agent is told exactly what a robot's agent is told —
 * the same safety rules, the same joint limits, the same tools.
 *
 * The temptation this file exists to refuse is pasting the system prompt into
 * TypeScript "just to get started". Two prompts diverge the first time someone
 * edits one, and the divergence is invisible: both agents keep working, one of
 * them just believes something slightly different about what it may do to a
 * robot arm.
 */

/** One tool, in the shape OpenAI's function calling wants. */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface AgentContract {
  /** The wheel release this came from — pinned, so a mismatch is diagnosable. */
  version: string;
  system_prompt: string;
  max_iterations: number;
  /** How many times a model that claims it is finished without evidence gets
   *  sent back to work. From the runtime for the same reason the prompt is: a
   *  browser that pushed back a different number of times would be a
   *  differently strict robot wearing the same name. */
  max_follow_ups?: number;
  /** How a tool reports failure IN ITS RETURN VALUE rather than by raising.
   *  Comes from the runtime because the runtime owns the convention: without
   *  it this loop marked every call ok, so a failed one wore a green
   *  "Completed" badge here while the same call showed an error on a robot. */
  failure_prefixes?: string[];
  tools: ToolSchema[];
}

/** The tools the runtime offers, named once so a typo is a type error. */
export type ToolName =
  | "get_positions"
  | "move_to"
  | "can_reach"
  | "move_to_point"
  | "report"
  | "gripper"
  | "describe_scene"
  | "list_skills"
  | "save_skill"
  | "run_skill"
  | "recall_episodes"
  | "log_lesson";

/**
 * Read the contract out of the installed package.
 *
 * Takes a reader rather than fetching, because the file lives in Pyodide's
 * filesystem after micropip installs the wheel — there is no URL for it, and
 * inventing one would mean a second copy served separately, which is the whole
 * thing being avoided.
 */
export function parseContract(raw: string): AgentContract {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("agent_contract.json is not JSON — is the wheel complete?");
  }
  const problem = contractProblem(parsed);
  if (problem) throw new Error(`agent_contract.json is malformed (${problem}) — is the wheel complete?`);
  return parsed as AgentContract;
}

/**
 * Every field the loop will read, checked before the loop can read it.
 *
 * A contract that merely "has a prompt and a tools array" used to pass, so a
 * wheel with `max_iterations: "20"` or a tool without a schema booted fine
 * and failed on the first teach — after the owner had typed a task and the
 * model had been billed for a turn. Fail at boot instead, naming the field.
 */
export function contractProblem(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "not an object";
  const contract = value as Record<string, unknown>;
  if (typeof contract.version !== "string" || !contract.version) return "version missing";
  if (typeof contract.system_prompt !== "string" || !contract.system_prompt.trim()) return "system_prompt missing";
  if (!Number.isInteger(contract.max_iterations) || (contract.max_iterations as number) < 1 || (contract.max_iterations as number) > 500) {
    return "max_iterations must be an integer between 1 and 500";
  }
  if (contract.max_follow_ups !== undefined &&
      (!Number.isInteger(contract.max_follow_ups) || (contract.max_follow_ups as number) < 0 || (contract.max_follow_ups as number) > 20)) {
    return "max_follow_ups must be an integer between 0 and 20";
  }
  if (contract.failure_prefixes !== undefined &&
      (!Array.isArray(contract.failure_prefixes) || !contract.failure_prefixes.every((p) => typeof p === "string" && p))) {
    return "failure_prefixes must be non-empty strings";
  }
  if (!Array.isArray(contract.tools) || contract.tools.length === 0) return "tools missing";
  const seen = new Set<string>();
  for (const tool of contract.tools as unknown[]) {
    if (!tool || typeof tool !== "object") return "a tool is not an object";
    const { name, description, parameters } = tool as Record<string, unknown>;
    if (typeof name !== "string" || !/^[a-z][a-z0-9_]*$/.test(name)) return `tool name ${JSON.stringify(name)} is invalid`;
    if (seen.has(name)) return `tool ${name} is listed twice`;
    seen.add(name);
    if (typeof description !== "string") return `tool ${name} has no description`;
    if (!parameters || typeof parameters !== "object" || (parameters as Record<string, unknown>).type !== "object" ||
        typeof (parameters as Record<string, unknown>).properties !== "object") {
      return `tool ${name} has no object parameter schema`;
    }
  }
  return null;
}

/** OpenAI's chat-completions tool shape. The contract stores the schema; this
 *  is only the envelope that vendor wants it in. */
export function toolsForOpenAI(contract: AgentContract) {
  return contract.tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}
