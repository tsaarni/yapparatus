/// <reference types="unplugin-icons/types/react" />

/** True in the single-file build, which uses #/page URLs because it has no server. */
declare const __YAPPARATUS_HASH_ROUTES__: boolean;

/** The `YAPPARATUS_LOG` level the browser bundle was served or built with; undeclared in Node. */
declare const __YAPPARATUS_LOG__: string | undefined;

declare module "virtual:yapparatus/document" {
  import type { MDXProps } from "mdx/types";
  import type { ComponentType, SVGProps } from "react";
  import type { DocumentSettings, PageOutline } from "yapparatus";
  /** A compiled page file. */
  export interface PageModule {
    default: ComponentType<MDXProps>;
    outline: PageOutline;
  }
  export interface DocumentPage {
    /** Path inside the content folder without `.mdx`, which is also its address: "reading". */
    id: string;
    /** Path from the project root: "docs/design/rendering.mdx". */
    source: string;
    /** Loaded with the app. Empty, titled with the id, when the page does not compile. */
    outline: PageOutline;
    /** The page's code, once `load` has finished. */
    module: PageModule | undefined;
    /** Why `load` failed, if it did. */
    error: Error | undefined;
    /** Load the page's code, once: every call returns the same promise, which an edit replaces. */
    load(): Promise<PageModule>;
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
