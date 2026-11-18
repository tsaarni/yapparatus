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
 * The menu over selected text or code: Comment, in live mode, and Copy link, which copies the
 * address of the words or the lines.
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
      {live && (
        <Button
          variant="ghost"
          size="small"
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
          <Icon name="comment" size={14} /> Comment
        </Button>
      )}
      <CopyPassageLink
        link={() => {
          const range = menu.range;
          const item = range && page && referencesFromRange(range, page)[0];
          if (!item || !page) {
            // Selected code links to its lines in the file, and to its words when it leaves
            // out some of them, which browsers highlight. The single file links the lines.
            const [code] = range ? selectedCode(range) : [];
            const address = code && codeAddress(hashMode ? { ...code, words: "" } : code);
            return address && new URL(addressHref(address), location.href).href;
          }
          const { fragment } = parseAddress(item.address);
          // Text fragments need a real URL; the single file can only link the section.
          const directive = hashMode ? "" : textFragment(range.toString());
          const link = `${href(page, fragment)}${fragment ? "" : "#"}${directive}`;
          return new URL(link, location.href).href;
        }}
        dismiss={dismiss}
      />
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
  return (
    <Button
      variant="ghost"
      size="small"
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
      {copied === "copied"
        ? "Copied"
        : copied === "failed"
          ? "Clipboard not available"
          : "Copy link"}
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
