/** The prompt to copy into an agent, shown above the message box while no agent is connected. */

import * as stylex from "@stylexjs/stylex";
import { AppIcon as Icon } from "../controls/app-icon.tsx";
import { Button } from "../controls/button.tsx";
import { useCopy } from "../controls/clipboard.ts";
import { styled } from "../style/styled.ts";
import { fontSize, lineHeight, space, theme } from "../style/theme.stylex.ts";

/**
 * One line above the message box while no agent is connected. Messages written meanwhile
 * wait in the chat, and an agent that connects receives every unread one.
 */
export function Connect({ start }: { start: string }) {
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

const s = stylex.create({
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
});
