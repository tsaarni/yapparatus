/** The content folder's `document.json`: its fields, and what they mean for the document. */

/** A page's id, its address, from its file in the content folder: "guide/setup.mdx" → "guide/setup". */
export const pageIdOf = (file: string) => file.replace(/\.mdx$/, "");

/** The document's appearance: one fixed theme, or light and dark that the reader can switch. */
export const themeSettings = ["dark", "light", "auto"] as const;
export type ThemeSetting = (typeof themeSettings)[number];

/** An icon name, as `<Icon>`, `logo`, and `favicon` take it: `collection:icon`. */
export const iconName = /^[a-z0-9-]+:[a-z0-9-]+$/;

export interface NumberingSettings {
  /** Number pages as chapters and their sections: 3, 3.1, 3.1.2. */
  sections: boolean;
  /** Number captioned figures that have an id: Figure 3.1. */
  figures: boolean;
  /** Number captioned tables that have an id: Table 3.1. */
  tables: boolean;
  /** Number captioned code listings that have an id: Listing 3.1. */
  listings: boolean;
}

/** Reader-facing settings from the content folder's `document.json`. */
export interface DocumentSettings {
  /** Page files in the content folder, with `.mdx`, in reading order. Every page is listed exactly once. */
  pages: string[];
  /** Document title in the header and browser tab. Default: the folder name. */
  title?: string;
  /** Small line above the title, also after it in the browser tab, such as the project. */
  subtitle?: string;
  /** Icon beside the title in the header, as `collection:icon`. Default: none. */
  logo?: string;
  /** Icon in the browser tab, as `collection:icon`. Default: the browser's own. */
  favicon?: string;
  /** Heading above the page list. Default: "Contents". */
  contentsLabel?: string;
  /** Automatic numbering. `true` or `false` sets every kind. Default: true. */
  numbering?: boolean | Partial<NumberingSettings>;
  /**
   * "dark" or "light" fixes the theme. "auto" follows the system's light or dark setting,
   * and the reader can choose either theme in the header. Default: "dark".
   */
  theme?: ThemeSetting;
  /**
   * Folders whose files pages may show, by name, relative to `document.json`:
   * `{ "app": "../app" }`. Pages address them as `/-/files/app/<path>#L10-L20`.
   */
  files?: Record<string, string>;
}

export function numberingOf(settings: DocumentSettings): NumberingSettings {
  const n = settings.numbering ?? true;
  if (typeof n === "boolean") return { sections: n, figures: n, tables: n, listings: n };
  return {
    sections: n.sections ?? true,
    figures: n.figures ?? true,
    tables: n.tables ?? true,
    listings: n.listings ?? true,
  };
}
