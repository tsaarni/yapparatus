/**
 * Everything the agent reads, written in one place: messages, idle output, errors, and the
 * exact snippet to run next. The library prints this text verbatim.
 */
import { quoteOf, splitAddress } from "../document.ts";
import type { ContextItem, Diagnostic, ReaderMessage } from "../protocol.ts";

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

function describeDiagnostic(d: Diagnostic, fresh = false): string {
  const where = [
    d.source ?? "",
    d.line ? `:${d.line}` : "",
    d.target && d.origin !== "reply" ? `#${d.target}` : "",
    d.origin === "reply" && d.target ? `reply #${d.target}` : "",
  ].join("");
  return `- ${fresh ? "new " : ""}${d.severity} ${d.code}${where ? ` ${where}` : ""}: ${d.message}`;
}

/**
 * The document's errors and warnings, new errors marked, and the pages whose diagram and
 * render checks are out of date because no browser has rendered them since they changed.
 */
export function diagnosticsSection(
  diagnostics: Diagnostic[],
  isNew: (d: Diagnostic) => boolean,
  unchecked: string[],
): string {
  const sorted = [...diagnostics].sort((a, b) => Number(isNew(b)) - Number(isNew(a)));
  return [
    diagnostics.length
      ? `Diagnostics (${diagnostics.length}). Fix those your edits caused:\n${sorted
          .slice(0, 40)
          .map((d) => describeDiagnostic(d, isNew(d)))
          .join("\n")}`
      : "Diagnostics: none",
    unchecked.length
      ? `Not checked since they changed, because no browser has shown them: ${unchecked.join(", ")}`
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
    `Edit pages (${guide}), reply, or both; always reply, so the reader knows what changed. Then reply and wait:`,
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
      ? `If your edits caused them, fix them. If you change pages, tell the reader:\n\n${replySnippet(cursor)}\n\nOtherwise wait for the next messages:\n\n${waitSnippet(cursor)}`
      : `If your edits caused them, fix them. Then wait for the next messages:\n\n${waitSnippet(cursor)}`,
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
    `You are connected to a Yapparatus document. A reader asks about it in the browser, and you answer by editing its pages, by replying in the chat, or both. Edit pages following ${guide}. A reply is MDX shown in the chat: Figure, Chart, Diagram, Step, Table, Listing, Excerpt, Ref, Icon, and FileTree work without imports, links may point at any page or source file, and <Ref to="/page#id" /> at a page or anything on it. Reply even when the answer is a page edit.`,
    foldersSection(folders),
    `Run this from the project directory, ${root}, and follow what it prints. It waits until the reader writes, which may take hours: run it in the background if you are notified when commands finish, otherwise with the longest timeout your shell allows, and run it again if your shell stops it.`,
    waitSnippet(after),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function rejectedReply(to: number, errors: string[]): string {
  return [
    "The reply was not accepted:",
    errors.map((error) => `- ${error}`).join("\n"),
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
    `If your edits caused them, fix them and send the reply again:\n\n${replySnippet(to)}`,
    past
      ? `If your edits did not cause them, say so in the reply and send it with this cursor, which is past them:\n\n${replySnippet(past)}`
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
