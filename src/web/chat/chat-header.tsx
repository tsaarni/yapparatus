/** The chat panel header: the agent's presence and the Clear, Full width, and Close buttons. */

import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";
import type { AgentState } from "../../protocol/rest-api.ts";
import { AppIcon as Icon } from "../controls/app-icon.tsx";
import { Button } from "../controls/button.tsx";
import { commands } from "../live/client.ts";
import { styled } from "../style/styled.ts";
import { fontSize, fontWeight, radius, sizes, space, theme } from "../style/theme.stylex.ts";

/** What the server knows, and nothing more: it cannot see an agent between its commands. */
const presence: Record<AgentState, string> = {
  waiting: "Agent connected",
  working: "Agent working, not connected",
  away: "Agent not connected",
};

/**
 * The panel's header: the title and the agent's presence, and the Clear, Full width, and Close
 * buttons. Clear asks first, in place of the title and the buttons.
 */
export function ChatHeader({
  agent,
  count,
  full,
  setFull,
  onClose,
  onError,
}: {
  agent: AgentState;
  count: number;
  full: boolean;
  setFull: (full: boolean) => void;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [clearing, setClearing] = useState(false);
  return (
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
            <h2 {...stylex.props(s.title)}>Chat</h2>
            <p {...styled("presence", s.subtitle)} data-agent={agent}>
              <span {...stylex.props(s.presence, agent === "waiting" && s.presenceOn)} />
              {presence[agent]}
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
            aria-label={full ? "Return to page" : "Full width"}
            title={full ? "Return to page" : "Full width"}
            onClick={() => setFull(!full)}
          >
            <Icon name={full ? "collapse" : "expand"} />
          </Button>
          <Button variant="icon" aria-label="Close" title="Close" onClick={onClose}>
            <Icon name="close" />
          </Button>
        </>
      )}
    </header>
  );
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

const s = stylex.create({
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
});
