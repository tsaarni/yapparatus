/// <reference types="unplugin-icons/types/react" />

/** True in the single-file build, which uses #/page URLs because it has no server. */
declare const __YAPPARATUS_HASH_ROUTES__: boolean;

/** The `YAPPARATUS_LOG` level the browser bundle was served or built with; undeclared in Node. */
declare const __YAPPARATUS_LOG__: string | undefined;

declare module "virtual:yapparatus/document" {
  import type { MDXProps } from "mdx/types";
  import type { ComponentType, SVGProps } from "react";
  import type { DocumentSettings, PageOutline } from "yapparatus";
  export interface DocumentPage {
    /** Path inside the content folder without `.mdx`, which is also its address: "reading". */
    id: string;
    /** Path from the project root: "docs/design/rendering.mdx". */
    source: string;
    default: ComponentType<MDXProps>;
    outline: PageOutline;
  }
  export const settings: DocumentSettings;
  /** The `logo` icon, or undefined. */
  export const logo: ComponentType<SVGProps<SVGSVGElement>> | undefined;
  /** The `favicon` icon's SVG text, or undefined. */
  export const favicon: string | undefined;
  export const contentDir: string;
  export const pages: DocumentPage[];
  /** Call `listener` after an edited page was updated in place; returns an unsubscribe. */
  export function onPagesChanged(listener: () => void): () => void;
}

declare module "virtual:yapparatus/files" {
  import type { SourceFileView } from "yapparatus";
  /** The source files a build carries, by "folder/path", each loaded when opened. Empty live. */
  export const files: Record<string, () => Promise<{ default: SourceFileView }>>;
}
