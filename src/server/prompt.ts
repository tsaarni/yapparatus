/**
 * Everything the agent reads, written in one place: messages, idle output, errors, and the
 * exact snippet to run next. The library prints this text verbatim.
 */
import { quoteOf, splitAddress } from "../document.ts";
import {
  type ContextItem,
  type Diagnostic,
  diagnosticCodes,
  type ReaderMessage,
} from "../protocol.ts";

const run = "node --input-type=module-typescript -e";

/** The snippet that waits for reader messages after `after`. */
export function waitSnippet(after: number): string {
  return `${run} 'import { wait } from "yapparatus/agent"; console.log((await wait({ after: ${after} })).prompt);'`;
}

/**
 * The snippet that replies with MDX on stdin, then waits. `to` is the agent's cursor: the reply
 * answers every reader message up to it, and the wait continues after it.
 */
export function replySnippet(to: number): string {
  return [
    `${run} 'import { reply, wait } from "yapparatus/agent"; await reply({ to: ${to} }); console.log((await wait({ after: ${to} })).prompt);' <<'MDX'`,
    "<your reply>",
    "MDX",
  ].join("\n");
}

/** The snippet that prints the document's diagnostics once the checks of recent edits are done. */
export function checkSnippet(): string {
  return `${run} 'import { check } from "yapparatus/agent"; console.log((await check()).prompt);'`;
}

/**
 * One line per diagnostic, the same everywhere the agent reads one: "- error CODE where: message".
 * A reply being checked has no file yet, so its problems name only the line.
 */
function describeDiagnostic(d: Diagnostic, fresh = false): string {
  const where = d.source
    ? [
        d.source,
        d.line ? `:${d.line}` : "",
        d.target && d.origin !== "reply" ? `#${d.target}` : "",
      ].join("")
    : d.line
      ? `line ${d.line}`
      : "";
  const reply = d.origin === "reply" && d.target ? `reply #${d.target}` : "";
  const place = [where, reply].filter(Boolean).join(" ");
  const severity = diagnosticCodes[d.code].severity;
  return `- ${fresh ? "new " : ""}${severity} ${d.code}${place ? ` ${place}` : ""}: ${d.message}`;
}

/**
 * The document's errors and warnings, new errors marked, and the pages whose diagram and
 * render checks are out of date because no browser has rendered them since they changed.
 * `unchecked` are those pages' addresses. Only a browser checks them, and the agent may have
 * none: the reader's browser checks a page when the reader opens the reply's link to it.
 */
export function diagnosticsSection(
  diagnostics: Diagnostic[],
  isNew: (d: Diagnostic) => boolean,
  unchecked: string[],
): string {
  const sorted = [...diagnostics].sort((a, b) => Number(isNew(b)) - Number(isNew(a)));
  return [
    diagnostics.length
      ? `Diagnostics (${diagnostics.length}). Fix them:\n${sorted
          .slice(0, 40)
          .map((d) => describeDiagnostic(d, isNew(d)))
          .join("\n")}`
      : "Diagnostics: none",
    unchecked.length
      ? `Not checked since they changed: diagrams and charts on these pages. They are checked when the reader opens them, so link each change in your reply:\n${unchecked.map((page) => `- ${page}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Where a context item's source is now: lines, "changed" since the reader asked, or none for a page. */
export type Placement = { start: number; end: number } | "changed" | undefined;

const kindName: Record<ContextItem["kind"], string> = {
  page: "page",
  text: "text",
  section: "section",
  figure: "figure",
  table: "table",
  listing: "listing",
  code: "code",
  "diagram-part": "diagram part",
  file: "file",
  lines: "file lines",
};

/** One line per item: what, where in the source now, its address, and the reader's words or step. */
function describeContext(item: ContextItem, placement: Placement): string {
  const { page, anchor } = splitAddress(item.address);
  const lines =
    placement === "changed"
      ? `${item.source}, changed since asked (was ${item.startLine}-${item.endLine})`
      : placement
        ? `${item.source}:${placement.start}${placement.end > placement.start ? `-${placement.end}` : ""}`
        : item.source;
  const quote = quoteOf(item.address);
  // Words selected inside lines of code are text in a source file, as words on a page are text.
  const kind = item.kind === "lines" && quote ? "file text" : kindName[item.kind];
  return [
    `- ${kind}, ${lines}, /${page}${anchor ? `#${anchor}` : ""}`,
    quote ? `: “${quote}”` : "",
    item.step ? `, open at ${item.step}` : "",
  ].join("");
}

function clearedNotice() {
  return "The reader cleared the chat. Earlier messages are gone: do not build on them.";
}

/** "14:02": when a reader wrote, as the agent needs it. Numbers are only for the cursor. */
function timeOf(iso: string): string {
  return new Date(iso).toTimeString().slice(0, 5);
}

/** Reader messages after the cursor, the diagnostics, and how to answer. */
export function messagesPrompt(
  messages: ReaderMessage[],
  place: (item: ContextItem) => Placement,
  diagnostics: string,
  guide: string,
  cursor: number,
  cleared?: number,
): string {
  return [
    cleared ? clearedNotice() : "",
    ...messages.map((message) =>
      [
        `Reader, ${timeOf(message.createdAt)}:`,
        "--- reader ---",
        message.text,
        "--- end reader ---",
        message.context.length
          ? `Context, with lines as they are now:\n${message.context
              .map((item) => describeContext(item, place(item)))
              .join("\n")}`
          : "No context: a question about the document in general.",
      ].join("\n"),
    ),
    diagnostics,
    `Edit pages (${guide}) or not, and reply. Reply and wait:`,
    replySnippet(cursor),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** New errors in the document, with no new reader message: fix them, then reply or wait. */
export function errorsPrompt(
  diagnostics: string,
  cursor: number,
  canReply: boolean,
  cleared?: number,
): string {
  return [
    cleared ? clearedNotice() : "",
    "The document has new errors.",
    diagnostics,
    canReply
      ? `Tell the reader what you changed. The reply is refused while these errors remain:\n\n${replySnippet(cursor)}`
      : `Check, then wait:\n\n${checkSnippet()}\n\n${waitSnippet(cursor)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function idlePrompt(cursor: number, cleared?: number): string {
  return [cleared ? clearedNotice() : "", `Nothing new. Wait again:\n\n${waitSnippet(cursor)}`]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * The folders whose files the document shows, as the agent opens them: "app" → "../app". Each
 * path is relative to the project folder, where the agent runs.
 */
function foldersSection(folders: Record<string, string>): string {
  const names = Object.keys(folders);
  if (!names.length) return "";
  return `The document includes files from these external directories. The address /-/files/<name>/<path>#L10-L20 is lines 10 to 20 of <path> in the directory:\n${names
    .map((name) => `- ${name}: ${folders[name]}`)
    .join("\n")}`;
}

export function startPrompt(
  after: number,
  guide: string,
  folders: Record<string, string>,
  root: string,
): string {
  return [
    `You are connected to a Yapparatus document. A reader asks about it in the browser, and you answer by editing its pages, by replying in the chat, or both. Edit pages following ${guide}. A reply is MDX shown in the chat: Figure, Chart, Diagram, Step, Table, Listing, Excerpt, Ref, Icon, FileTree, Tabs, Columns, and Panel work without imports, links may point at any page or source file, and <Ref to="/page#id" /> at a page or anything on it. Reply even when the answer is a page edit: say in a sentence what changed on each page, with a link to the change, such as [the new section on misses](/cache#misses).`,
    foldersSection(folders),
    `Run this from the project directory, ${root}, and follow what it prints. It waits until the reader writes, which may take hours: run it in the background if you are notified when commands finish, otherwise with the longest timeout your shell allows, and run it again if your shell stops it.`,
    waitSnippet(after),
    `After editing pages, check for errors and warnings:\n\n${checkSnippet()}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function rejectedReply(to: number, errors: Diagnostic[]): string {
  return [
    "The reply was not sent:",
    errors.map((d) => describeDiagnostic(d)).join("\n"),
    "Fix the MDX and send it again:",
    replySnippet(to),
  ].join("\n\n");
}

/**
 * A reply refused because errors appeared after the agent read the message. `past` is a
 * cursor beyond them, offered when using it skips no unread reader message.
 */
export function newErrorsReply(to: number, errors: Diagnostic[], past?: number): string {
  return [
    "The reply was not sent. These errors appeared after you read the message:",
    errors.map((d) => describeDiagnostic(d)).join("\n"),
    `Fix them and send the reply again:\n\n${replySnippet(to)}`,
    past
      ? `If you cannot fix them, say why in the reply and send it with this cursor, past them:\n\n${replySnippet(past)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** A reply whose cursor is from before a clear: the messages it answers are gone. */
export function clearedReply(cleared: number): string {
  return `${clearedNotice()} The reply was not sent. Wait for new messages:\n\n${waitSnippet(cleared)}`;
}

/** A reply with no reader message to answer, or a cursor ahead of the server. */
export function nothingToAnswer(to: number, waitAfter: number): string {
  return `There is no reader message to answer up to #${to}. Wait for one:\n\n${waitSnippet(waitAfter)}`;
}

export const takenOver = "Another agent took over the chat. Stop waiting.";
