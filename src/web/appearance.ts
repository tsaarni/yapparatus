/**
 * The theme on screen. `document.json` fixes it to "dark" or "light", or sets "auto": the
 * system's setting decides, and the reader may choose light or dark instead. The choice is
 * kept in this browser. Print always uses the light theme, through the theme's own rules.
 */
import { settings } from "virtual:yapparatus/document";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";
import { lightTheme } from "./theme.stylex.ts";

export type ThemeChoice = "system" | "light" | "dark";

const setting = settings.theme ?? "dark";
/** Whether the reader is offered a choice: only when the document's theme is "auto". */
export const themeSwitchable = setting === "auto";

const storageKey = "yapparatus:theme";
const systemLight = window.matchMedia("(prefers-color-scheme: light)");
const lightClasses = (stylex.props(lightTheme).className ?? "").split(" ").filter(Boolean);

function storedChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

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
  // The browser's own interface around the page follows the canvas.
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
  useEffect(() => {
    apply(choice);
    try {
      if (choice === "system") localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, choice);
    } catch {
      // Without storage, the choice lasts until the page is closed.
    }
    if (choice !== "system") return;
    const follow = () => apply("system");
    systemLight.addEventListener("change", follow);
    return () => systemLight.removeEventListener("change", follow);
  }, [choice]);
  return [choice, setChoice] as const;
}
