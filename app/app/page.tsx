"use client";

import { useState } from "react";

type Msg = { from: "user" | "robot"; text: string };

const SAMPLE_SKILLS = [
  { name: "wave_right_arm", desc: "Wave the right arm three times" },
  { name: "pick_and_place", desc: "Pick from tray A, place in tray B" },
  { name: "fold_towel", desc: "Two-arm towel fold" },
];

export default function Page() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      from: "robot",
      text: "No robot connected yet. When BotCortex runs on your robot, this page is served from the robot itself — type a task and it learns it.",
    },
  ]);
  const [input, setInput] = useState("");

  function send() {
    const text = input.trim();
    if (!text) return;
    setMessages((m) => [
      ...m,
      { from: "user", text },
      {
        from: "robot",
        text: "Connect a robot to teach it. (This is the hosted preview — no runtime attached.)",
      },
    ]);
    setInput("");
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-tight">BotCortex</h1>
          <span className="text-xs text-zinc-500">by OpenHorizon Labs</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">
            ● no robot connected
          </span>
          <button
            className="rounded-md bg-red-600 px-5 py-2 text-sm font-bold tracking-wide hover:bg-red-500"
            title="Emergency stop — always visible, always works"
          >
            STOP
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 flex-col border-r border-zinc-800 p-4 sm:flex">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Your robot knows {SAMPLE_SKILLS.length} tasks
          </h2>
          <ul className="space-y-2">
            {SAMPLE_SKILLS.map((s) => (
              <li key={s.name} className="rounded-lg border border-zinc-800 p-3">
                <div className="font-mono text-sm">{s.name}</div>
                <div className="mt-1 text-xs text-zinc-500">{s.desc}</div>
                <button
                  disabled
                  className="mt-2 rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-500"
                >
                  Run
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.from === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    m.from === "user"
                      ? "max-w-xl rounded-2xl bg-blue-600 px-4 py-2 text-sm"
                      : "max-w-xl rounded-2xl bg-zinc-800 px-4 py-2 text-sm text-zinc-200"
                  }
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-zinc-800 p-4">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder='Teach your robot: "sort the red parts into the left bin"'
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm outline-none placeholder:text-zinc-600 focus:border-zinc-500"
              />
              <button
                onClick={send}
                className="rounded-lg bg-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-900 hover:bg-white"
              >
                Teach
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-zinc-600">
              Skills run locally on your robot — the AI is only in the loop while learning.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
