/**
 * The file view: a source file the document shows, at `/-/files/<folder>/<path>`, highlighted
 * like code on a page, with its line numbers. `#L40-L72` highlights lines and scrolls to them.
 * The view lists the page sections that link to or excerpt the file, so a reader can go from
 * code to the text that explains it.
 */
import { type DocumentPage, pages } from "virtual:yapparatus/document";
import { files as builtFiles } from "virtual:yapparatus/files";
import * as stylex from "@stylexjs/stylex";
import type { ElementContent, Root } from "hast";
import {
  type CSSProperties,
  createElement,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  type FileAddress,
  fileAddress,
  type LineRange,
  parseFileAddress,
  parseLines,
} from "../files.ts";
import type { ContextItem, SourceFileView } from "../protocol.ts";
import { onFileChanged, readFile } from "./api.ts";
import { prose, SourceFileContext } from "./prose.tsx";
import { fileHref, href } from "./router.ts";
import { fileContext } from "./selection.ts";
import {
  TargetActions,
  TargetContext,
  type TargetHandlers,
  targetHost,
  targetProps,
} from "./targets.tsx";
import { fontSize, fontWeight, lineHeight, sizes, space, theme } from "./theme.stylex.ts";
import { styled, ui } from "./ui.tsx";

const live = import.meta.env.DEV;

/** Live, the server reads the file; a build carries the files its pages name. */
async function load(file: FileAddress): Promise<SourceFileView> {
  if (live) return readFile(file.folder, file.path);
  const entry = builtFiles[`${file.folder}/${file.path}`];
  if (!entry)
    throw new Error(
      "This build does not include it: a build carries only the files its pages name.",
    );
  return (await entry()).default;
}

export function FileView({
  file,
  fragment,
  onAsk,
}: {
  file: FileAddress;
  fragment: string;
  /** Add context to the question. Absent outside live mode. */
  onAsk?: (items: ContextItem[]) => void;
}) {
  const address = fileAddress(file);
  const [view, setView] = useState<SourceFileView | { error: string }>();
  const [revision, setRevision] = useState(0);
  const selected = useMemo(() => parseLines(fragment), [fragment]);

  useEffect(
    () => onFileChanged((changed) => changed === address && setRevision((r) => r + 1)),
    [address],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: Load again when the file changes on disk.
  useEffect(() => {
    let current = true;
    load(file).then(
      (loaded) => current && setView(loaded),
      (error: Error) => current && setView({ error: error.message }),
    );
    return () => {
      current = false;
    };
  }, [address, revision]);
  // Arriving at lines shows them. Lines picked on screen stay where they are.
  useLayoutEffect(() => {
    if (!view || "error" in view || !selected) return;
    const first = document.querySelector(
      `main article [data-file] [data-line="${selected.start}"]`,
    );
    const box = first?.getBoundingClientRect();
    if (box && (box.top < 0 || box.bottom > window.innerHeight))
      first?.scrollIntoView({ block: "center" });
  }, [view, selected]);

  const handlers = useMemo<TargetHandlers>(
    () => ({
      link: () => new URL(fileHref(file), location.href).href,
      ...(onAsk
        ? {
            ask: () => {
              const region = document.querySelector<HTMLElement>("main article [data-file]");
              if (region) void fileContext(region).then((item) => item && onAsk([item]));
            },
          }
        : {}),
    }),
    [file, onAsk],
  );
  const code = useMemo(
    () => (view && !("error" in view) ? render(view.code, selected) : null),
    [view, selected],
  );
  const name = file.path.split("/").at(-1) ?? file.path;

  return (
    <TargetContext.Provider value={handlers}>
      <header {...styled("file-header", s.header)}>
        <h1
          {...targetProps("file", undefined, file.path)}
          {...stylex.props(s.title, ...targetHost)}
        >
          {file.path}
          <TargetActions name={name} placement="inline" />
        </h1>
        <Mentions file={file} />
      </header>
      {!view && <p {...stylex.props(s.status)}>Loading {file.path}…</p>}
      {view && "error" in view && (
        <p {...stylex.props(s.status)} role="alert">
          {file.path} cannot be shown. {view.error}
        </p>
      )}
      {view && !("error" in view) && (
        <div {...stylex.props(s.code)}>
          <SourceFileContext.Provider
            value={{ file, whole: true, digits: String(view.lines).length }}
          >
            {code}
          </SourceFileContext.Provider>
        </div>
      )}
    </TargetContext.Provider>
  );
}

/** The page sections that link to or excerpt this file, in reading order. */
function Mentions({ file }: { file: FileAddress }) {
  const mentions = mentionsOf(file);
  if (!mentions.length) return null;
  return (
    <nav aria-label="Discussed in" {...stylex.props(s.mentions)}>
      <span {...stylex.props(s.mentionsLabel)}>Discussed in</span>
      <ul {...stylex.props(s.mentionList)}>
        {mentions.map(({ page, section, heading }, i) => (
          <li key={`${page.id}#${section ?? ""}`} {...stylex.props(s.mention)}>
            {i > 0 && (
              <span aria-hidden="true" {...stylex.props(s.mentionSection)}>
                ·{" "}
              </span>
            )}
            <a href={href(page, section)} {...stylex.props(s.mentionLink, ui.focus)}>
              {page.outline.title}
              {heading && <span {...stylex.props(s.mentionSection)}> › {heading}</span>}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function mentionsOf(file: FileAddress) {
  const seen = new Set<string>();
  const found: Array<{ page: DocumentPage; section?: string; heading?: string }> = [];
  for (const page of pages)
    for (const link of page.outline.links) {
      const target = parseFileAddress(link.href);
      if (target?.folder !== file.folder || target.path !== file.path) continue;
      const key = `${page.id}#${link.section ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const heading = page.outline.headings.find((h) => h.id === link.section)?.text;
      found.push({
        page,
        ...(link.section ? { section: link.section } : {}),
        ...(heading ? { heading } : {}),
      });
    }
  return found;
}

/* ---------- Highlighted code as React ---------- */

/** The same components that show code on pages, so a file looks the same as an excerpt. */
const renderers: Record<string, unknown> = { pre: prose.pre, code: prose.code, span: prose.span };

/** "color:var(--x);font-style:italic" → { color: "var(--x)", fontStyle: "italic" } */
function styleObject(style: string): CSSProperties {
  const out: Record<string, string> = {};
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    const name = declaration.slice(0, colon).trim();
    if (colon < 0 || !name) continue;
    const key = name.startsWith("--")
      ? name
      : name.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    out[key] = declaration.slice(colon + 1).trim();
  }
  return out as CSSProperties;
}

/** Render Shiki's hast with React; lines in `selected` are marked for the reader. */
function render(
  node: Root | ElementContent,
  selected: LineRange | undefined,
  key?: number,
): ReactNode {
  if (node.type === "text") return node.value;
  if (node.type === "root")
    return node.children.map((child, i) => render(child as ElementContent, selected, i));
  if (node.type !== "element") return null;
  const {
    class: classes,
    className,
    style,
    tabindex,
    ...rest
  } = node.properties as Record<string, unknown>;
  const props: Record<string, unknown> = { ...rest, key };
  const names = classes ?? className;
  if (names) props.className = Array.isArray(names) ? names.join(" ") : String(names);
  if (typeof style === "string") props.style = styleObject(style);
  if (tabindex !== undefined) props.tabIndex = Number(tabindex);
  const line = Number(rest["data-line"]);
  if (selected && line >= selected.start && line <= selected.end) props["data-selected"] = "true";
  return createElement(
    (renderers[node.tagName] ?? node.tagName) as string,
    props,
    ...node.children.map((child, i) => render(child, selected, i)),
  );
}

const s = stylex.create({
  header: {
    gridColumn: "content",
    minWidth: 0,
  },
  title: {
    margin: 0,
    color: theme.text,
    fontFamily: theme.mono,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.snug,
    overflowWrap: "anywhere",
    scrollMarginTop: sizes.headerHeight,
  },
  status: {
    gridColumn: "content",
    color: theme.textMuted,
    fontSize: fontSize.sm,
  },
  code: {
    gridColumn: "content-start / wide-end",
    display: "grid",
    minWidth: 0,
  },
  mentions: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: space.sm,
    marginTop: space.md,
    fontSize: fontSize.sm,
  },
  mentionsLabel: {
    color: theme.textMuted,
  },
  mentionList: {
    display: "contents",
    listStyleType: "none",
  },
  mention: {
    display: "inline",
  },
  mentionLink: {
    color: theme.accentStrong,
    textDecorationLine: { default: "none", ":hover": "underline" },
    textUnderlineOffset: "0.24em",
  },
  mentionSection: {
    color: theme.textMuted,
  },
});
