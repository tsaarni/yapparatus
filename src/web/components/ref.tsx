/** The Ref component, a cross-reference whose text follows the document's numbering. */

import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { elementSeparator } from "../../document/address.ts";
import { createLogger } from "../../protocol/log.ts";
import { findTarget, usePage } from "../addressing/numbering.ts";
import { href } from "../addressing/router.ts";
import { focus } from "../style/focus.ts";
import { theme } from "../style/theme.stylex.ts";

const log = createLogger("components");

/** What an author writes on a cross-reference. */
export interface RefProps {
  /**
   * A figure, table, or listing id, a heading id on this page, "/page", or "/page#id".
   * `figure--element` points at a diagram element or step, and opens that step.
   */
  to: string;
  /** Link text. Default: the target's label, such as "Figure 3.1", or its caption or heading. */
  children?: ReactNode;
}

/** A cross-reference that stays correct when figures and sections are renumbered. */
export function Ref({ to, children }: RefProps) {
  const page = usePage();
  const [base = "", element] = to.split(elementSeparator);
  const target = findTarget(base, page);
  if (!target) {
    if (import.meta.env.DEV) log.warn(`Ref: nothing has the id "${to}".`);
    return <span {...stylex.props(s.missing)}>{children ?? `[${to}]`}</span>;
  }
  return (
    <a
      href={href(
        target.page,
        element ? `${target.fragment}${elementSeparator}${element}` : target.fragment,
      )}
      {...stylex.props(s.ref, focus.ring)}
    >
      {children ?? target.label}
    </a>
  );
}

const s = stylex.create({
  ref: {
    color: theme.accentStrong,
    textDecorationLine: "underline",
    textDecorationColor: theme.accentBorder,
    textUnderlineOffset: "0.24em",
  },
  missing: {
    color: theme.warning,
  },
});
