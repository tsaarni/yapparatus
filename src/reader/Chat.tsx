import { pages } from "virtual:yapparatus/document";
import * as stylex from "@stylexjs/stylex";
import type { MDXProps } from "mdx/types";
import {
  Component,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { partSeparator, quoteOf, splitAddress } from "../document.ts";
import { linesLabel, parseFileAddress } from "../files.ts";
import { createLogger } from "../logger.ts";
import type { AgentMessage, ChatState, ContextItem, ReaderMessage } from "../protocol.ts";
import { commands, reportDiagnostics } from "./api.ts";
import { type AppIconName, AppIcon as Icon } from "./icons.tsx";
import { findTarget, numbering, numbersOf, PageContext } from "./numbering.ts";
import { ReadingContext } from "./prose.tsx";
import { components } from "./registry.ts";
import {
  duration,
  fontSize,
  fontWeight,
  layer,
  lineHeight,
  radius,
  sizes,
  space,
  theme,
  when,
} from "./theme.stylex.ts";
import { Button, styled, ui, useCopy } from "./ui.tsx";

const log = createLogger("chat");

/** A reply that fails to render is an error; it ends the agent's wait, so it can send a fix. */
function reportReply(message: AgentMessage, error: string) {
  reportDiagnostics(`reply:${message.seq}`, [
    {
      origin: "reply",
      code: "REPLY_FAILED",
      message: `A reply could not be shown: ${error}`,
      target: String(message.seq),
    },
  ]);
}

class ReplyBoundary extends Component<
  { message: AgentMessage; children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    reportReply(this.props.message, error.message);
  }
  render() {
    return this.state.error ? (
      <p {...stylex.props(s.error)} role="alert">
        Unable to show this reply: {this.state.error}
      </p>
    ) : (
      this.props.children
    );
  }
}

/** How a context item reads in the chat: an icon and its name. */
export function describeItem(item: ContextItem) {
  const icon: Record<ContextItem["kind"], AppIconName> = {
    page: "page",
    text: "quote",
    section: "hash",
    figure: "image",
    table: "table",
    listing: "code",
    code: "code",
    "diagram-part": "diagram",
    file: "file",
    lines: "code",
  };
  const file = parseFileAddress(item.address);
  if (file) {
    const name = file.path.split("/").at(-1) ?? file.path;
    const quote = quoteOf(item.address);
    const lines =
      file.lines &&
      `, ${file.lines.end > file.lines.start ? "lines" : "line"} ${linesLabel(file.lines)}`;
    return {
      icon: icon[item.kind],
      name: `${name}${lines ?? ""}${quote ? `: “${quote}”` : ""}`,
    };
  }
  const { page: id, anchor } = splitAddress(item.address);
  const page = pages.find((p) => p.id === id);
  // Labels and numbers are the reader's view of the address, computed now, never stored.
  const [owner = "", part] = anchor.split(partSeparator);
  const label = owner ? findTarget(owner, page)?.label : undefined;
  const heading = page?.outline?.headings.find((h) => h.id === anchor)?.text;
  const caption = page?.outline?.numbered.find((n) => n.id === owner)?.caption;
  const joined = (...parts: Array<string | undefined>) =>
    [...new Set(parts.filter(Boolean))].join(" · ");
  const name =
    item.kind === "text"
      ? `“${quoteOf(item.address) ?? ""}”`
      : item.kind === "page"
        ? joined(
            numbering.sections && page ? `Chapter ${numbersOf(page)?.chapter}` : undefined,
            page?.outline?.title ?? id,
          )
        : item.kind === "section"
          ? joined(label, heading)
          : item.kind === "diagram-part"
            ? joined(label, part)
            : item.kind === "code"
              ? joined("Code", label)
              : joined(label, caption);
  return { icon: icon[item.kind], name: name || item.kind };
}

/** Three dots that rise in turn while an agent has the message or works on it, as in a messaging app. */
function Typing({ label }: { label: string }) {
  return (
    <p role="status" aria-label={label} title={label} {...styled("working", s.typing)}>
      <span {...stylex.props(s.typingDot)} />
      <span {...stylex.props(s.typingDot, s.typingDot2)} />
      <span {...stylex.props(s.typingDot, s.typingDot3)} />
    </p>
  );
}

/** An agent's reply: MDX the server accepted, shown with the document's components. */
function Reply({ message }: { message: AgentMessage }) {
  const [Body, setBody] = useState<ComponentType<MDXProps>>();
  const [error, setError] = useState("");
  // Chat events replace message objects, but a reply never changes: load it once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Keyed by the reply's number.
  useEffect(() => {
    let active = true;
    void import(/* @vite-ignore */ message.module)
      .then((module: { default: ComponentType<MDXProps> }) => {
        if (active) setBody(() => module.default);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        log.warn(`reply #${message.seq} failed to load:`, cause);
        setError(String(cause));
        reportReply(message, String(cause));
      });
    return () => {
      active = false;
    };
  }, [message.seq]);
  if (error)
    return (
      <p {...stylex.props(s.error)} role="alert">
        Could not load the reply: {error}
      </p>
    );
  // The typing dots stay until the reply can be shown, which then fades in once.
  if (!Body) return <Typing label="The reply is loading" />;
  return (
    <div {...stylex.props(s.replyBody)}>
      <ReplyBoundary message={message}>
        <PageContext.Provider value={undefined}>
          <ReadingContext.Provider
            value={{
              reply: true,
              // Reply content gets its own ids, so they never collide with the page's.
              idPrefix: `reply-${message.seq}-`,
            }}
          >
            <Body components={components} />
          </ReadingContext.Provider>
        </PageContext.Provider>
      </ReplyBoundary>
    </div>
  );
}

function ContextList({
  items,
  onShowOnPage,
}: {
  items: ContextItem[];
  onShowOnPage: (item: ContextItem) => void;
}) {
  return (
    <ul {...stylex.props(s.contexts)}>
      {items.map((item) => {
        const { icon, name } = describeItem(item);
        return (
          <li key={JSON.stringify(item)}>
            <details {...stylex.props(s.context)}>
              <summary {...stylex.props(s.contextSummary, ui.focus)}>
                <span {...stylex.props(s.contextIcon)}>
                  <Icon name={icon} size={14} />
                </span>
                <span {...stylex.props(s.contextQuote)}>{name}</span>
                <Button
                  variant="icon"
                  size="small"
                  aria-label={`Show ${name} on the page`}
                  title="Show on page"
                  onClick={(event) => {
                    event.preventDefault();
                    onShowOnPage(item);
                  }}
                >
                  <Icon name="locate" size={14} />
                </Button>
              </summary>
              {item.step && <p {...stylex.props(s.step)}>{item.step}</p>}
              <p {...stylex.props(s.sourceMeta)}>
                {decodeURIComponent(item.address)} · {item.source}:{item.startLine}–{item.endLine}
              </p>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** "9 s", "2 min 5 s": how long a reply took. */
function lasted(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return seconds % 60 ? `${minutes} min ${seconds % 60} s` : `${minutes} min`;
}

/** Seconds since `since`, counting up while the agent works. */
function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span {...styled("elapsed")} title="Since your newest message">
      {lasted(now - new Date(since).getTime())}
    </span>
  );
}

/** A turn's header: who wrote it on the left, details and the time on the right. */
function TurnHeader({
  author,
  detail,
  message,
}: {
  author: string;
  detail?: ReactNode;
  message?: { seq: number; createdAt: string };
}) {
  return (
    <header {...stylex.props(s.meta)}>
      <span {...stylex.props(s.author)}>{author}</span>
      <span {...stylex.props(s.metaEnd)}>
        {detail}
        {detail && message && <span aria-hidden="true">·</span>}
        {message && (
          <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>
            {time(message.createdAt)}
          </time>
        )}
      </span>
    </header>
  );
}

function ReaderView({
  message,
  onShowOnPage,
}: {
  message: ReaderMessage;
  onShowOnPage: (item: ContextItem) => void;
}) {
  return (
    <article {...styled("reader-message", s.turn)} data-seq={message.seq}>
      <TurnHeader author="You" message={message} />
      <div {...stylex.props(s.readerBubble)}>
        <p {...stylex.props(s.messageText)}>{message.text}</p>
        {message.context.length > 0 && (
          <ContextList items={message.context} onShowOnPage={onShowOnPage} />
        )}
      </div>
    </article>
  );
}

function AgentView({ message, asked }: { message: AgentMessage; asked: string | undefined }) {
  // From the message it answers to the reply, as the counter showed while it worked. When
  // the server saw the agent read it, the tooltip tells waiting from working.
  const at = (iso: string) => new Date(iso).getTime();
  const replied = at(message.createdAt);
  const took = asked ? lasted(replied - at(asked)) : undefined;
  const split =
    asked && message.readAt
      ? `Waited ${lasted(at(message.readAt) - at(asked))} for an agent, which worked ${lasted(replied - at(message.readAt))}`
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
}

/** What the server knows, and nothing more: it cannot see an agent between its commands. */
const presence: Record<ChatState["agent"], string> = {
  listening: "Agent connected",
  read: "Agent working, not connected",
  away: "Agent not connected",
};

/** What a person gives their agent to connect it to this chat. */
/**
 * One line above the message box while no agent is connected. Messages written meanwhile
 * wait in the chat, and an agent that connects receives every unread one.
 */
function Connect({ start }: { start: string }) {
  const [copied, copy] = useCopy();
  return (
    <div {...styled("connect", s.connect)}>
      <span {...stylex.props(s.connectText)}>
        To get replies, give this prompt to your agent in the project folder.
      </span>
      <Button
        size="small"
        title={copied === "failed" ? "The clipboard is not available" : undefined}
        onClick={() => void copy(start)}
      >
        <Icon
          name={copied === "copied" ? "check" : copied === "failed" ? "close" : "copy"}
          size={14}
        />
        {copied === "copied" ? "Copied" : copied === "failed" ? "Not copied" : "Copy prompt"}
      </Button>
    </div>
  );
}

const scrollKey = "yapparatus:chat-scroll";

/**
 * Scroll like a messaging app. At the bottom, the thread stays at the bottom as messages
 * arrive and replies finish rendering; scrolled up, nothing moves it. The position survives
 * remounts and reloads. Returns a function that jumps to the bottom and keeps following,
 * for sending: the new message may render before the scroll event says the thread is at the
 * bottom, and the thread must follow it anyway.
 */
function useStickyScroll(thread: RefObject<HTMLDivElement | null>): () => void {
  const toBottom = useRef(() => {});
  useEffect(() => {
    const element = thread.current;
    const content = element?.firstElementChild;
    if (!element || !content) return;
    const atBottom = () => element.scrollHeight - element.scrollTop - element.clientHeight < 40;
    let saved: { top: number; bottom: boolean } = { top: 0, bottom: true };
    try {
      saved = JSON.parse(sessionStorage.getItem(scrollKey) ?? "") ?? saved;
    } catch {}
    let stick = saved.bottom;
    // Messages arrive after mounting, so a saved position is applied once the thread is tall
    // enough to have it.
    let restore: number | undefined = stick ? undefined : saved.top;
    const follow = () => {
      if (stick) element.scrollTop = element.scrollHeight;
      else if (restore !== undefined && element.scrollHeight - element.clientHeight >= restore) {
        element.scrollTop = restore;
        restore = undefined;
      }
    };
    follow();
    // Only the reader leaves the bottom. The browser also scrolls when the content or the
    // thread changes size, such as when the message box shrinks after sending, and its scroll
    // event can arrive after newer content rendered: read as the reader's, it would stop the
    // thread from following the reply or the typing dots.
    let readerAt = Number.NEGATIVE_INFINITY;
    const reader = () => {
      readerAt = performance.now();
    };
    const intents = ["wheel", "touchmove", "keydown", "pointerdown"] as const;
    for (const type of intents) element.addEventListener(type, reader, { passive: true });
    const onScroll = () => {
      if (restore !== undefined) return;
      const bottom = atBottom();
      if (bottom || performance.now() - readerAt < 1000) stick = bottom;
      sessionStorage.setItem(scrollKey, JSON.stringify({ top: element.scrollTop, bottom: stick }));
    };
    toBottom.current = () => {
      restore = undefined;
      stick = true;
      element.scrollTop = element.scrollHeight;
    };
    const resized = new ResizeObserver(follow);
    resized.observe(content);
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      resized.disconnect();
      element.removeEventListener("scroll", onScroll);
      for (const type of intents) element.removeEventListener(type, reader);
    };
  }, [thread]);
  return useCallback(() => toBottom.current(), []);
}

/**
 * Clearing cannot be undone, so the header asks first, in place of its title and buttons.
 * Focus starts on Cancel; Escape, or focus leaving the question, cancels.
 */
function ConfirmClear({ onClear, onCancel }: { onClear: () => void; onCancel: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => cancel.current?.focus(), []);
  return (
    <div
      role="alertdialog"
      aria-label="Clear the chat"
      aria-describedby="confirm-clear-text"
      tabIndex={-1}
      {...styled("confirm-clear", s.confirm)}
      // Safari does not focus a clicked button; keep focus here so the click is not a blur.
      onMouseDown={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onCancel();
      }}
    >
      <div {...stylex.props(s.headerText)}>
        <h2 {...stylex.props(s.title)}>Clear the chat?</h2>
        <p id="confirm-clear-text" {...stylex.props(s.subtitle)}>
          Clear your agent's context too.
        </p>
      </div>
      <Button size="small" variant="danger" onClick={onClear}>
        Clear
      </Button>
      <Button ref={cancel} size="small" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

export interface ChatProps {
  chat: ChatState;
  /** What the next message is about: the pills above the message box. */
  context: ContextItem[];
  setContext: (update: (current: ContextItem[]) => ContextItem[]) => void;
  full: boolean;
  setFull: (full: boolean) => void;
  onClose: () => void;
  onShowOnPage: (item: ContextItem) => void;
  onError: (message: string) => void;
  question: string;
  setQuestion: (question: string) => void;
  panelRef: Ref<HTMLElement>;
}

export function Chat(props: ChatProps) {
  const { chat, context, setContext, onError, question, setQuestion } = props;
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const thread = useRef<HTMLDivElement>(null);
  const count = chat.messages.length;
  const newestReaderMessage = chat.messages.findLast((m) => m.author === "reader");
  const newestReader = newestReaderMessage?.seq ?? 0;
  const newestReaderAt = newestReaderMessage?.createdAt;
  const unread = newestReader > chat.repliedTo;

  const scrollToBottom = useStickyScroll(thread);

  async function submit() {
    if (sending || !question.trim()) return;
    setSending(true);
    try {
      await commands.send({ text: question, context });
      // Sending shows the newest message, wherever the reader had scrolled.
      scrollToBottom();
      setQuestion("");
      setContext(() => []);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSending(false);
    }
  }

  return (
    <aside
      ref={props.panelRef}
      aria-label="Chat"
      {...styled("chat", s.panel, props.full && s.panelFull)}
      // Inline, so it also wins over a width set by dragging the panel edge.
      style={props.full ? { width: "100vw" } : undefined}
    >
      <header {...stylex.props(s.header)}>
        {clearing && count > 0 ? (
          <ConfirmClear
            onClear={() => {
              setClearing(false);
              void commands.clear().catch((cause: unknown) => onError(String(cause)));
            }}
            onCancel={() => setClearing(false)}
          />
        ) : (
          <>
            <div {...stylex.props(s.headerText)}>
              <h2 {...stylex.props(s.title)}>Ask about this document</h2>
              <p {...styled("presence", s.subtitle)} data-agent={chat.agent}>
                <span {...stylex.props(s.presence, chat.agent === "listening" && s.presenceOn)} />
                {presence[chat.agent]}
              </p>
            </div>
            <Button
              variant="icon"
              aria-label="Clear chat"
              title="Clear chat"
              disabled={count === 0}
              onClick={() => setClearing(true)}
            >
              <Icon name="clear" />
            </Button>
            <Button
              variant="icon"
              aria-label={props.full ? "Return to page" : "Full width"}
              title={props.full ? "Return to page" : "Full width"}
              onClick={() => props.setFull(!props.full)}
            >
              <Icon name={props.full ? "collapse" : "expand"} />
            </Button>
            <Button variant="icon" aria-label="Close" title="Close" onClick={props.onClose}>
              <Icon name="close" />
            </Button>
          </>
        )}
      </header>

      <div ref={thread} {...styled("messages", s.thread)}>
        <div {...stylex.props(s.column, props.full && s.columnFull)}>
          {count === 0 && (
            <div {...stylex.props(s.empty)}>
              <p {...stylex.props(s.emptyTitle)}>Ask anything about this document.</p>
              <ul {...stylex.props(s.tips)}>
                <li>Select text and choose Ask to quote it.</li>
                <li>Hover a heading, figure, table, or code block and choose Ask about this.</li>
                <li>Click a box or arrow in a diagram to point at it.</li>
                <li>Ask for changes too. The agent can edit the pages.</li>
              </ul>
            </div>
          )}
          {chat.messages.map((message) =>
            message.author === "reader" ? (
              <ReaderView key={message.seq} message={message} onShowOnPage={props.onShowOnPage} />
            ) : (
              <AgentView
                key={message.seq}
                message={message}
                asked={chat.messages.find((m) => m.seq === message.to)?.createdAt}
              />
            ),
          )}
          {unread && chat.agent !== "away" && (
            <div {...stylex.props(s.turn)}>
              <TurnHeader
                author="Agent"
                detail={newestReaderAt && <Elapsed since={newestReaderAt} />}
              />
              <Typing
                label={
                  chat.agent === "listening"
                    ? "The agent has your message"
                    : "The agent is working on your message"
                }
              />
            </div>
          )}
        </div>
      </div>

      <form
        {...styled("composer", s.composer)}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div {...stylex.props(s.column, props.full && s.columnFull)}>
          {chat.agent === "away" && <Connect start={chat.start} />}
          <div {...stylex.props(s.box)}>
            {context.length > 0 && (
              <div {...styled("context-items", s.chips)}>
                {context.map((item, index) => (
                  <div key={JSON.stringify(item)} {...stylex.props(s.chip)}>
                    <Icon name={describeItem(item).icon} size={13} />
                    <span {...stylex.props(s.chipText)} title={decodeURIComponent(item.address)}>
                      {describeItem(item).name}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove context ${index + 1}`}
                      onClick={() => setContext((current) => current.filter((_, i) => i !== index))}
                      {...stylex.props(s.chipRemove, ui.focus)}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              id="question"
              aria-label="Message"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends and Shift+Enter starts a new line. Enter that confirms an input
                // method's composition, as when typing Japanese, does neither.
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder={
                context.length
                  ? "Ask about the selected parts…"
                  : "Ask a question or request a change…"
              }
              rows={3}
              {...stylex.props(s.textarea)}
            />
            <div {...styled("composer-actions", s.boxFooter)}>
              <span {...stylex.props(s.grow)} />
              <Button
                type="submit"
                variant="primary"
                size="small"
                disabled={sending || !question.trim()}
                title="Send (Enter; Shift+Enter for a new line)"
                aria-keyshortcuts="Enter"
              >
                Send <Icon name="send" size={14} />
              </Button>
            </div>
          </div>
        </div>
      </form>
    </aside>
  );
}

const rise = stylex.keyframes({
  "0%": { opacity: 0.35, transform: "translateY(0)" },
  "30%": { opacity: 1, transform: "translateY(-4px)" },
  "60%": { opacity: 0.35, transform: "translateY(0)" },
  "100%": { opacity: 0.35, transform: "translateY(0)" },
});

const fadeIn = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const s = stylex.create({
  panel: {
    position: "fixed",
    zIndex: layer.chat,
    top: 0,
    right: 0,
    bottom: 0,
    display: { default: "flex", [when.print]: "none" },
    flexDirection: "column",
    width: {
      default: `var(--chat-width, ${sizes.chatWidth})`,
      [when.smallScreen]: "100vw",
    },
    minWidth: { default: 340, [when.smallScreen]: 0 },
    maxWidth: "100vw",
    resize: { default: "horizontal", [when.smallScreen]: "none" },
    direction: "rtl",
    overflow: "hidden",
    backgroundColor: theme.surface,
    borderLeftWidth: 1,
    borderLeftStyle: "solid",
    borderLeftColor: theme.border,
    fontFamily: theme.sans,
  },
  panelFull: {
    width: "100vw",
    resize: "none",
  },
  header: {
    direction: "ltr",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    minHeight: sizes.headerHeight,
    paddingBlock: space.xs,
    paddingInline: `${space.lg} ${space.sm}`,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: theme.border,
  },
  confirm: {
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    flexGrow: 1,
    minWidth: 0,
    outlineStyle: "none",
  },
  headerText: {
    flexGrow: 1,
    minWidth: 0,
  },
  title: {
    margin: 0,
    color: theme.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  subtitle: {
    margin: 0,
    color: theme.textMuted,
    fontSize: fontSize.xs,
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
  meta: {
    display: "flex",
    alignItems: "baseline",
    gap: space.sm,
    marginBottom: space.xs,
    color: theme.textMuted,
    fontSize: fontSize.xs,
    fontVariantNumeric: "tabular-nums",
  },
  author: {
    color: theme.textBody,
    fontWeight: fontWeight.semibold,
  },
  metaEnd: {
    display: "flex",
    gap: space.xs,
    minWidth: 0,
    marginLeft: "auto",
    whiteSpace: "nowrap",
  },
  metaLink: {
    color: { default: theme.textMuted, ":hover": theme.text },
    textDecoration: "none",
  },
  messageText: {
    margin: 0,
    color: theme.text,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.normal,
    whiteSpace: "pre-wrap",
  },
  contexts: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: space.xs,
    margin: 0,
    marginTop: space.sm,
    padding: 0,
    listStyle: "none",
  },
  context: {
    minWidth: 0,
    borderRadius: radius.md,
    backgroundColor: theme.surface,
  },
  contextSummary: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    paddingBlock: space.xxs,
    paddingInline: `${space.sm} ${space.xxs}`,
    borderRadius: radius.md,
    cursor: "pointer",
    listStyle: "none",
    color: theme.textMuted,
    fontSize: fontSize.xs,
    "::-webkit-details-marker": { display: "none" },
  },
  contextIcon: {
    display: "inline-flex",
  },
  contextQuote: {
    flexGrow: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  step: {
    margin: 0,
    paddingBlock: space.sm,
    paddingInline: space.md,
    color: theme.textBody,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.normal,
  },
  sourceMeta: {
    margin: 0,
    paddingInline: space.md,
    paddingBottom: space.sm,
    color: theme.textMuted,
    fontSize: fontSize.xs,
  },
  agentContent: {
    minWidth: 0,
    overflowX: "auto",
    color: theme.textBody,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.normal,
  },
  typing: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    margin: 0,
    paddingBlock: space.sm,
    paddingInline: space.md,
    borderRadius: radius.full,
    backgroundColor: theme.surfaceRaised,
  },
  typingDot: {
    width: space.sm,
    height: space.sm,
    borderRadius: radius.full,
    backgroundColor: theme.textMuted,
    animationName: rise,
    animationDuration: "1.2s",
    animationIterationCount: "infinite",
  },
  typingDot2: {
    animationDelay: "0.15s",
  },
  typingDot3: {
    animationDelay: "0.3s",
  },
  replyBody: {
    animationName: fadeIn,
    animationDuration: duration.slow,
    animationTimingFunction: "ease-out",
  },
  muted: {
    margin: 0,
    color: theme.textMuted,
  },
  error: {
    margin: 0,
    color: theme.error,
    fontSize: fontSize.sm,
  },
  connect: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    marginBottom: space.sm,
  },
  connectText: {
    flexGrow: 1,
    minWidth: 0,
    color: theme.textMuted,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.snug,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.xs,
  },
  composer: {
    direction: "ltr",
    paddingBlock: `${space.md} ${space.lg}`,
    paddingInline: space.lg,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: theme.border,
  },
  /** The message box: a control, so its edge meets 3:1, and focus shows in every mode. */
  box: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: theme.borderControl, ":focus-within": theme.accent },
    backgroundColor: theme.canvas,
    transitionProperty: "border-color",
    transitionDuration: duration.fast,
    outlineStyle: {
      default: "none",
      [when.forcedColors]: { default: "none", ":focus-within": "solid" },
    },
    outlineWidth: 2,
    outlineOffset: 2,
  },
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.xs,
    paddingBlock: `${space.sm} 0`,
    paddingInline: space.sm,
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    maxWidth: "100%",
    paddingBlock: space.xxs,
    paddingInline: `${space.sm} ${space.xxs}`,
    borderRadius: radius.full,
    backgroundColor: theme.accentSurface,
    color: theme.accentStrong,
    fontSize: fontSize.xs,
  },
  chipText: {
    maxWidth: 220,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  chipRemove: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.full,
    cursor: "pointer",
    backgroundColor: { default: "transparent", ":hover": theme.accentBorder },
    color: "inherit",
  },
  textarea: {
    display: "block",
    width: "100%",
    minHeight: 72,
    maxHeight: 280,
    paddingBlock: space.md,
    paddingInline: space.md,
    resize: "vertical",
    borderWidth: 0,
    outlineStyle: "none",
    backgroundColor: "transparent",
    color: theme.text,
    fontFamily: theme.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.normal,
    "::placeholder": { color: theme.textMuted },
  },
  boxFooter: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    paddingBlock: `0 ${space.sm}`,
    paddingInline: space.sm,
  },
  presence: {
    display: "inline-block",
    width: space.sm,
    height: space.sm,
    marginRight: space.sm,
    borderRadius: radius.full,
    verticalAlign: "middle",
    backgroundColor: theme.borderControl,
  },
  presenceOn: {
    backgroundColor: theme.success,
    boxShadow: `0 0 0 3px color-mix(in srgb, ${theme.success} 15%, transparent)`,
  },
  grow: {
    flexGrow: 1,
    textAlign: "right",
  },
});
