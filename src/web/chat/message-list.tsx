import * as stylex from "@stylexjs/stylex";
import { memo } from "react";
import type { Reference } from "../../document/reference.ts";
import type { AgentMessage, Message, ReaderMessage } from "../../protocol/rest-api.ts";
import { styled } from "../style/styled.ts";
import { fontSize, lineHeight, radius, space, theme } from "../style/theme.stylex.ts";
import { lasted } from "./elapsed.tsx";
import { ReferenceList } from "./reference-list.tsx";
import { Reply } from "./reply.tsx";
import { TurnHeader } from "./turn-header.tsx";

/**
 * The messages, in log order. Memoized, so typing a message does not render them again: at a
 * few hundred messages that took most of each keystroke.
 */
export const MessageList = memo(function MessageList({
  messages,
  onShowOnPage,
}: {
  messages: Message[];
  onShowOnPage: (item: Reference) => void;
}) {
  const bySeq = new Map(messages.map((message) => [message.seq, message]));
  return messages.map((message) =>
    message.author === "reader" ? (
      <ReaderView key={message.seq} message={message} onShowOnPage={onShowOnPage} />
    ) : (
      <AgentView
        key={message.seq}
        message={message}
        sent={bySeq.get(message.inReplyTo)?.createdAt}
      />
    ),
  );
});

/**
 * A logged message never changes, but chat events replace its object. Comparing numbers lets
 * a new message render alone.
 */
function sameMessage<P extends { message: { seq: number } }>(before: P, after: P): boolean {
  return Object.entries(after).every(([key, value]) =>
    key === "message" ? before.message.seq === after.message.seq : before[key as keyof P] === value,
  );
}

const ReaderView = memo(function ReaderView({
  message,
  onShowOnPage,
}: {
  message: ReaderMessage;
  onShowOnPage: (item: Reference) => void;
}) {
  return (
    <article {...styled("reader-message", s.turn)} data-seq={message.seq}>
      <TurnHeader author="You" message={message} />
      <div {...stylex.props(s.readerBubble)}>
        <p {...stylex.props(s.messageText)}>{message.text}</p>
        {message.references.length > 0 && (
          <ReferenceList items={message.references} onShowOnPage={onShowOnPage} />
        )}
      </div>
    </article>
  );
}, sameMessage);

const AgentView = memo(function AgentView({
  message,
  sent,
}: {
  message: AgentMessage;
  sent: string | undefined;
}) {
  // From the message it answers to the reply, as the counter showed while it worked. When
  // the server saw the agent read it, the tooltip tells waiting from working.
  const at = (iso: string) => new Date(iso).getTime();
  const replied = at(message.createdAt);
  const took = sent ? lasted(replied - at(sent)) : undefined;
  const split =
    sent && message.readAt
      ? `Waited ${lasted(at(message.readAt) - at(sent))} for an agent, which worked ${lasted(replied - at(message.readAt))}`
      : "From the message it answers to the reply";
  return (
    <article {...styled("agent-message", s.turn)} data-seq={message.seq}>
      <TurnHeader
        author="Agent"
        detail={took && <span title={split}>{took}</span>}
        message={message}
      />
      <div {...stylex.props(s.agentContent)}>
        <Reply message={message} />
      </div>
    </article>
  );
}, sameMessage);

const s = stylex.create({
  turn: {
    minWidth: 0,
    marginBottom: space.xl,
  },
  readerBubble: {
    minWidth: 0,
    paddingBlock: space.sm,
    paddingInline: space.md,
    borderRadius: radius.lg,
    backgroundColor: theme.surfaceRaised,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: theme.border,
  },
  messageText: {
    margin: 0,
    color: theme.text,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.normal,
    whiteSpace: "pre-wrap",
  },
  agentContent: {
    minWidth: 0,
    overflowX: "auto",
    color: theme.textBody,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.normal,
  },
});
