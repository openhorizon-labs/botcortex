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
  | "gripper"
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
  const contract = JSON.parse(raw) as AgentContract;
  if (!contract.system_prompt || !Array.isArray(contract.tools)) {
    throw new Error("agent_contract.json is malformed — is the wheel complete?");
  }
  return contract;
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
