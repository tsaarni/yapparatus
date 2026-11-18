/** The menu beside selected text or code, with Copy link and Comment. */

import type { DocumentPage } from "virtual:yapparatus/document";
import * as stylex from "@stylexjs/stylex";
import { textFragment } from "../../document/address.ts";
import type { Reference } from "../../document/reference.ts";
import { addressHref, hashMode, href, parseAddress } from "../addressing/router.ts";
import type { SelectionMenu as MenuState } from "../addressing/selection.ts";
import {
  codeAddress,
  fileReferencesFromRange,
  referencesFromRange,
  selectedCode,
} from "../addressing/selection.ts";
import { AppIcon as Icon } from "../controls/app-icon.tsx";
import { Button } from "../controls/button.tsx";
import { useCopy } from "../controls/clipboard.ts";
import { styled } from "../style/styled.ts";
import { layer, radius, space, theme, when } from "../style/theme.stylex.ts";

const live = import.meta.env.DEV;

/**
 * The menu over selected text or code: Copy link, which copies the address of the words or the
 * lines, and Comment, in live mode. Both are icon buttons.
 */
export function SelectionMenu({
  menu,
  dismiss,
  page,
  onComment,
}: {
  menu: MenuState;
  dismiss: () => void;
  page: DocumentPage | undefined;
  onComment: (items: Reference[]) => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Selection actions"
      {...styled("selection-menu", s.selectionMenu)}
      style={{ left: menu.x, top: menu.y }}
    >
      <CopyPassageLink
        link={() => {
          const range = menu.range;
          const item = range && page && referencesFromRange(range, page)[0];
          if (!item || !page) {
            const [code] = range ? selectedCode(range) : [];
            const address = code && codeAddress(hashMode ? { ...code, words: "" } : code);
            return address && new URL(addressHref(address), location.href).href;
          }
          const { fragment } = parseAddress(item.address);
          const directive = hashMode ? "" : textFragment(range.toString());
          const link = `${href(page, fragment)}${fragment ? "" : "#"}${directive}`;
          return new URL(link, location.href).href;
        }}
        dismiss={dismiss}
      />
      {live && (
        <Button
          variant="icon"
          size="small"
          aria-label="Comment"
          title="Comment"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const range = menu.range;
            if (range) {
              const text = page ? referencesFromRange(range, page) : [];
              onComment([...text, ...fileReferencesFromRange(range)]);
            }
            window.getSelection()?.removeAllRanges();
            dismiss();
          }}
        >
          <Icon name="comment" size={14} />
        </Button>
      )}
    </div>
  );
}

/**
 * The selection menu's Copy link. It confirms on the button, then the menu closes, so the
 * reader sees the copy happen without a notice to dismiss.
 */
function CopyPassageLink({
  link,
  dismiss,
}: {
  link: () => string | undefined;
  dismiss: () => void;
}) {
  const [copied, copy] = useCopy();
  const label =
    copied === "copied" ? "Copied" : copied === "failed" ? "Clipboard not available" : "Copy link";
  return (
    <Button
      variant="icon"
      size="small"
      aria-label={label}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        const url = link();
        if (!url) return dismiss();
        void copy(url).then(() => window.setTimeout(dismiss, 700));
      }}
    >
      <Icon
        name={copied === "copied" ? "check" : copied === "failed" ? "close" : "link"}
        size={14}
      />
    </Button>
  );
}

const s = stylex.create({
  selectionMenu: {
    position: "fixed",
    zIndex: layer.popover,
    display: { default: null, [when.print]: "none" },
    padding: space.xxs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: theme.borderStrong,
    backgroundColor: theme.surfaceRaised,
    boxShadow: theme.shadowRaised,
  },
});
