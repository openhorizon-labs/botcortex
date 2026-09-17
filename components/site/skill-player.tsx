"use client";

/**
 * Run a published skill in the visitor's tab. No account, no model call.
 *
 * This is the cheapest true thing BotCortex can show anyone: a real skill,
 * taught by a real owner, moving a real physics simulation, with nothing
 * installed. It costs us nothing per run — the skill is a program, and running
 * a program needs no model — so it is safe to put in front of any number of
 * strangers, which is what a share link does.
 *
 * It drives the sim host directly and deliberately does NOT mount the robot
 * provider. The provider exists to tie a robot to an account: it restores that
 * account's skills and writes what runs back to its registry. Run through it, a
 * signed-in visitor pressing Run on someone else's "wave" would have had it
 * saved into their own account and re-published under their name. Here the
 * namespace is always null: nothing is read from an account and nothing is
 * written to one.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, Check, Download, Link2, Loader2, Play, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { recordCanvas, type GifRecording } from "@/lib/gif";
import { shortBodyName } from "@/lib/robot/bodies";
import { visitorSummary } from "@/lib/robot/visitor-summary";
import type { BrowserSim } from "@/lib/robot/browser-sim/host";
import type { JointState, RobotInfo, SceneBodies } from "@/lib/robot/protocol";

const SimViewport = dynamic(() => import("@/components/app/sim-view").then((m) => m.SimViewport), {
  ssr: false,
  loading: () => <div className="size-full bg-surface-3" />,
});

type Phase = "idle" | "booting" | "running" | "done" | "failed";

export function SkillPlayer({
  skill,
  bodyName,
  autorun = false,
}: {
  skill: { id: string; name: string; code: string; platform: string };
  bodyName: string;
  autorun?: boolean;
}) {
  const jointStateRef = useRef<JointState | null>(null);
  const objectsRef = useRef<SceneBodies | null>(null);
  const fixturesRef = useRef<SceneBodies | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<BrowserSim | null>(null);
  const [robot, setRobot] = useState<Pick<RobotInfo, "name" | "platform" | "gripper" | "kinematics"> | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [gif, setGif] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // The worker is ~100 MB of resident WASM: never leave one behind.
  useEffect(() => () => simRef.current?.close(), []);
  useEffect(() => () => { if (gif) URL.revokeObjectURL(gif); }, [gif]);

  const run = useCallback(async () => {
    setSaid(null);
    setGif(null);
    let recording: GifRecording | null = null;
    try {
      let sim = simRef.current;
      if (!sim) {
        setPhase("booting");
        const { BrowserSim } = await import("@/lib/robot/browser-sim/host");
        sim = await BrowserSim.boot(setStage, {
          namespace: null,
          platform: skill.platform,
          // While the run is being checked the robot has not moved yet; say
          // what is happening so a still robot does not read as a hung page.
          onWorking: (label, step) => setStage(`Checking step ${step}: ${label}`),
          onDead: (reason) => {
            simRef.current = null;
            setPhase("failed");
            setSaid(`${reason}.`);
          },
        });
        simRef.current = sim;
        if (sim.platform !== skill.platform) {
          throw new Error(`this browser could not start a ${bodyName}; it started a ${sim.platform} instead`);
        }
        fixturesRef.current = sim.scene.fixtures;
        objectsRef.current = sim.scene.objects;
        jointStateRef.current = sim.state;
        setRobot({
          name: shortBodyName(sim.displayName),
          platform: sim.platform,
          gripper: sim.gripper,
          kinematics: sim.kinematics as RobotInfo["kinematics"],
        });
        setStage(null);
      } else {
        // Run again: from a clean workcell, or the second run starts with the
        // block already in the tray and "succeeds" at nothing.
        await sim.reset();
        objectsRef.current = sim.scene.objects;
        jointStateRef.current = sim.state;
      }

      setPhase("running");
      setStage("Working out the motion");
      const live = sim;
      const saved = await live.callTool("save_skill", { name: skill.name, code: skill.code }, () => {});
      if (!saved.startsWith("saved ")) throw new Error(saved);
      const reply = await live.runTool("run_skill", { name: skill.name, params_json: "{}" }, (state) => {
        // The first frame is when the arm starts moving — which is when the
        // clip should start. Recording through the planning pause before it
        // would open every GIF with ten seconds of a still robot.
        if (!recording) {
          setStage(null);
          recording = recordCanvas();
        }
        jointStateRef.current = state;
        objectsRef.current = live.scene.objects;
      });
      objectsRef.current = live.scene.objects;
      jointStateRef.current = live.state;
      // One more beat so the clip ends on the settled scene, not mid-frame.
      await new Promise((r) => setTimeout(r, 400));
      const clip = (recording as GifRecording | null)?.stop() ?? null;
      if (clip) setGif(URL.createObjectURL(clip));
      // The runtime's report is evidence for an owner — joints, ticks,
      // coordinates. A visitor gets what happened to the block.
      const summary = visitorSummary(reply.plain);
      // Counted for ranking only when it worked, once per visitor per day, and
      // never for the author (the api decides both). Best effort: a robot that
      // moved is the point, a counter that did not tick is not an error.
      if (summary.ok) void fetch(`/api/registry/skills/${skill.id}/ran`, { method: "POST" }).catch(() => {});
      setSaid(summary.text);
      setPhase(summary.ok ? "done" : "failed");
    } catch (error) {
      (recording as GifRecording | null)?.stop();
      setStage(null);
      setSaid(error instanceof Error ? error.message : String(error));
      setPhase("failed");
    }
  }, [skill, bodyName]);

  // A share link opens already running. After mount, never during render.
  const started = useRef(false);
  useEffect(() => {
    if (!autorun || started.current) return;
    started.current = true;
    void run();
  }, [autorun, run]);

  const busy = phase === "booting" || phase === "running";

  return (
    <div className="flex flex-col gap-3">
      <div ref={stageRef} className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border bg-surface-3">
        {robot ? (
          <SimViewport jointStateRef={jointStateRef} objectsRef={objectsRef} fixturesRef={fixturesRef} robot={robot} />
        ) : (
          /* Until the sim is up: the body's own card render, the same model. */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`/robots/cards/${skill.platform}.png`}
            alt={`${bodyName} in the simulation`}
            className="absolute inset-0 size-full object-cover"
            draggable={false}
          />
        )}
        {phase === "idle" && (
          <button
            type="button"
            onClick={() => void run()}
            className="group absolute inset-0 flex cursor-pointer items-center justify-center bg-background/10 transition-colors hover:bg-background/0"
            aria-label={`Run ${skill.name} in your browser`}
          >
            <span className="flex items-center gap-2 rounded-lg bg-foreground px-5 py-3 text-sm font-medium text-background shadow-lg transition-transform duration-150 ease-standard group-hover:scale-[1.03]">
              <Play className="size-4 fill-current" /> Run it in your browser
            </span>
          </button>
        )}
        {busy && stage && (
          <p
            role="status"
            className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-border bg-background/90 px-2.5 py-1.5 text-xs text-muted-foreground"
          >
            <Loader2 className="size-3.5 animate-spin" /> {stage}…
          </p>
        )}
      </div>

      {phase === "idle" && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Real physics, in this tab. Nothing to install and no account. The first run downloads
          the robot runtime, about 14 MB.
        </p>
      )}
      {said && (
        <p className={`break-words text-sm leading-relaxed ${phase === "failed" ? "text-destructive" : "text-foreground"}`}>
          {said}
        </p>
      )}
      {(phase === "done" || phase === "failed") && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-lg" onClick={() => void run()}>
            <RotateCcw className="size-3.5" /> Run again
          </Button>
          {gif && (
            <Button asChild size="sm" variant="outline" className="h-9 gap-1.5 rounded-lg">
              <a href={gif} download={`${skill.name}-${skill.platform}.gif`}>
                <Download className="size-3.5" /> Save GIF
              </a>
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 rounded-lg"
            onClick={() => {
              const url = `${window.location.origin}/skills/${skill.id}?run=1`;
              navigator.clipboard?.writeText(url).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }, () => {});
            }}
          >
            {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
            {copied ? "Link copied" : "Copy link"}
          </Button>
          <Button asChild size="sm" className="h-9 gap-1.5 rounded-lg bg-foreground text-background hover:bg-foreground/90">
            <Link href="/signup">
              Teach your own <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
