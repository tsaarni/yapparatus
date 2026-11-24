/** The chat panel: the messages with the agent, a typing indicator, and the message box. */

import * as stylex from "@stylexjs/stylex";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Reference } from "../../document/reference.ts";
import type { Chat as ChatRead } from "../../protocol/rest-api.ts";
import { commands } from "../live/client.ts";
import { styled } from "../style/styled.ts";
import {
  fontSize,
  fontWeight,
  layer,
  lineHeight,
  sizes,
  space,
  theme,
} from "../style/theme.stylex.ts";
import { ChatHeader } from "./chat-header.tsx";
import { Composer } from "./composer.tsx";
import { Elapsed } from "./elapsed.tsx";
import { MessageList } from "./message-list.tsx";
import { useStickyScroll } from "./sticky-scroll.ts";
import { TurnHeader } from "./turn-header.tsx";
import { Typing } from "./typing.tsx";

/** The chat read from the server, and the panel state the app keeps around it. */
export interface ChatProps {
  chat: ChatRead;
  /** What the next message is about: the pills above the message box. */
  references: Reference[];
  setReferences: (update: (current: Reference[]) => Reference[]) => void;
  full: boolean;
  setFull: (full: boolean) => void;
  onClose: () => void;
  onShowOnPage: (item: Reference) => void;
  onError: (message: string) => void;
  draft: string;
  setDraft: (draft: string) => void;
}

/** The chat panel beside the page. */
export function Chat(props: ChatProps) {
  const { chat, references, setReferences, onError, draft, setDraft } = props;
  const [sending, setSending] = useState(false);
  const thread = useRef<HTMLDivElement>(null);
  const count = chat.messages.length;
  const newestReaderMessage = chat.messages.findLast((m) => m.author === "reader");
  const newestReader = newestReaderMessage?.seq ?? 0;
  const newestReaderAt = newestReaderMessage?.createdAt;
  const unread = newestReader > chat.repliedTo;

  const scrollToBottom = useStickyScroll(thread);
  const showOnPage = useRef(props.onShowOnPage);
  useLayoutEffect(() => {
    showOnPage.current = props.onShowOnPage;
  });
  const stableShowOnPage = useCallback((item: Reference) => showOnPage.current(item), []);

  async function submit() {
    if (sending || !draft.trim()) return;
    setSending(true);
    try {
      await commands.send({ text: draft, references });
      scrollToBottom();
      setDraft("");
      setReferences(() => []);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSending(false);
    }
  }

  return (
    <aside aria-label="Chat" {...styled("chat", s.panel, props.full && s.panelFull)}>
      <ChatHeader
        agent={chat.agent}
        count={count}
        full={props.full}
        setFull={props.setFull}
        onClose={props.onClose}
        onError={onError}
      />

      <div ref={thread} {...styled("messages", s.thread)}>
        <div {...stylex.props(s.column, props.full && s.columnFull)}>
          {count === 0 && (
            <div {...stylex.props(s.empty)}>
              <p {...stylex.props(s.emptyTitle)}>Comment on anything in this document.</p>
              <ul {...stylex.props(s.tips)}>
                <li>Select text and choose Comment to quote it.</li>
                <li>Hover a heading, figure, table, or code block and choose Comment.</li>
                <li>Click a box or arrow in a diagram to point at it.</li>
                <li>Request changes too. The agent can edit the pages.</li>
              </ul>
            </div>
          )}
          <MessageList messages={chat.messages} onShowOnPage={stableShowOnPage} />
          {unread && chat.agent !== "away" && (
            <div {...stylex.props(s.turn)}>
              <TurnHeader
                author="Agent"
                detail={newestReaderAt && <Elapsed since={newestReaderAt} />}
              />
              <Typing
                label={
                  chat.agent === "waiting"
                    ? "The agent has your message"
                    : "The agent is working on your message"
                }
              />
            </div>
          )}
        </div>
      </div>

      <Composer
        references={references}
        setReferences={setReferences}
        draft={draft}
        setDraft={setDraft}
        sending={sending}
        onSubmit={() => void submit()}
        full={props.full}
        prompt={chat.agent === "away" ? chat.prompt : undefined}
      />
    </aside>
  );
}

const s = stylex.create({
  /** Fills the slot beside the page, which holds the width the reader drags it to. */
  panel: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    backgroundColor: theme.surface,
    borderLeftWidth: 1,
    borderLeftStyle: "solid",
    borderLeftColor: theme.border,
    fontFamily: theme.sans,
  },
  /** Covers the window, while the slot keeps its width so the page beneath does not reflow. */
  panelFull: {
    position: "fixed",
    zIndex: layer.chat,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  thread: {
    direction: "ltr",
    flexGrow: 1,
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingBlock: space.xl,
    paddingInline: space.lg,
    scrollbarWidth: "thin",
  },
  column: {
    width: "100%",
  },
  columnFull: {
    maxWidth: sizes.textWidth,
    marginInline: "auto",
  },
  empty: {
    paddingBlock: space.xl,
    paddingInline: space.xs,
    color: theme.textMuted,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.normal,
  },
  emptyTitle: {
    margin: 0,
    marginBottom: space.sm,
    color: theme.text,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  tips: {
    margin: 0,
    paddingLeft: space.lg,
    display: "grid",
    gap: space.xs,
  },
  turn: {
    minWidth: 0,
    marginBottom: space.xl,
  },
});
