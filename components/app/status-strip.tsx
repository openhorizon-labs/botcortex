"use client";

/**
 * The small truths the header owes the owner, each shown only while it is
 * true: telemetry gone stale on an open socket, transcript rows not yet
 * saved (or given up on), a skill that never reached the registry, memory
 * that will not survive a reload, a robot working in a task that is not
 * the one on screen.
 *
 * Every line here is an audit finding turned visible — B04 (persistence and
 * sync failures reached only the console), B06 (a half-open socket looked
 * healthy), B02 (skills taught in the browser vanished on reload with no
 * warning), B01 (a running task was invisible from any other view). None
 * of them is decoration; when nothing is wrong the strip renders nothing.
 */

import Link from "next/link";
import { CloudOff, Database, HardDrive, RefreshCw, Radio } from "lucide-react";

import { cn } from "@/lib/utils";
import { useRobot } from "@/components/app/robot-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function Chip({
  icon: Icon,
  tone,
  children,
  title,
  action,
}: {
  icon: typeof Radio;
  tone: "warn" | "info";
  children: React.ReactNode;
  title: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="status"
          className={cn(
            "flex h-6 items-center gap-1.5 rounded-full border px-2 text-xs",
            tone === "warn"
              ? "border-destructive/30 text-destructive"
              : "border-border text-muted-foreground",
          )}
        >
          <Icon className="size-3" />
          <span className="hidden sm:inline">{children}</span>
          {action && (
            <button
              onClick={action.onClick}
              className="ml-0.5 flex cursor-pointer items-center gap-0.5 rounded-full px-1 underline underline-offset-2 hover:text-foreground"
            >
              <RefreshCw className="size-3" /> {action.label}
            </button>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}

export function StatusStrip() {
  const {
    status, telemetryStale, persistence, retryPersistence, memory, syncFailures, retrySync,
    activeRun, conversationId, activity, conversations, host,
  } = useRobot();
  const connected = status === "connected";
  const working = activity.startsWith("teaching") || activity.startsWith("running");
  const elsewhere = working && activeRun?.conversationId && activeRun.conversationId !== conversationId
    ? conversations.find((c) => c.id === activeRun.conversationId) ?? { id: activeRun.conversationId, title: null }
    : null;

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {connected && telemetryStale && (
        <Chip icon={Radio} tone="warn" title="The connection is open but nothing has arrived for a few seconds. The arm on screen is the last thing heard, not what the robot is doing now.">
          telemetry stale
        </Chip>
      )}
      {elsewhere && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={`/app/tasks/${elsewhere.id}`}
              className="flex h-6 items-center gap-1.5 rounded-full border border-border px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <span className="size-1.5 animate-pulse rounded-full bg-foreground" />
              <span className="hidden sm:inline">working in {elsewhere.title ?? "another task"}</span>
            </Link>
          </TooltipTrigger>
          <TooltipContent>The robot is still on a task you started elsewhere. Its events file under that task, not this one.</TooltipContent>
        </Tooltip>
      )}
      {persistence.failed > 0 && (
        <Chip
          icon={CloudOff}
          tone="warn"
          title={`${persistence.failed} transcript ${persistence.failed === 1 ? "row" : "rows"} could not be saved${persistence.lastFailure ? ` — ${persistence.lastFailure}` : ""}. What you see is still on screen; it is not in your history yet.`}
          action={{ label: "retry", onClick: () => void retryPersistence() }}
        >
          {persistence.failed} unsaved
        </Chip>
      )}
      {persistence.failed === 0 && persistence.pending > 0 && (
        <Chip icon={CloudOff} tone="info" title="Saving the transcript…">
          saving…
        </Chip>
      )}
      {syncFailures.length > 0 && (
        <Chip
          icon={Database}
          tone="warn"
          title={`Saved on the robot, not yet in your account registry: ${syncFailures.join(", ")}. They still run; a robot paired later would not find them.`}
          action={host === "this browser" ? { label: "retry", onClick: () => syncFailures.forEach((name) => retrySync(name)) } : undefined}
        >
          {syncFailures.length} not synced
        </Chip>
      )}
      {memory && (!memory.durable || memory.unsaved) && (
        <Chip
          icon={HardDrive}
          tone={memory.unsaved ? "warn" : "info"}
          title={memory.detail ?? (memory.durable ? "Memory saved in this browser." : "Memory lasts this session only.")}
        >
          {memory.unsaved ? "memory unsaved" : "session-only memory"}
        </Chip>
      )}
    </div>
  );
}
