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
import { Spinner } from "@/components/ui/spinner";
import { useRobot } from "@/components/app/robot-provider";
import { ToolTrace } from "@/components/app/tool-trace";

export function ChatPane() {
  const { messages, toolCalls, activity, status } = useRobot();
  const connected = status === "connected";
  const busy = activity.startsWith("teaching") || activity.startsWith("running");

  // Merged on timestamp so the agent's workings land between the words that
  // prompted them and the reply they produced. Traces are live-only, so a
  // rehydrated thread is simply all messages.
  const timeline = [
    ...messages.map((m) => ({ at: m.at, key: m.id, node: <ChatBubble message={m} /> })),
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

function ChatBubble({ message }: { message: { from: "you" | "robot"; text: string } }) {
  return (
    <Message from={message.from === "you" ? "user" : "assistant"}>
      <MessageContent>
        <MessageResponse>{message.text}</MessageResponse>
      </MessageContent>
    </Message>
  );
}
