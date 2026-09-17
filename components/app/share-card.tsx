"use client";

/**
 * "It worked — show someone."
 *
 * Appears once, when a skill has just been seen to work for the first time.
 * That moment is also when the skill was published, so there is a public page
 * for it, and the two things worth offering are the link to that page and a
 * clip of the robot doing it.
 *
 * The clip is made by running the skill AGAIN while recording the viewer, not
 * by having recorded the first run. Recording everything in case something
 * turns out to be worth keeping would mean encoding every frame of every
 * session; a re-run costs no model call, takes as long as the skill takes, and
 * records exactly the thing being shared — the working skill, start to finish,
 * without the agent's exploratory moves before it.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Download, Link2, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRobot } from "@/components/app/robot-provider";
import { recordCanvas, type GifRecording } from "@/lib/gif";

const canvas = () => document.querySelector<HTMLCanvasElement>("[data-sim-panel] canvas");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function ShareCard() {
  const { justProven, dismissProven, runSkill, activity, jointStateRef, setSimOpen, stopped, status } = useRobot();
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [recording, setRecording] = useState(false);
  // The async recorder below outlives the render that started it.
  const activityRef = useRef(activity);
  useEffect(() => { activityRef.current = activity; }, [activity]);
  useEffect(() => { setNote(null); setCopied(false); }, [justProven?.name]);

  if (!justProven || status !== "connected") return null;
  const { name, platform } = justProven;

  /** The skill's public id. Publishing rides a background request that can
   *  land a moment after the run does, hence the short wait. */
  async function publicId(): Promise<string | null> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const res = await fetch(`/api/skills?platform=${encodeURIComponent(platform)}`);
        if (res.ok) {
          const body = (await res.json()) as { skills?: { id: string; name: string; published?: boolean }[] };
          const row = body.skills?.find((skill) => skill.name === name);
          if (row?.published) return row.id;
        }
      } catch { /* retried below */ }
      await sleep(1200);
    }
    return null;
  }

  async function copyLink() {
    setNote(null);
    const id = await publicId();
    if (!id) {
      setNote("Still publishing — give it a few seconds and try again.");
      return;
    }
    await navigator.clipboard?.writeText(`${window.location.origin}/skills/${id}?run=1`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function makeGif() {
    if (recording) return;
    setRecording(true);
    setNote("Running it once more to record it…");
    let clip: GifRecording | null = null;
    try {
      setSimOpen(true);
      for (let waited = 0; !canvas() && waited < 6000; waited += 150) await sleep(150);
      if (!canvas()) throw new Error("The simulation view did not open, so there is nothing to record.");

      const still = JSON.stringify(jointStateRef.current);
      if (!runSkill(name, false)) throw new Error("The robot is not connected.");
      let sawBusy = false;
      const deadline = Date.now() + 8 * 60_000;
      while (Date.now() < deadline) {
        await sleep(100);
        const busy = activityRef.current !== "idle";
        sawBusy ||= busy;
        // Start on the first frame of MOTION, so the clip does not open with
        // the planning pause before it.
        if (!clip && JSON.stringify(jointStateRef.current) !== still) clip = recordCanvas();
        if (sawBusy && !busy) break;
      }
      await sleep(400);
      const blob = clip?.stop() ?? null;
      clip = null;
      if (!blob) throw new Error("The arm never moved, so there was nothing to record.");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${name}-${platform}.gif`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setNote("Saved. It plays inline anywhere you paste it.");
    } catch (error) {
      clip?.stop();
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setRecording(false);
    }
  }

  return (
    <div className="mx-auto mb-3 flex w-full max-w-[768px] min-w-0 shrink-0 flex-col gap-2 rounded-2xl border border-border bg-surface-2 p-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">It worked. Show someone.</p>
          <p className="mt-0.5 break-words text-xs leading-relaxed text-muted-foreground">
            <span className="font-mono">{name}</span> ran successfully, so it is on the public registry. The link
            opens it running in anyone&apos;s browser, no account needed.
          </p>
        </div>
        <button
          type="button"
          onClick={dismissProven}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-surface-3 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg" onClick={() => void copyLink()}>
          {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
          {copied ? "Link copied" : "Copy replay link"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 rounded-lg"
          disabled={recording || stopped || activity !== "idle"}
          onClick={() => void makeGif()}
        >
          {recording ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          {recording ? "Recording…" : "Save a GIF"}
        </Button>
      </div>
      {note && <p className="break-words text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
