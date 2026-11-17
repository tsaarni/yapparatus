/**
 * Everything the agent reads, written in one place: messages, idle output, errors, and the
 * exact snippet to run next. The library passes this text on unchanged.
 */
import { quoteOf, splitAddress } from "../document.ts";
import {
  type ContextItem,
  type Diagnostic,
  diagnosticCodes,
  type ReaderMessage,
  type ReportedDiagnostic,
  type UncheckedPage,
} from "../protocol.ts";

const run = "node --input-type=module-typescript -e";

/** The snippet that waits for reader messages and new errors. */
export function waitSnippet(): string {
  return `${run} 'import { waitForMessage } from "yapparatus/agent"; console.log((await waitForMessage()).prompt);'`;
}

/** The snippet that sends MDX on stdin as the reply, then waits again. */
export function replySnippet(): string {
  return [
    `${run} 'import { sendReply, waitForMessage } from "yapparatus/agent"; await sendReply(); console.log((await waitForMessage()).prompt);' <<'MDX'`,
    "<your reply>",
    "MDX",
  ].join("\n");
}

/** The snippet that prints the document's diagnostics once the checks of recent edits are done. */
export function checkSnippet(): string {
  return `${run} 'import { checkDocument } from "yapparatus/agent"; console.log((await checkDocument()).prompt);'`;
}

/**
 * One line per diagnostic, the same everywhere the agent reads one:
 * "- error CODE file:lines, /page#figure, parts a, b: message". A reply being checked has no
 * file yet, so its problems name only the line.
 */
function describeDiagnostic(d: Diagnostic | ReportedDiagnostic, fresh = false): string {
  const { endLine, address } = d as ReportedDiagnostic;
  const lines = d.line ? `:${d.line}${endLine && endLine > d.line ? `-${endLine}` : ""}` : "";
  const place = [
    d.source ? `${d.source}${lines}` : d.line ? `line ${d.line}` : "",
    address ?? "",
    d.origin === "reply" && d.target ? `reply #${d.target}` : "",
    d.elements?.length ? `parts ${d.elements.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const severity = diagnosticCodes[d.code].severity;
  return `- ${fresh ? "new " : ""}${severity} ${d.code}${place ? ` ${place}` : ""}: ${d.message}`;
}

/**
 * The document's errors and warnings, new errors marked, and the pages whose diagram and
 * render checks are out of date because no browser has rendered them since they changed,
 * with what was found before the change. Only a browser checks them, and the agent may have
 * none: the reader's browser checks a page when the reader opens the reply's link to it.
 */
export function diagnosticsSection(
  diagnostics: ReportedDiagnostic[],
  isNew: (d: ReportedDiagnostic) => boolean,
  unchecked: UncheckedPage[],
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
      ? `Not checked since they changed: diagrams and charts on these pages. They are checked when the reader opens them, so link each change in your reply:\n${unchecked
          .map((page) =>
            [
              `- ${page.address}`,
              ...(page.previous.length
                ? [
                    "  Found before the change, not checked since:",
                    ...page.previous.map((d) => `  ${describeDiagnostic(d)}`),
                  ]
                : []),
            ].join("\n"),
          )
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

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

/**
 * One line per item: what, its lines in the source, its address, and the reader's words or step.
 * A page or a whole file has no lines: the agent reads the file.
 */
function describeContext(item: ContextItem): string {
  const { page, anchor } = splitAddress(item.address);
  const { source, startLine: start, endLine: end } = item;
  const lines =
    item.kind === "page" || item.kind === "file"
      ? source
      : `${source}:${start}${end > start ? `-${end}` : ""}`;
  const quote = quoteOf(item.address);
  // Words selected inside lines of code are text in a source file, as words on a page are text.
  const kind = item.kind === "lines" && quote ? "file text" : kindName[item.kind];
  return [
    `- ${kind}, ${lines}, /${page}${anchor ? `#${anchor}` : ""}`,
    quote ? `: “${quote}”` : "",
    item.step ? `, open at ${item.step}` : "",
  ].join("");
}

/** "14:02": when a reader wrote, as the agent needs it. */
function timeOf(iso: string): string {
  return new Date(iso).toTimeString().slice(0, 5);
}

/** Reader messages not answered yet, the diagnostics, and how to answer. */
export function messagesPrompt(
  messages: ReaderMessage[],
  diagnostics: string,
  guide: string,
): string {
  return [
    ...messages.map((message) =>
      [
        `Reader, ${timeOf(message.createdAt)}:`,
        "--- reader ---",
        message.text,
        "--- end reader ---",
        message.context.length
          ? `Context, at the lines the reader saw. If the file changed since, find each by its address and words:\n${message.context
              .map(describeContext)
              .join("\n")}`
          : "No context: a question about the document in general.",
      ].join("\n"),
    ),
    diagnostics,
    `Edit pages (${guide}) or not, and reply. If you edited pages, check the document first and fix what it lists:\n\n${checkSnippet()}\n\nThen reply and wait:`,
    replySnippet(),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * New errors in the document, with no new reader message: fix them, check the document again,
 * then tell the reader what changed if there is one to tell, and wait.
 */
export function errorsPrompt(diagnostics: string, canReply: boolean): string {
  return [
    "The document has new errors.",
    diagnostics,
    `Fix them, then check the document again:\n\n${checkSnippet()}`,
    canReply
      ? `Tell the reader what you changed, and wait:\n\n${replySnippet()}`
      : `Then wait:\n\n${waitSnippet()}`,
  ].join("\n\n");
}

export function idlePrompt(): string {
  return `Nothing new. Wait again:\n\n${waitSnippet()}`;
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

export function startPrompt(guide: string, folders: Record<string, string>, root: string): string {
  return [
    `You are connected to a Yapparatus document. A reader asks about it in the browser, and you answer by editing its pages, by replying in the chat, or both. Edit pages following ${guide}. A reply is MDX shown in the chat: Figure, Chart, Diagram, Step, Table, Listing, Excerpt, Ref, Icon, FileTree, Tabs, Columns, and Panel work without imports, links may point at any page or source file, and <Ref to="/page#id" /> at a page or anything on it. Reply even when the answer is a page edit: say in a sentence what changed on each page, with a link to the change, such as [the new section on misses](/cache#misses).`,
    foldersSection(folders),
    `Run this from the project directory, ${root}, and follow what it prints. It waits until the reader writes, which may take hours: run it in the background if you are notified when commands finish, otherwise with the longest timeout your shell allows, and run it again if your shell stops it.`,
    waitSnippet(),
    `After editing pages, and before you reply, check the document and fix its errors and warnings:\n\n${checkSnippet()}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function rejectedReply(errors: Diagnostic[]): string {
  return [
    "The reply was not sent:",
    errors.map((d) => describeDiagnostic(d)).join("\n"),
    "Fix the MDX and run the snippet again.",
  ].join("\n\n");
}

/** A reply with no reader message to answer: none was given to the agent, or the chat was cleared. */
export function nothingToAnswer(): string {
  return `There is no reader message to answer. Wait for one:\n\n${waitSnippet()}`;
}

export const takenOver = "Another agent took over the chat. Stop waiting.";
