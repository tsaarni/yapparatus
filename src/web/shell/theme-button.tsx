import { AppIcon as Icon } from "../style/app-icon.tsx";
import { Button } from "../style/button.tsx";
import { type ThemeChoice, useThemeChoice } from "./appearance.ts";

const themeNames: Record<ThemeChoice, string> = { system: "System", light: "Light", dark: "Dark" };
const nextTheme: Record<ThemeChoice, ThemeChoice> = {
  system: "light",
  light: "dark",
  dark: "system",
};

/** Cycles the theme: the system's setting, light, dark. Shown when the document allows it. */
export function ThemeButton() {
  const [choice, setChoice] = useThemeChoice();
  const label = `Theme: ${themeNames[choice]}. Switch to ${themeNames[nextTheme[choice]]}`;
  return (
    <Button
      className="theme-switch"
      variant="icon"
      aria-label={label}
      title={label}
      onClick={() => setChoice(nextTheme[choice])}
    >
      <Icon name={choice} />
    </Button>
  );
}
