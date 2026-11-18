import * as stylex from "@stylexjs/stylex";
import type { AnchorHTMLAttributes } from "react";
import { usePage } from "../addressing/numbering.ts";
import { resolveHref } from "../addressing/router.ts";
import { focus } from "../style/focus.ts";
import { duration, theme } from "../style/theme.stylex.ts";

/** A link: page addresses resolve against the page, and other sites open in a new tab. */
export function Link({ href: raw, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const page = usePage();
  const target = resolveHref(raw, page);
  const external = /^[a-z][a-z0-9+.-]*:/i.test(target);
  return (
    <a
      {...props}
      href={target}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      {...stylex.props(s.link, focus.ring)}
    />
  );
}

const s = stylex.create({
  link: {
    color: theme.accentStrong,
    textDecorationLine: "underline",
    textDecorationColor: { default: theme.accentBorder, ":hover": theme.accent },
    textDecorationThickness: "1px",
    textUnderlineOffset: "0.24em",
    transitionProperty: "text-decoration-color",
    transitionDuration: duration.fast,
  },
});
