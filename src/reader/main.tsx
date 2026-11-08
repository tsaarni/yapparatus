import * as stylex from "@stylexjs/stylex";
import { createRoot, type Root } from "react-dom/client";
import "@fontsource-variable/inter/standard.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./styles.css";
import { App } from "./App.tsx";
import { installTheme } from "./appearance.ts";
import { installGlobalReporters } from "./diagnostics.tsx";
import { installFavicon } from "./favicon.ts";
import { fontSize, lineHeight, theme } from "./theme.stylex.ts";

const page = stylex.create({
  root: {
    colorScheme: theme.colorScheme,
    backgroundColor: theme.canvas,
    color: theme.textBody,
    fontFamily: theme.sans,
    fontSize: fontSize.base,
    lineHeight: lineHeight.normal,
    fontSynthesis: "none",
    fontOpticalSizing: "auto",
    textRendering: "optimizeLegibility",
    WebkitFontSmoothing: "antialiased",
    accentColor: theme.accent,
    scrollbarColor: `${theme.borderStrong} ${theme.canvas}`,
    "::selection": {
      color: theme.text,
      backgroundColor: `color-mix(in srgb, ${theme.accent} 35%, ${theme.canvas})`,
    },
  },
});

const rootStyle = stylex.props(page.root);
if (rootStyle.className) document.documentElement.classList.add(...rootStyle.className.split(" "));

installTheme();
installGlobalReporters();
installFavicon();

const container = document.getElementById("root");
if (container) {
  // Hot updates re-execute this module; reuse the root instead of creating a second one.
  const root = (import.meta.hot?.data.root as Root | undefined) ?? createRoot(container);
  if (import.meta.hot) import.meta.hot.data.root = root;
  root.render(<App />);
}
