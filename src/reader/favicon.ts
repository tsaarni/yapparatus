import { favicon } from "virtual:yapparatus/document";

/**
 * Use the document's `favicon` icon in the browser tab. A favicon is its own document, so theme
 * variables do not reach it: a monochrome icon gets the accent of the light or dark tab strip.
 */
export function installFavicon() {
  if (!favicon) return;
  const accent =
    "<style>svg{color:#8b9bff}@media (prefers-color-scheme: light){svg{color:#3d4fd6}}</style>";
  const icon = favicon.replace(/^<svg[^>]*>/, (open) => open + accent);
  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/svg+xml";
  link.href = `data:image/svg+xml,${encodeURIComponent(icon)}`;
  document.head.append(link);
}
