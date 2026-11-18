import * as stylex from "@stylexjs/stylex";
import type { Reference } from "../../document/reference.ts";
import { AppIcon as Icon } from "../style/app-icon.tsx";
import { Button } from "../style/button.tsx";
import { focus } from "../style/focus.ts";
import { styled } from "../style/styled.ts";
import {
  duration,
  fontSize,
  lineHeight,
  radius,
  sizes,
  space,
  theme,
  when,
} from "../style/theme.stylex.ts";
import { Connect } from "./connect.tsx";
import { describeReference } from "./reference-list.tsx";

/**
 * The message box: the references the next message is about, the text, and Send. Enter sends
 * and Shift+Enter starts a new line.
 */
export function Composer({
  references,
  setReferences,
  draft,
  setDraft,
  sending,
  onSubmit,
  full,
  prompt,
}: {
  references: Reference[];
  setReferences: (update: (current: Reference[]) => Reference[]) => void;
  draft: string;
  setDraft: (draft: string) => void;
  sending: boolean;
  onSubmit: () => void;
  full: boolean;
  /** The start prompt, shown while no agent is connected. */
  prompt: string | undefined;
}) {
  return (
    <form
      {...styled("composer", s.composer)}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div {...stylex.props(s.column, full && s.columnFull)}>
        {prompt !== undefined && <Connect start={prompt} />}
        <div {...stylex.props(s.box)}>
          {references.length > 0 && (
            <div {...styled("references", s.chips)}>
              {references.map((item, index) => (
                <div key={JSON.stringify(item)} {...stylex.props(s.chip)}>
                  <Icon name={describeReference(item).icon} size={13} />
                  <span {...stylex.props(s.chipText)} title={decodeURIComponent(item.address)}>
                    {describeReference(item).name}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove reference ${index + 1}`}
                    onClick={() =>
                      setReferences((current) => current.filter((_, i) => i !== index))
                    }
                    {...stylex.props(s.chipRemove, focus.ring)}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            id="draft"
            aria-label="Message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends and Shift+Enter starts a new line. Enter that confirms an input
              // method's composition, as when typing Japanese, does neither.
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                onSubmit();
              }
            }}
            placeholder={
              references.length
                ? "Comment on the selection…"
                : "Write a message or request a change…"
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
              disabled={sending || !draft.trim()}
              title="Send (Enter; Shift+Enter for a new line)"
              aria-keyshortcuts="Enter"
            >
              Send <Icon name="send" size={14} />
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

const s = stylex.create({
  composer: {
    direction: "ltr",
    paddingBlock: `${space.md} ${space.lg}`,
    paddingInline: space.lg,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: theme.border,
  },
  column: {
    width: "100%",
  },
  columnFull: {
    maxWidth: sizes.textWidth,
    marginInline: "auto",
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
  grow: {
    flexGrow: 1,
    textAlign: "right",
  },
});
