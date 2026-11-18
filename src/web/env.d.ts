/** Types for the web app's build-time globals and the virtual modules the Vite plugin serves. */

/// <reference types="unplugin-icons/types/react" />

/** True in the single-file build, which uses #/page URLs because it has no server. */
declare const __YAPPARATUS_HASH_ROUTES__: boolean;

declare module "virtual:yapparatus/document" {
  import type { MDXProps } from "mdx/types";
  import type { ComponentType, SVGProps } from "react";
  /** A compiled page file. */
  export interface PageModule {
    default: ComponentType<MDXProps>;
    outline: import("../document/page-module.ts").PageOutline;
  }
  export interface DocumentPage {
    /** Path inside the content folder without `.mdx`, which is also its address: "reading". */
    id: string;
    /** Path from the project root: "docs/design/overview.mdx". */
    source: string;
    /** Loaded with the app. Empty, titled with the id, when the page does not compile. */
    outline: import("../document/page-module.ts").PageOutline;
    /** The page's code, once `load` has finished. */
    module: PageModule | undefined;
    /** Why `load` failed, if it did. */
    error: Error | undefined;
    /** Load the page's code, once: every call returns the same promise, which an edit replaces. */
    load(): Promise<PageModule>;
  }
  export const settings: import("../document/settings.ts").DocumentSettings;
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
  /** The source files a build carries, by "folder/path", each loaded when opened. Empty live. */
  export const files: Record<
    string,
    () => Promise<{ default: import("../protocol/rest-api.ts").SourceFileView }>
  >;
}
