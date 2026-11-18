import { pages } from "virtual:yapparatus/document";
import * as stylex from "@stylexjs/stylex";
import { elementSeparator, quoteOf, splitAddress } from "../../document/address.ts";
import { linesLabel, parseFileAddress } from "../../document/file-address.ts";
import type { Reference } from "../../document/reference.ts";
import { findTarget, numbering, numbersOf } from "../addressing/numbering.ts";
import { type AppIconName, AppIcon as Icon } from "../controls/app-icon.tsx";
import { Button } from "../controls/button.tsx";
import { focus } from "../style/focus.ts";
import { fontSize, lineHeight, radius, space, theme } from "../style/theme.stylex.ts";

/** How a reference reads in the chat: an icon and its name. */
export function describeReference(item: Reference) {
  const icon: Record<Reference["kind"], AppIconName> = {
    page: "page",
    text: "quote",
    section: "hash",
    figure: "image",
    table: "table",
    listing: "code",
    code: "code",
    "diagram-element": "diagram",
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
  const [owner = "", element] = anchor.split(elementSeparator);
  const label = owner ? findTarget(owner, page)?.label : undefined;
  const heading = page?.outline?.headings.find((h) => h.id === anchor)?.text;
  const caption = page?.outline?.numbered.find((n) => n.id === owner)?.caption;
  const joined = (...values: Array<string | undefined>) =>
    [...new Set(values.filter(Boolean))].join(" · ");
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
          : item.kind === "diagram-element"
            ? joined(label, element)
            : item.kind === "code"
              ? joined("Code", label)
              : joined(label, caption);
  return { icon: icon[item.kind], name: name || item.kind };
}

/** The references of a sent message, each with its address and a Show on page button. */
export function ReferenceList({
  items,
  onShowOnPage,
}: {
  items: Reference[];
  onShowOnPage: (item: Reference) => void;
}) {
  return (
    <ul {...stylex.props(s.references)}>
      {items.map((item) => {
        const { icon, name } = describeReference(item);
        return (
          <li key={JSON.stringify(item)}>
            <details {...stylex.props(s.reference)}>
              <summary {...stylex.props(s.referenceSummary, focus.ring)}>
                <span {...stylex.props(s.referenceIcon)}>
                  <Icon name={icon} size={14} />
                </span>
                <span {...stylex.props(s.referenceQuote)}>{name}</span>
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

const s = stylex.create({
  references: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: space.xs,
    margin: 0,
    marginTop: space.sm,
    padding: 0,
    listStyle: "none",
  },
  reference: {
    minWidth: 0,
    borderRadius: radius.md,
    backgroundColor: theme.surface,
  },
  referenceSummary: {
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
  referenceIcon: {
    display: "inline-flex",
  },
  referenceQuote: {
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
});
