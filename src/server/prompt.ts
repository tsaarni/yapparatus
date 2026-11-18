/**
 * Everything the agent reads, written in one place: messages, idle output, errors, and the
 * exact command to run next. The library passes this text on unchanged.
 */
import { quoteOf, splitAddress } from "../document/address.ts";
import { type Diagnostic, diagnosticCodes } from "../document/diagnostic.ts";
import type { Reference } from "../document/reference.ts";
import type { ReaderMessage, ReportedDiagnostic, UncheckedPage } from "../protocol/rest-api.ts";

const run = "node --input-type=module-typescript -e";

/** The command that waits for reader messages and new errors. */
export function waitCommand(): string {
  return `${run} 'import { waitForMessage } from "yapparatus/agent"; console.log((await waitForMessage()).prompt);'`;
}

/** The command that sends MDX on stdin as the reply, then waits again. */
export function replyCommand(): string {
  return [
    `${run} 'import { sendReply, waitForMessage } from "yapparatus/agent"; await sendReply(); console.log((await waitForMessage()).prompt);' <<'MDX'`,
    "<your reply>",
    "MDX",
  ].join("\n");
}

/** The command that prints the document's diagnostics once the checks of recent edits are done. */
export function checkCommand(): string {
  return `${run} 'import { checkDocument } from "yapparatus/agent"; console.log((await checkDocument()).prompt);'`;
}

/** The command that saves a figure's picture as a PNG file that the agent names. */
export function pictureCommand(): string {
  return `${run} 'import { savePicture } from "yapparatus/agent"; await savePicture("/page#figure", "/tmp/figure.png");'`;
}

/** The answers of the picture resource when it cannot draw a picture. */
export const pictureErrors = {
  badPath: () =>
    "Ask for a figure as /-/api/figures/<page>/<figure>, from its address /<page>#<figure>.",
  badIds: () => "ids is true or false.",
  noPage: (page: string) =>
    `There is no page /${page} in the document. A figure's address is /<page>#<figure>, as in links.`,
  noDiagram: (address: string, diagrams: string[]) =>
    `${address} is not a diagram with an id. ${
      diagrams.length
        ? `The diagrams with an id on its page: ${diagrams.join(", ")}.`
        : "Its page has no diagram with an id."
    } Only a <Diagram> with an id has a picture.`,
  chart: (address: string) =>
    `${address} is a chart, and only diagrams have pictures. A browser checks a chart when it shows the page.`,
  notDrawn: (address: string) =>
    `${address} could not be drawn. Check the document, fix the diagram's errors, and ask again:\n\n${checkCommand()}`,
  notCompiled: (page: string, message: string) =>
    `The page ${page} does not compile: ${message}\nCheck the document, fix it, and ask again:\n\n${checkCommand()}`,
};

/**
 * One line per diagnostic, the same everywhere the agent reads one:
 * "- error CODE file:lines, /page#figure, elements a, b: message". A reply being checked has no
 * file yet, so its problems name only the line.
 */
function describeDiagnostic(d: Diagnostic | ReportedDiagnostic, fresh = false): string {
  const { endLine, address } = d as ReportedDiagnostic;
  const lines = d.line ? `:${d.line}${endLine && endLine > d.line ? `-${endLine}` : ""}` : "";
  const place = [
    d.source ? `${d.source}${lines}` : d.line ? `line ${d.line}` : "",
    address ?? "",
    d.origin === "reply" && d.target ? `reply #${d.target}` : "",
    d.elements?.length ? `elements ${d.elements.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const severity = diagnosticCodes[d.code].severity;
  return `- ${fresh ? "new " : ""}${severity} ${d.code}${place ? ` ${place}` : ""}: ${d.message}`;
}

/**
 * The document's errors and warnings, new errors marked, and the pages whose browser checks
 * (charts, render and runtime errors) are out of date because no browser has rendered them
 * since they changed, with what was found before the change. Only a browser checks them, and
 * the agent may have none: the reader's browser checks a page when the reader opens the
 * reply's link to it. Diagrams are checked when the page compiles.
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
      ? `Not checked since they changed: charts, render errors, and runtime errors on these pages. A browser checks them when the reader opens a page, so link each change in your reply:\n${unchecked
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

const kindName: Record<Reference["kind"], string> = {
  page: "page",
  text: "text",
  section: "section",
  figure: "figure",
  table: "table",
  listing: "listing",
  code: "code",
  "diagram-element": "diagram element",
  file: "file",
  lines: "file lines",
};

/**
 * One line per reference: what, its lines in the source, its address, and the reader's words or step.
 * A page or a whole file has no lines: the agent reads the file.
 */
function describeReference(item: Reference): string {
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
        message.references.length
          ? `References, at the lines the reader saw. If the file changed since, find each by its address and words:\n${message.references
              .map(describeReference)
              .join("\n")}`
          : "No references: a message about the document in general.",
      ].join("\n"),
    ),
    diagnostics,
    `Edit pages (${guide}) or not, and reply. If you edited pages, check the document first and fix what it lists:\n\n${checkCommand()}\n\nThen reply and wait:`,
    replyCommand(),
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
    `Fix them, then check the document again:\n\n${checkCommand()}`,
    canReply
      ? `Tell the reader what you changed, and wait:\n\n${replyCommand()}`
      : `Then wait:\n\n${waitCommand()}`,
  ].join("\n\n");
}

export function idlePrompt(): string {
  return `Nothing new. Wait again:\n\n${waitCommand()}`;
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
    `You are connected to a Yapparatus document. In the browser, a reader comments on it and sends you messages. You act on each by editing its pages, by replying in the chat, or both. Edit pages following ${guide}. A reply is MDX shown in the chat: Figure, Chart, Diagram, Step, Table, Listing, Excerpt, Ref, Icon, FileTree, Tabs, Columns, and Panel work without imports, links may point at any page or source file, and <Ref to="/page#id" /> at a page or anything on it. Reply even when you edit a page: say in a sentence what changed on each page, with a link to the change, such as [the new section on misses](/cache#misses).`,
    foldersSection(folders),
    `Run this from the project directory, ${root}, and follow what it prints. It waits until the reader writes, which may take hours: run it in the background if you are notified when commands finish, otherwise with the longest timeout your shell allows, and run it again if your shell stops it.`,
    waitCommand(),
    `After editing pages, and before you reply, check the document and fix its errors and warnings:\n\n${checkCommand()}`,
    `Diagnostics catch overlaps and unknown elements, not a drawing that is hard to read. After you write or change a diagram and the check is clean, look at it once: this saves its picture as the reader sees it in the PNG file that you name, for you to open and then delete. Add { ids: true } as a third argument to label each element with its id.\n\n${pictureCommand()}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function rejectedReply(errors: Diagnostic[]): string {
  return [
    "The reply was not sent:",
    errors.map((d) => describeDiagnostic(d)).join("\n"),
    "Fix the MDX and run the command again.",
  ].join("\n\n");
}

/** A reply with no reader message to answer: none was given to the agent, or the chat was cleared. */
export function nothingToAnswer(): string {
  return `There is no reader message to answer. Wait for one:\n\n${waitCommand()}`;
}

export const takenOver = "Another agent took over the chat. Stop waiting.";
