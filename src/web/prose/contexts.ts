/** The React contexts that tell prose where it is shown: a page, a reply, a figure, or a file. */

import { createContext, useContext } from "react";
import type { FileAddress } from "../../document/file-address.ts";

/**
 * Where prose is shown: a page, or a chat reply with smaller type. Content in a reply
 * prefixes its ids, so its anchors never collide with the page's.
 */
export const ReadingContext = createContext({ reply: false, idPrefix: "" });

/** Inside a titled table or listing, which is the target itself. */
export const InTargetContext = createContext(false);

/** Inside a figure, which already draws the frame, so content inside draws none of its own. */
export const InFigureContext = createContext(false);

/** The DOM id for an authored id, namespaced inside replies. */
export function useScopedId(id: string | undefined) {
  const { idPrefix } = useContext(ReadingContext);
  return id ? `${idPrefix}${id}` : undefined;
}

/**
 * The source file a code block shows: an excerpt's lines on a page, or the whole file in the
 * file view. Its lines carry their numbers in the file.
 */
export interface SourceFileCode {
  file: FileAddress;
  /** The whole file, in the file view; otherwise an excerpt, which links to it. */
  whole: boolean;
  /** The widest line number's digits, so numbers line up. */
  digits: number;
  /** Long lines wrap under their own number instead of scrolling. */
  wrap: boolean;
}

/** The source file the code blocks inside show, or undefined for a page's own code. */
export const SourceFileContext = createContext<SourceFileCode | undefined>(undefined);
