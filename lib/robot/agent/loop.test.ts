/**
 * The browser's authoring loop, against a stub model.
 *
 * No network, no Pyodide, no MuJoCo. What is under test is the plumbing that
 * had to be rewritten in TypeScript — turn taking, tool dispatch, the retry
 * that learns a model's reasoning_effort requirement, and that a failure
 * reaches the owner as a sentence rather than a stack trace.
 */
import { afterEach, expect, mock, test } from "bun:test";

import type { RobotMessage } from "@/lib/robot/protocol";
import type { AgentContract } from "@/lib/robot/agent/contract";
import { teach } from "@/lib/robot/agent/loop";

const CONTRACT: AgentContract = {
  version: "0.0.1",
  system_prompt: "You are BotCortex. Never in the control loop.",
  max_iterations: 5,
  tools: [
    {
      name: "move_to",
      description: "Move an arm.",
      parameters: { type: "object", properties: { arm: { type: "string" } } },
    },
    {
      name: "save_skill",
      description: "Save a skill.",
      parameters: { type: "object", properties: { name: { type: "string" } } },
    },
  ],
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Replies in order; each entry is one assistant turn. */
function stubModel(turns: any[], onRequest?: (body: any) => void) {
  let i = 0;
  globalThis.fetch = mock(async (_url: any, init: any) => {
    onRequest?.(JSON.parse(init.body));
    const message = turns[Math.min(i++, turns.length - 1)];
    return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
  }) as any;
}

const collect = () => {
  const events: RobotMessage[] = [];
  return { events, emit: (e: RobotMessage) => events.push(e) };
};

test("a plain reply ends the run and reaches the owner", async () => {
  stubModel([{ content: "Taught it to wave." }]);
  const { events, emit } = collect();
  const result = await teach({
    contract: CONTRACT,
    model: "gpt-5.6-luna",
    prompt: "wave",
    dispatch: async () => "",
    emit,
  });

  expect(result.outcome).toBe("ok");
  expect(result.text).toBe("Taught it to wave.");
  expect(events.some((e) => e.type === "chat" && e.text === "Taught it to wave.")).toBe(true);
});

test("the model that was asked for is the one announced", async () => {
  stubModel([{ content: "done" }]);
  const { events, emit } = collect();
  await teach({
    contract: CONTRACT,
    model: "gpt-5.6-sol",
    prompt: "x",
    dispatch: async () => "",
    emit,
  });
  const announced = events.find((e) => e.type === "model");
  expect(announced).toEqual({ type: "model", name: "gpt-5.6-sol", provider: "openai" });
});

test("tool calls are dispatched and fed back, then the loop continues", async () => {
  stubModel([
    {
      content: null,
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "move_to", arguments: '{"arm":"right"}' },
        },
      ],
    },
    { content: "Arm moved." },
  ]);
  const calls: Array<[string, Record<string, unknown>]> = [];
  const { events, emit } = collect();

  const result = await teach({
    contract: CONTRACT,
    model: "gpt-5.6-luna",
    prompt: "move it",
    dispatch: async (name, args) => {
      calls.push([name, args]);
      return "moved; now at {}";
    },
    emit,
  });

  expect(calls).toEqual([["move_to", { arm: "right" }]]);
  expect(result.outcome).toBe("ok");
  // The owner watches the agent work — both halves of the trace are emitted.
  expect(events.some((e) => e.type === "tool" && e.name === "move_to")).toBe(true);
  const finished = events.find((e) => e.type === "tool_result");
  expect(finished).toMatchObject({ type: "tool_result", id: "call_1", ok: true });
});

test("a failing tool tells the MODEL what broke, and does not end the run", async () => {
  stubModel([
    {
      content: null,
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "save_skill", arguments: "{}" },
        },
      ],
    },
    { content: "Fixed it." },
  ]);
  const { events, emit } = collect();
  const sent: any[] = [];
  globalThis.fetch = ((original) =>
    mock(async (url: any, init: any) => {
      sent.push(JSON.parse(init.body));
      return original(url, init);
    }))(globalThis.fetch) as any;

  const result = await teach({
    contract: CONTRACT,
    model: "gpt-5.6-luna",
    prompt: "save",
    dispatch: async () => {
      throw new Error("SyntaxError: unexpected indent on line 3");
    },
    emit,
  });

  expect(result.outcome).toBe("ok");
  const failed = events.find((e) => e.type === "tool_result");
  expect(failed).toMatchObject({ ok: false });
  // Verbatim, not paraphrased: the model is the one that has to repair it.
  expect((failed as any).result).toContain("unexpected indent");
});

test("it stops at the iteration limit rather than looping forever", async () => {
  // A model that only ever asks for another tool call.
  stubModel([
    {
      content: null,
      tool_calls: [
        { id: "c", type: "function", function: { name: "move_to", arguments: "{}" } },
      ],
    },
  ]);
  const { events, emit } = collect();
  const result = await teach({
    contract: { ...CONTRACT, max_iterations: 3 },
    model: "gpt-5.6-luna",
    prompt: "loop",
    dispatch: async () => "ok",
    emit,
  });

  expect(result.outcome).toBe("ok");
  expect(events.filter((e) => e.type === "tool").length).toBe(3);
});

test("it learns a model's reasoning_effort requirement once, then retries", async () => {
  const bodies: any[] = [];
  let first = true;
  globalThis.fetch = mock(async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    if (first) {
      first = false;
      return new Response("Function tools with reasoning_effort are not supported", {
        status: 400,
      });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
      status: 200,
    });
  }) as any;

  const { emit } = collect();
  const result = await teach({
    contract: CONTRACT,
    model: "gpt-5.6-terra",
    prompt: "x",
    dispatch: async () => "",
    emit,
  });

  expect(result.outcome).toBe("ok");
  expect(bodies[0].reasoning_effort).toBeUndefined();
  expect(bodies[1].reasoning_effort).toBe("none");
});

test("a vendor failure reaches the owner as a sentence, not a stack trace", async () => {
  globalThis.fetch = mock(
    async () =>
      new Response(JSON.stringify({ error: { type: "insufficient_credit" } }), { status: 402 }),
  ) as any;

  const { events, emit } = collect();
  const result = await teach({
    contract: CONTRACT,
    model: "gpt-5.6-luna",
    prompt: "x",
    dispatch: async () => "",
    emit,
  });

  expect(result.outcome).toBe("fail");
  const said = events.filter((e) => e.type === "chat").map((e: any) => e.text).join(" ");
  expect(said).toContain("Out of BotCortex credit");
  expect(said).not.toContain("402");
  expect(said).not.toContain("insufficient_credit");
});

test("aborting stops the run without pretending it succeeded", async () => {
  const controller = new AbortController();
  stubModel([
    {
      content: null,
      tool_calls: [
        { id: "c", type: "function", function: { name: "move_to", arguments: "{}" } },
      ],
    },
  ]);
  const { emit } = collect();
  const result = await teach({
    contract: CONTRACT,
    model: "gpt-5.6-luna",
    prompt: "x",
    dispatch: async () => {
      controller.abort();
      return "ok";
    },
    emit,
    signal: controller.signal,
  });

  expect(result.outcome).toBe("fail");
  expect(result.error).toBe("aborted");
});

test("the system prompt sent is the runtime's, verbatim", async () => {
  let seen: any = null;
  stubModel([{ content: "ok" }], (body) => (seen = body));
  const { emit } = collect();
  await teach({
    contract: CONTRACT,
    model: "gpt-5.6-luna",
    prompt: "the task",
    dispatch: async () => "",
    emit,
  });

  expect(seen.messages[0]).toEqual({ role: "system", content: CONTRACT.system_prompt });
  expect(seen.messages[1]).toEqual({ role: "user", content: "the task" });
  // The tools offered are the contract's, in the vendor's envelope.
  expect(seen.tools.map((t: any) => t.function.name)).toEqual(["move_to", "save_skill"]);
});
