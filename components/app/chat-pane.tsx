"use client";

/**
 * The conversation surface, built on AI SDK Elements.
 *
 * Note on architecture: the agent does NOT run behind an HTTP route here, so
 * there's no `useChat` transport — BotCortex's authoring agent lives on the
 * robot and speaks over the WebSocket in robot-provider. These are the Elements
 * presentation components driven by that stream.
 */

import { Bot } from "lucide-react";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { useRobot } from "@/components/app/robot-provider";
import { ToolTrace } from "@/components/app/tool-trace";
import { SkillText } from "@/components/app/skill-text";

export function ChatPane() {
  const { messages, toolCalls, activity, status, skills } = useRobot();
  const connected = status === "connected";
  const busy = activity.startsWith("teaching") || activity.startsWith("running");

  // Merged on timestamp so the agent's workings land between the words that
  // prompted them and the reply they produced. Traces are live-only, so a
  // rehydrated thread is simply all messages.
  const timeline = [
    ...messages.map((m) => ({
      at: m.at,
      key: m.id,
      node: <ChatBubble message={m} skills={skills ?? []} />,
    })),
    ...toolCalls.map((c) => ({ at: c.at, key: c.id, node: <ToolTrace call={c} /> })),
  ].sort((a, b) => a.at - b.at);

  return (
    <Conversation className="min-h-0 flex-1">
      <ConversationContent className="gap-6 px-2 py-4">
        {timeline.length === 0 ? (
          <ConversationEmptyState
            icon={<Bot className="size-6 text-muted-foreground" />}
            title="What should the robot learn today?"
            description={
              connected
                ? "Type a task in plain English — the agent writes the skill, the robot keeps it."
                : "Connect a robot or the simulator to start teaching."
            }
          />
        ) : (
          timeline.map((item) => <div key={item.key}>{item.node}</div>)
        )}
        {busy && (
          <Message from="assistant">
            <MessageContent>
              <span className="flex items-center gap-2 text-muted-foreground">
                <Spinner className="size-3.5" />
                {activity.startsWith("teaching") ? "Authoring a skill…" : "Running…"}
              </span>
            </MessageContent>
          </Message>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

function ChatBubble({
  message,
  skills,
}: {
  message: { from: "you" | "robot"; text: string };
  skills: string[];
}) {
  const mine = message.from === "you";
  // Skill names get picked out wherever they appear, so snake_case never goes
  // through a markdown renderer that italicises the underscores.
  const mentionsSkill = skills.some((s) => s && message.text.includes(s));

  // Only the ROBOT's skill lines are status lines. "Run wave_left_arm" is
  // something the owner said, and muting it made their own words look like
  // machine output.
  const isStatusLine = mentionsSkill && !mine;

  return (
    <Message from={mine ? "user" : "assistant"}>
      <MessageContent
        className={cn(
          "leading-relaxed",
          mine && "rounded-2xl rounded-br-md bg-surface-2 px-3.5 py-2.5 text-foreground",
          isStatusLine && "text-[13px] text-muted-foreground",
        )}
      >
        {mentionsSkill ? (
          <SkillText text={message.text} skills={skills} />
        ) : (
          <MessageResponse>{message.text}</MessageResponse>
        )}
      </MessageContent>
    </Message>
  );
}
