import { pages } from "virtual:yapparatus/document";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";
import type { ReportedDiagnostic } from "../../protocol/rest-api.ts";
import { href, navigate } from "../addressing/router.ts";
import { AppIcon as Icon } from "../controls/app-icon.tsx";
import { Button } from "../controls/button.tsx";
import { useCopy } from "../controls/clipboard.ts";
import { focus } from "../style/focus.ts";
import {
  duration,
  fontSize,
  fontWeight,
  layer,
  letterSpacing,
  lineHeight,
  radius,
  sizes,
  space,
  theme,
} from "../style/theme.stylex.ts";

function where(diagnostic: ReportedDiagnostic) {
  const page = pages.find((p) => p.source === diagnostic.source);
  return { page, label: page?.outline.title ?? diagnostic.source ?? "Application" };
}

const counted = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The header's indicator, shown only when the document has errors or warnings, and its list.
 * An item's code and line open where it is. Its buttons copy it and attach it to the message box.
 */
export function DiagnosticsMenu({
  diagnostics,
  onComment,
}: {
  diagnostics: ReportedDiagnostic[];
  onComment?: (diagnostic: ReportedDiagnostic) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  if (!diagnostics.length) return null;
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.length - errors;
  const summary = [errors && counted(errors, "error"), warnings && counted(warnings, "warning")]
    .filter(Boolean)
    .join(", ");
  const groups = new Map<string, ReportedDiagnostic[]>();
  for (const diagnostic of diagnostics) {
    const key = diagnostic.source ?? "";
    groups.set(key, [...(groups.get(key) ?? []), diagnostic]);
  }
  return (
    <div ref={root} {...stylex.props(s.root)}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={summary}
        onClick={() => setOpen(!open)}
        {...stylex.props(s.badge, errors ? s.badgeError : s.badgeWarning, focus.ring)}
      >
        <span {...stylex.props(s.dot, errors ? s.dotError : s.dotWarning)} />
        {summary}
      </button>
      {open && (
        <div role="dialog" aria-label="Errors and warnings" {...stylex.props(s.panel)}>
          <div {...stylex.props(s.list)}>
            {[...groups].map(([key, items]) => {
              const { page, label } = where(items[0] as ReportedDiagnostic);
              return (
                <section key={key}>
                  <h3 {...stylex.props(s.group)}>{label}</h3>
                  <ul {...stylex.props(s.items)}>
                    {items.map((diagnostic, i) => (
                      <Row
                        // biome-ignore lint/suspicious/noArrayIndexKey: Diagnostics have no ids.
                        key={i}
                        diagnostic={diagnostic}
                        {...(page && {
                          onOpen: () => {
                            navigate(href(page, diagnostic.target ?? ""));
                            setOpen(false);
                          },
                        })}
                        {...(onComment &&
                          page && {
                            onComment: () => {
                              setOpen(false);
                              onComment(diagnostic);
                            },
                          })}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** A diagnostic as text to paste elsewhere: its code, its file and line, and its message. */
function asText(diagnostic: ReportedDiagnostic) {
  const place = [diagnostic.source, diagnostic.line].filter(Boolean).join(":");
  return `${diagnostic.code}${place ? ` ${place}` : ""}: ${diagnostic.message}`;
}

/**
 * One diagnostic in the list. Its code and line open where it is. The message is plain text,
 * so the reader can select it, and the buttons copy it or attach it to the message box.
 */
function Row({
  diagnostic,
  onOpen,
  onComment,
}: {
  diagnostic: ReportedDiagnostic;
  onOpen?: () => void;
  onComment?: () => void;
}) {
  const [copied, copy] = useCopy();
  const copyLabel =
    copied === "copied"
      ? `${diagnostic.code} copied`
      : copied === "failed"
        ? "The clipboard is not available"
        : `Copy ${diagnostic.code}`;
  return (
    <li {...stylex.props(s.row)}>
      <span {...stylex.props(s.dot, diagnostic.severity === "error" ? s.dotError : s.dotWarning)} />
      <span {...stylex.props(s.itemText)}>
        <button
          type="button"
          disabled={!onOpen}
          onClick={onOpen}
          {...stylex.props(s.place, focus.ring)}
        >
          <code {...stylex.props(s.code)}>{diagnostic.code}</code>
          {diagnostic.line ? `Line ${diagnostic.line}` : ""}
        </button>
        {diagnostic.message}
      </span>
      <span {...stylex.props(s.actions)}>
        <Button
          variant="icon"
          size="small"
          aria-label={copyLabel}
          title={copied === "idle" ? "Copy" : copyLabel}
          onClick={() => void copy(asText(diagnostic))}
        >
          <Icon name={copied === "copied" ? "check" : "copy"} size={14} />
        </Button>
        {onComment && (
          <Button
            variant="icon"
            size="small"
            aria-label={`Comment on ${diagnostic.code}`}
            title="Comment"
            onClick={onComment}
          >
            <Icon name="comment" size={14} />
          </Button>
        )}
      </span>
    </li>
  );
}

const s = stylex.create({
  root: { position: "relative" },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.sm,
    height: sizes.control,
    paddingInline: space.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderStyle: "solid",
    cursor: "pointer",
    fontFamily: theme.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    transitionProperty: "border-color",
    transitionDuration: duration.fast,
  },
  badgeError: {
    borderColor: { default: theme.errorBorder, ":hover": theme.error },
    backgroundColor: theme.errorSurface,
    color: theme.error,
  },
  badgeWarning: {
    borderColor: { default: theme.warningBorder, ":hover": theme.warning },
    backgroundColor: theme.warningSurface,
    color: theme.warning,
  },
  dot: { flexShrink: 0, width: space.sm, height: space.sm, borderRadius: radius.full },
  dotError: { backgroundColor: theme.error },
  dotWarning: { backgroundColor: theme.warning },
  panel: {
    position: "absolute",
    zIndex: layer.popover,
    top: `calc(100% + ${space.sm})`,
    right: 0,
    width: `min(440px, calc(100vw - ${space.xl2}))`,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: theme.borderStrong,
    backgroundColor: theme.surfaceRaised,
    boxShadow: theme.shadowOverlay,
    overflow: "hidden",
  },
  list: {
    maxHeight: "min(420px, 60vh)",
    overflowY: "auto",
    paddingBlock: space.sm,
  },
  group: {
    margin: 0,
    paddingBlock: `${space.sm} ${space.xs}`,
    paddingInline: space.lg,
    color: theme.textMuted,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.caps,
    textTransform: "uppercase",
  },
  items: { margin: 0, padding: 0, listStyle: "none" },
  row: {
    display: "flex",
    alignItems: "baseline",
    gap: space.sm,
    paddingBlock: space.sm,
    paddingLeft: space.lg,
    paddingRight: space.sm,
    backgroundColor: { default: "transparent", ":hover": theme.surfaceHover },
    color: theme.textBody,
    fontFamily: theme.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.normal,
  },
  // A path or an address has no spaces, so it breaks anywhere and stays out of the buttons.
  itemText: { flexGrow: 1, minWidth: 0, overflowWrap: "anywhere", userSelect: "text" },
  place: {
    marginRight: space.sm,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    cursor: { default: "pointer", ":disabled": "default" },
    color: { default: theme.textMuted, ":hover": theme.text },
    fontFamily: theme.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.normal,
    textAlign: "left",
    textDecorationLine: { default: "none", ":hover": "underline" },
  },
  code: {
    marginRight: space.sm,
    fontFamily: theme.mono,
    fontSize: fontSize.xs,
  },
  // The buttons sit on the first line whatever its height, and never shrink.
  actions: { display: "flex", flexShrink: 0, alignSelf: "start" },
});
