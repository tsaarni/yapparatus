import * as stylex from "@stylexjs/stylex";
import type { MDXProps } from "mdx/types";
import {
  Component,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { createLogger } from "../../protocol/log.ts";
import type { AgentMessage } from "../../protocol/rest-api.ts";
import { PageContext } from "../addressing/numbering.ts";
import { reportDiagnostics } from "../live/client.ts";
import { ReadingContext } from "../prose/contexts.ts";
import { components } from "../registry.ts";
import { duration, fontSize, theme } from "../style/theme.stylex.ts";
import { Typing } from "./typing.tsx";

const log = createLogger("chat");

/**
 * A reply that fails to render is an error; it ends the agent's wait, so it can send a fix.
 * A reply never changes, so the finding lasts as long as the reply.
 */
function reportReply(message: AgentMessage, error: string) {
  reportDiagnostics({
    source: message.module.replace(/^\//, ""),
    diagnostics: [
      {
        origin: "reply",
        code: "REPLY_FAILED",
        message: `A reply could not be shown: ${error}`,
        target: String(message.seq),
      },
    ],
  });
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

/** An agent's reply: MDX the server accepted, shown with the document's components. */
export function Reply({ message }: { message: AgentMessage }) {
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

const fadeIn = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const s = stylex.create({
  replyBody: {
    animationName: fadeIn,
    animationDuration: duration.slow,
    animationTimingFunction: "ease-out",
  },
  error: {
    margin: 0,
    color: theme.error,
    fontSize: fontSize.sm,
  },
});
