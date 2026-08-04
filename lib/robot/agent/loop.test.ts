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

// --- the gate on saying "done" ---------------------------------------------
//
// Reported by the owner: "even if the agent is not able to perform something
// properly it says the work is done and writes a skill". The loop believed it,
// returned outcome "ok", and that value goes on to memory.log — so the attempt
// where the arm ended up in the table was filed as a success and would come
// back out of recall_episodes as an example worth following.
//
// The rule itself lives in the runtime (RobotSession.unverified) and is asked
// across the worker boundary. What is under test here is that this loop
// actually asks, and what it does with the answer.

const UNVERIFIED = {
  agent: "Do not stop here. You saved nod but never ran it.",
  owner: "The robot wrote that skill but never tried it, so I can't say it works.",
};

test("a model that claims done without evidence is sent back to work", async () => {
  const bodies: any[] = [];
  stubModel(
    [{ content: "All done!" }, { content: "Ran it — the block is in the tray." }],
    (body) => bodies.push(body),
  );
  const { emit } = collect();
  let asked = 0;
  const result = await teach({
    contract: CONTRACT,
    model: "gpt-5.6-luna",
    prompt: "x",
    dispatch: async () => "",
    emit,
    verify: async () => (asked++ === 0 ? UNVERIFIED : null),
  });

  expect(asked).toBe(2);
  expect(result.outcome).toBe("ok");
  expect(result.text).toBe("Ran it — the block is in the tray.");
  // The pushback reached the model as a user turn, in the runtime's own words.
  const sent = bodies[bodies.length - 1].messages;
  expect(sent.some((m: any) => m.role === "user" && m.content === UNVERIFIED.agent)).toBe(true);
});

test("a claim that never gets backed up fails the task", async () => {
  stubModel([{ content: "Done!" }]);
  const { emit } = collect();
  const result = await teach({
    contract: { ...CONTRACT, max_follow_ups: 2 },
    model: "gpt-5.6-luna",
    prompt: "x",
    dispatch: async () => "",
    emit,
    verify: async () => UNVERIFIED,
  });

  // outcome "fail" is the line that matters: it is what reaches memory.log.
  expect(result.outcome).toBe("fail");
  expect(result.error).toBe("unverified");
  expect(result.text).toBe(UNVERIFIED.owner);
});

test("the owner never hears a claim the robot could not back up", async () => {
  stubModel([{ content: "Done!" }]);
  const { events, emit } = collect();
  await teach({
    contract: CONTRACT,
    model: "gpt-5.6-luna",
    prompt: "x",
    dispatch: async () => "",
    emit,
    verify: async () => UNVERIFIED,
  });

  const said = events.filter((e) => e.type === "chat").map((e: any) => e.text);
  expect(said).not.toContain("Done!");
  expect(said).toContain(UNVERIFIED.owner);
});

test("narration during tool use still reaches the owner", async () => {
  // Only the FINAL claim waits for the check. Deferring the running commentary
  // too would leave the chat pane silent for the whole teach.
  stubModel([
    {
      content: "Looking at the table first.",
      tool_calls: [{ id: "1", type: "function", function: { name: "move_to", arguments: "{}" } }],
    },
    { content: "Done." },
  ]);
  const { events, emit } = collect();
  await teach({
    contract: CONTRACT,
    model: "gpt-5.6-luna",
    prompt: "x",
    dispatch: async () => "moved",
    emit,
    verify: async () => null,
  });

  const said = events.filter((e) => e.type === "chat").map((e: any) => e.text);
  expect(said).toEqual(["Looking at the table first.", "Done."]);
});

test("running out of turns is not evidence that anything worked", async () => {
  stubModel([
    {
      content: "still going",
      tool_calls: [{ id: "1", type: "function", function: { name: "move_to", arguments: "{}" } }],
    },
  ]);
  const { emit } = collect();
  const result = await teach({
    contract: { ...CONTRACT, max_iterations: 2 },
    model: "gpt-5.6-luna",
    prompt: "x",
    dispatch: async () => "moved",
    emit,
    verify: async () => UNVERIFIED,
  });

  expect(result.outcome).toBe("fail");
  expect(result.text).toBe(UNVERIFIED.owner);
});

test("a loop with no verifier still works", async () => {
  // The transport always wires one; tests and any future caller need not.
  stubModel([{ content: "ok" }]);
  const { emit } = collect();
  const result = await teach({
    contract: CONTRACT,
    model: "gpt-5.6-luna",
    prompt: "x",
    dispatch: async () => "",
    emit,
  });
  expect(result.outcome).toBe("ok");
});

test("a final verdict is not argued with", async () => {
  // A latched e-stop cannot be talked out of. Sending the model back would
  // spend the owner's credit on turns that cannot move anything.
  let asked = 0;
  stubModel([{ content: "Nodded the right arm for you." }]);
  const { emit } = collect();
  const result = await teach({
    contract: CONTRACT,
    model: "gpt-5.6-luna",
    prompt: "x",
    dispatch: async () => "",
    emit,
    verify: async () => {
      asked++;
      return {
        agent: "The e-stop is latched.",
        owner: "Stopped: the e-stop is latched. Clear it to continue.",
        final: true,
      };
    },
  });

  expect(asked).toBe(1);
  expect(result.outcome).toBe("fail");
  expect(result.text).toBe("Stopped: the e-stop is latched. Clear it to continue.");
});
