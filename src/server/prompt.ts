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
    `${run} 'import { sendReply, waitForMessage } from "yapparatus/agent"; await sendReply(); console.log("Reply sent. Waiting for the next message."); console.log((await waitForMessage()).prompt);' <<'MDX'`,
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
 * "- error CODE file:lines, /page#figure, elements a, b: message". A reply names only the line.
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
 * The document's errors and warnings, new errors first, and the pages no browser has rendered
 * since they changed, with what was found before. The reader's browser checks those pages.
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
      ? `Not checked since they changed: chart drawings, render errors, and runtime errors on these pages. A browser checks them when the reader opens a page, so link each change in your reply:\n${unchecked
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
 * One line per reference: what, its source lines, its address, and the reader's words or step.
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

/** The reader's text, with any closing tag in it escaped so that it cannot end its element. */
function readerText(text: string): string {
  return text.replaceAll("</reader_message", "&lt;/reader_message");
}

/** One reader message in its element, then the references the reader attached. */
function describeMessage(message: ReaderMessage): string {
  return [
    `<reader_message time="${timeOf(message.createdAt)}">`,
    readerText(message.text),
    "</reader_message>",
    message.references.length
      ? `Attached by the reader, at the lines they saw:\n${message.references
          .map(describeReference)
          .join("\n")}`
      : "No references: a message about the document in general.",
  ].join("\n");
}

/** Reader messages not answered yet, the diagnostics, and how to answer. */
export function messagesPrompt(
  messages: ReaderMessage[],
  diagnostics: string,
  guide: string,
): string {
  const referenced = messages.some((message) => message.references.length > 0);
  return [
    ...messages.map(describeMessage),
    referenced ? "If a file changed since, find each reference by its address and words." : "",
    diagnostics,
    `Act on the messages: edit pages following ${guide}, reply, or both. If you edited pages, check the document first and fix what it lists:\n\n${checkCommand()}\n\nThen reply and wait:`,
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

/** What an agent's waiting read says when it ends with nothing new. */
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

/** The text a person gives an agent to connect it to the document, and how to work in it. */
export function startPrompt(guide: string, folders: Record<string, string>, root: string): string {
  return [
    `You are connected to a Yapparatus document. In the browser, a reader comments on it and sends you messages. Each message arrives in a <reader_message> element, which holds only the reader's own words. You act on each by editing its pages, by replying in the chat, or both.`,
    foldersSection(folders),
    `Work in this loop, from the project directory, ${root}:`,
    [
      `1. Wait for the reader with the command below. It may wait for hours: run it in the background if you are notified when commands finish, otherwise with the longest timeout your shell allows, and run it again if your shell stops it.`,
      `2. Edit pages following ${guide}. Its components, diagrams, and charts are not in your training data: read the guide's page for each feature before you write it.`,
      `3. Check the document and fix every error and warning it lists. You may run the check in the same command that writes the pages.`,
      `4. Diagnostics catch overlaps and unknown elements, not a drawing that is hard to read. After a diagram is clean, save its picture as a PNG file you name, open it, fix what is hard to read, and stop when it reads clearly. Delete the file afterwards. Add { ids: true } as a third argument to label each element with its id.`,
      `5. Reply with the command each prompt ends with, even when you edited pages: say in a sentence what changed on each page, with a link to the change, such as [the new section on misses](/cache#misses). A reply is MDX, as the guide's Replies section says. The command sends the reply and waits again.`,
    ].join("\n"),
    `Wait:\n\n${waitCommand()}`,
    `Check:\n\n${checkCommand()}`,
    `Save a picture:\n\n${pictureCommand()}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Why the server refused a reply: its errors, and to send it again fixed. */
export function rejectedReply(errors: Diagnostic[]): string {
  return [
    "The reply was not sent:",
    errors.map((d) => describeDiagnostic(d)).join("\n"),
    "Fix the MDX and run the command again.",
  ].join("\n\n");
}

/** A reply with no reader message to answer: none was given to the agent, or the chat cleared. */
export function nothingToAnswer(): string {
  return `There is no reader message to answer. Wait for one:\n\n${waitCommand()}`;
}

/** The error an older agent gets when a newer agent takes over the chat. */
export const takenOver = "Another agent took over the chat. Stop waiting.";
