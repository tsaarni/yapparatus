/**
 * The theme on screen: "dark" or "light" from `document.json`, or with "auto" the system's
 * setting unless the reader chooses, which this browser keeps. Print always uses light.
 */

import { settings } from "virtual:yapparatus/document";
import * as stylex from "@stylexjs/stylex";
import { useLayoutEffect, useState } from "react";
import { lightTheme } from "../style/theme.stylex.ts";

/** The reader's theme choice; "system" follows the system's setting. */
export type ThemeChoice = "system" | "light" | "dark";

const setting = settings.theme ?? "dark";
/** Whether the reader is offered a choice: only when the document's theme is "auto". */
export const themeSwitchable = setting === "auto";

const storageKey = "yapparatus:theme";
const systemLight = window.matchMedia("(prefers-color-scheme: light)");
const lightClasses = (stylex.props(lightTheme).className ?? "").split(" ").filter(Boolean);

/** The choice kept in this browser, or "system" when there is none. */
function storedChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

/** Show the theme for a choice, and set the browser's theme color to match. */
function apply(choice: ThemeChoice) {
  const theme =
    setting !== "auto"
      ? setting
      : choice === "system"
        ? systemLight.matches
          ? "light"
          : "dark"
        : choice;
  const root = document.documentElement;
  for (const name of lightClasses) root.classList.toggle(name, theme === "light");
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", getComputedStyle(root).backgroundColor);
}

/** Apply the theme before the first render, so the page does not change once it shows. */
export function installTheme() {
  apply(storedChoice());
}

/** The reader's choice, applied and remembered. Follows the system while it is "system". */
export function useThemeChoice() {
  const [choice, setChoice] = useState(storedChoice);
  useLayoutEffect(() => {
    apply(choice);
    try {
      if (choice === "system") localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, choice);
    } catch {}
    if (choice !== "system") return;
    const follow = () => apply("system");
    systemLight.addEventListener("change", follow);
    return () => systemLight.removeEventListener("change", follow);
  }, [choice]);
  return [choice, setChoice] as const;
}
