/** Checks of the content folder's `document.json` and its page files, as readable messages. */
import { iconName, pageIdOf, type ThemeSetting, themeSettings } from "../document/settings.ts";

const pageName = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/;

/**
 * Errors in the page files and the `pages` list in `document.json`, as readable messages.
 * `files` are the page ids on disk; `listed` names the page files, with `.mdx`, in reading order.
 * Names start with a letter or digit, so they never reach the application's paths under `/-/`.
 */
export function checkPages(files: string[], listed: unknown): string[] {
  const problems: string[] = [];
  if (!Array.isArray(listed) || !listed.every((file) => typeof file === "string"))
    return [
      'document.json must list the page files in reading order: { "pages": ["overview.mdx", …] }.',
    ];
  for (const file of listed)
    if (!file.endsWith(".mdx"))
      problems.push(`"pages" in document.json lists "${file}"; name the file: "${file}.mdx".`);
  const ids = listed.filter((file) => file.endsWith(".mdx")).map(pageIdOf);
  for (const id of files) {
    if (!pageName.test(id))
      problems.push(`"${id}.mdx" is not a page name: use lowercase letters, digits, and hyphens.`);
    if (!ids.includes(id)) problems.push(`"${id}.mdx" is missing from "pages" in document.json.`);
  }
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) problems.push(`"${id}.mdx" is listed twice in "pages" in document.json.`);
    else if (!files.includes(id))
      problems.push(`"pages" in document.json lists "${id}.mdx", which does not exist.`);
    seen.add(id);
  }
  return problems;
}

/** Errors in the `theme` field of `document.json`, as readable messages. */
export function checkTheme(theme: unknown): string[] {
  if (theme === undefined || themeSettings.includes(theme as ThemeSetting)) return [];
  return [`"theme" in document.json is ${JSON.stringify(theme)}; use "dark", "light", or "auto".`];
}

/** Errors in the `logo` and `favicon` fields of `document.json`, as readable messages. */
export function checkIcons(settings: { logo?: unknown; favicon?: unknown }): string[] {
  return (["logo", "favicon"] as const).flatMap((field) => {
    const value = settings[field];
    if (value === undefined || (typeof value === "string" && iconName.test(value))) return [];
    return [
      `"${field}" in document.json is ${JSON.stringify(value)}; use an icon name such as "lucide:book-open" or "local:logo".`,
    ];
  });
}
