/**
 * Targets: everything a reader can link to or ask about.
 *
 * A target is an element with `data-target` (its kind), `data-label` ("Table 6.3"),
 * `data-title` (caption or heading), and, when it can be linked, a real `id`. Sections,
 * figures, tables, listings, code blocks, and diagram parts all follow this contract, so
 * linking, asking, and locating work the same way for each.
 */
import * as stylex from "@stylexjs/stylex";
import { createContext, type ReactNode, useContext } from "react";
import type { TargetKind } from "../protocol.ts";
import { AppIcon as Icon } from "./icons.tsx";
import { duration, layer, radius, space, theme, when } from "./theme.stylex.ts";
import { Button, styled, useCopy } from "./ui.tsx";

export interface TargetHandlers {
  /** Add the target containing this element to the question. Absent outside live mode. */
  ask?: (element: Element) => void;
  /** The full URL of the target containing this element, for copying. */
  link: (element: Element) => string | undefined;
}

export const TargetContext = createContext<TargetHandlers | undefined>(undefined);

/** The attributes that make an element a target. */
export function targetProps(kind: TargetKind, label?: string, title?: string) {
  return {
    "data-target": kind,
    ...(label ? { "data-label": label } : {}),
    ...(title ? { "data-title": title } : {}),
  };
}

/**
 * Link and Ask buttons for the enclosing target. They appear on hover or keyboard focus,
 * so the page stays quiet while reading.
 */
export function TargetActions({
  name,
  linkable = true,
  placement = "corner",
  children,
}: {
  /** What the target is called, for the buttons' accessible names: "Table 6.3". */
  name: string;
  /** Whether the target has a stable id to link to. */
  linkable?: boolean;
  placement?: "corner" | "inline";
  children?: ReactNode;
}) {
  const handlers = useContext(TargetContext);
  const [copied, copy] = useCopy();
  if (!handlers || (!linkable && !handlers.ask)) return children ?? null;
  return (
    <span {...styled("target-actions", s.bar, placement === "corner" ? s.corner : s.inline)}>
      {children}
      {linkable && (
        <Button
          variant="icon"
          size="small"
          aria-label={
            copied === "copied"
              ? `Link to ${name} copied`
              : copied === "failed"
                ? "The clipboard is not available"
                : `Copy link to ${name}`
          }
          title={
            copied === "copied"
              ? "Link copied"
              : copied === "failed"
                ? "The clipboard is not available"
                : "Copy link"
          }
          onClick={(event) => {
            const url = handlers.link(event.currentTarget);
            if (url) void copy(url);
          }}
        >
          <Icon
            name={copied === "copied" ? "check" : copied === "failed" ? "close" : "link"}
            size={14}
          />
        </Button>
      )}
      {handlers.ask && (
        <Button
          variant="icon"
          size="small"
          aria-label={`Ask about ${name}`}
          title="Ask about this"
          onClick={(event) => handlers.ask?.(event.currentTarget)}
        >
          <Icon name="ask" size={14} />
        </Button>
      )}
    </span>
  );
}

const s = stylex.create({
  bar: {
    display: { default: "inline-flex", [when.print]: "none" },
    alignItems: "center",
    gap: space.xxs,
    // Hidden until the target is hovered or something inside it has focus; always
    // visible where there is no hover.
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover")]: 1,
      ":focus-within": 1,
      [when.noHover]: 1,
    },
    transitionProperty: "opacity",
    transitionDuration: duration.fast,
  },
  corner: {
    position: "absolute",
    zIndex: layer.raised,
    top: space.sm,
    right: space.sm,
    padding: space.xxs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: theme.border,
    backgroundColor: theme.surfaceRaised,
  },
  inline: {
    marginLeft: "0.5em",
    verticalAlign: "middle",
  },
});

/** Styles for a target container: anchors the actions and marks it for hover. */
const hostStyles = stylex.create({ host: { position: "relative" } });
export const targetHost = [hostStyles.host, stylex.defaultMarker()] as const;
