import * as stylex from "@stylexjs/stylex";

/**
 * Design tokens. `theme` holds what a theme changes (colors, shadows, fonts) as CSS
 * variables; the scales below are constants, compiled into the styles that use them.
 * The roles and the reasons for them are in docs/design/styling.mdx, and
 * tests/theme.test.ts checks the contrast every role must reach.
 */

/** The dark reading theme, which is the default. */
const dark = {
  /** For native controls, scrollbars, and the browser canvas. */
  colorScheme: "dark",
  // Surfaces, from back to front.
  canvas: "#0a0c11",
  surface: "#10131a",
  surfaceRaised: "#161a23",
  surfaceHover: "#1d222d",
  scrim: "#000000a8",
  // Borders: dividers, emphasized edges, and controls.
  border: "#2c3242",
  borderStrong: "#5a647b",
  borderControl: "#737e98",
  // Text, from strongest to quietest.
  text: "#eef1f7",
  textBody: "#c2c9d6",
  textMuted: "#959eb0",
  // The accent: links, focus, the current position, primary actions.
  accent: "#8b9bff",
  accentStrong: "#b3bdff",
  accentSurface: "#262d52",
  accentBorder: "#454f8f",
  // Status hues, each with a surface and a border.
  error: "#f59e9e",
  errorSurface: "#44292d",
  errorBorder: "#6b4247",
  warning: "#f0c46c",
  warningSurface: "#3a301b",
  warningBorder: "#5e4d2a",
  success: "#7fd8b4",
  // Diagram categories: colors a figure assigns, in this order, to the categories its
  // author names. Ordered so the first two stay apart with red-green color blindness.
  category1: "#c3881e",
  category1Surface: "#3b2f1b",
  category2: "#77b9fe",
  category2Surface: "#233244",
  category3: "#ff94ac",
  category3Surface: "#3d2c36",
  category4: "#b86ae3",
  category4Surface: "#3b294d",
  // The shade under a note's folded corner, and the figure's drafting grid.
  diagramShade: "#00000040",
  figureGrid: "#ffffff0d",
  // Code tokens. Plain code is textBody; comments and punctuation are textMuted.
  codeKeyword: "#a5b0ff",
  codeString: "#9fd8b4",
  codeFunction: "#f2c98b",
  codeConstant: "#f0a3b8",
  // Elevation: one shadow for menus and notices, one for panels over the page.
  shadowRaised: "0 12px 32px #00000080",
  shadowOverlay: "0 24px 64px #0000008c",
};

type Role = keyof typeof dark;

/** The light theme: paper, dark ink, and the same roles. Print always uses it. */
const light: Record<Role, string> = {
  colorScheme: "light",
  canvas: "#ffffff",
  surface: "#f5f6f8",
  surfaceRaised: "#eceef2",
  surfaceHover: "#e4e7ec",
  scrim: "#00000066",
  border: "#c9ced8",
  borderStrong: "#868e9c",
  borderControl: "#767f90",
  text: "#11141b",
  textBody: "#2b313d",
  textMuted: "#4f5868",
  accent: "#3d4fd6",
  accentStrong: "#2f3fb8",
  accentSurface: "#ccd3f7",
  accentBorder: "#aab4ef",
  error: "#a61e1e",
  errorSurface: "#f4caca",
  errorBorder: "#eab0b0",
  warning: "#7a4f00",
  warningSurface: "#ecd59f",
  warningBorder: "#e2c88a",
  success: "#1a6b48",
  category1: "#a36e00",
  category1Surface: "#e2d7bf",
  category2: "#2173bf",
  category2Surface: "#c8daec",
  category3: "#ba0a53",
  category3Surface: "#ecd0de",
  category4: "#6e1a94",
  category4Surface: "#dfd3e8",
  diagramShade: "#0000001a",
  figureGrid: "#0000000f",
  codeKeyword: "#3d4fd6",
  codeString: "#1a6b48",
  codeFunction: "#7a4f00",
  codeConstant: "#a8326b",
  shadowRaised: "0 12px 32px #10182826",
  shadowOverlay: "0 24px 64px #10182833",
};

const print = "@media print";
const more = "@media (prefers-contrast: more)";

/** Stronger values for the dark theme when the system asks for more contrast. */
const darkMore: Partial<Record<Role, string>> = {
  border: "#4c5566",
  borderStrong: "#7a849a",
  borderControl: "#8a94a8",
  textBody: "#e3e7ee",
  textMuted: "#b4bccb",
  accentBorder: "#5866c0",
};

/** Stronger values for the light theme when the system asks for more contrast. */
const lightMore: Partial<Record<Role, string>> = {
  border: "#9aa2b0",
  borderStrong: "#6f7787",
  borderControl: "#5d6678",
  textBody: "#1d222c",
  textMuted: "#3d4553",
  accentBorder: "#7d8be0",
};

/** One role in a theme: its screen value, its stronger value, and the light value for print. */
const role = (
  name: Role,
  screen: Record<Role, string>,
  stronger: Partial<Record<Role, string>>,
) => ({
  default: screen[name],
  [print]: light[name],
  ...(name in stronger ? { [more]: stronger[name] } : {}),
});
const darkRole = (name: Role) => role(name, dark, darkMore);
const lightRole = (name: Role) => role(name, light, lightMore);

/** The roles, with the dark theme as their default values. */
export const theme = stylex.defineVars({
  colorScheme: darkRole("colorScheme"),
  canvas: darkRole("canvas"),
  surface: darkRole("surface"),
  surfaceRaised: darkRole("surfaceRaised"),
  surfaceHover: darkRole("surfaceHover"),
  scrim: darkRole("scrim"),
  border: darkRole("border"),
  borderStrong: darkRole("borderStrong"),
  borderControl: darkRole("borderControl"),
  text: darkRole("text"),
  textBody: darkRole("textBody"),
  textMuted: darkRole("textMuted"),
  accent: darkRole("accent"),
  accentStrong: darkRole("accentStrong"),
  accentSurface: darkRole("accentSurface"),
  accentBorder: darkRole("accentBorder"),
  error: darkRole("error"),
  errorSurface: darkRole("errorSurface"),
  errorBorder: darkRole("errorBorder"),
  warning: darkRole("warning"),
  warningSurface: darkRole("warningSurface"),
  warningBorder: darkRole("warningBorder"),
  success: darkRole("success"),
  category1: darkRole("category1"),
  category1Surface: darkRole("category1Surface"),
  category2: darkRole("category2"),
  category2Surface: darkRole("category2Surface"),
  category3: darkRole("category3"),
  category3Surface: darkRole("category3Surface"),
  category4: darkRole("category4"),
  category4Surface: darkRole("category4Surface"),
  diagramShade: darkRole("diagramShade"),
  figureGrid: darkRole("figureGrid"),
  codeKeyword: darkRole("codeKeyword"),
  codeString: darkRole("codeString"),
  codeFunction: darkRole("codeFunction"),
  codeConstant: darkRole("codeConstant"),
  shadowRaised: darkRole("shadowRaised"),
  shadowOverlay: darkRole("shadowOverlay"),
  sans: '"Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: '"JetBrains Mono Variable", "SFMono-Regular", Menlo, Consolas, monospace',
});

/** The light theme, applied as a class on the root element. */
export const lightTheme = stylex.createTheme(theme, {
  colorScheme: lightRole("colorScheme"),
  canvas: lightRole("canvas"),
  surface: lightRole("surface"),
  surfaceRaised: lightRole("surfaceRaised"),
  surfaceHover: lightRole("surfaceHover"),
  scrim: lightRole("scrim"),
  border: lightRole("border"),
  borderStrong: lightRole("borderStrong"),
  borderControl: lightRole("borderControl"),
  text: lightRole("text"),
  textBody: lightRole("textBody"),
  textMuted: lightRole("textMuted"),
  accent: lightRole("accent"),
  accentStrong: lightRole("accentStrong"),
  accentSurface: lightRole("accentSurface"),
  accentBorder: lightRole("accentBorder"),
  error: lightRole("error"),
  errorSurface: lightRole("errorSurface"),
  errorBorder: lightRole("errorBorder"),
  warning: lightRole("warning"),
  warningSurface: lightRole("warningSurface"),
  warningBorder: lightRole("warningBorder"),
  success: lightRole("success"),
  category1: lightRole("category1"),
  category1Surface: lightRole("category1Surface"),
  category2: lightRole("category2"),
  category2Surface: lightRole("category2Surface"),
  category3: lightRole("category3"),
  category3Surface: lightRole("category3Surface"),
  category4: lightRole("category4"),
  category4Surface: lightRole("category4Surface"),
  diagramShade: lightRole("diagramShade"),
  figureGrid: lightRole("figureGrid"),
  codeKeyword: lightRole("codeKeyword"),
  codeString: lightRole("codeString"),
  codeFunction: lightRole("codeFunction"),
  codeConstant: lightRole("codeConstant"),
  shadowRaised: lightRole("shadowRaised"),
  shadowOverlay: lightRole("shadowOverlay"),
});

/**
 * Font sizes. Interface text is `xs` or `sm`, reading text `base`. The page title scales
 * with the reading column, from 28 px in a narrow column to 32 px.
 */
export const fontSize = stylex.defineConsts({
  xs: "12px",
  sm: "14px",
  base: "16px",
  lg: "18px",
  xl: "21px",
  xxl: "clamp(28px, 5cqi - 2px, 32px)",
});

export const fontWeight = stylex.defineConsts({
  regular: "400",
  medium: "500",
  semibold: "600",
});

export const lineHeight = stylex.defineConsts({
  /** Titles and single-line controls. */
  tight: "1.2",
  /** Headings and compact interface text. */
  snug: "1.35",
  /** Interface text, chat, tables, captions. */
  normal: "1.5",
  /** Reading text and code. */
  relaxed: "1.7",
});

export const letterSpacing = stylex.defineConsts({
  /** Large headings. */
  tight: "-0.02em",
  /** Small headings and titles. */
  snug: "-0.01em",
  /** Uppercase labels. */
  caps: "0.08em",
});

/** Spacing on a 4 px grid. */
export const space = stylex.defineConsts({
  xxs: "2px",
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
  xl2: "32px",
  xl3: "48px",
  xl4: "64px",
  xl5: "96px",
});

export const radius = stylex.defineConsts({
  /** Inline code, highlights. */
  sm: "4px",
  /** Controls, menus, alerts. */
  md: "8px",
  /** Figures, code blocks, panels, cards. */
  lg: "12px",
  full: "999px",
});

export const sizes = stylex.defineConsts({
  headerHeight: "56px",
  sidebarWidth: "272px",
  /** About 73 characters of 16 px body text: inside the 45–75 measure. */
  textWidth: "560px",
  /** Extra room to the right of the text column for figures, tables, and code. */
  breakout: "460px",
  gutter: "48px",
  pageMaxWidth: "1440px",
  chatWidth: "clamp(380px, 32vw, 520px)",
  control: "32px",
  controlSmall: "28px",
});

/** Stacking order, from the page up. */
export const layer = stylex.defineConsts({
  raised: 1,
  header: 10,
  chat: 20,
  scrim: 30,
  drawer: 40,
  popover: 50,
  toast: 60,
});

/**
 * Diagram stroke weights: dividers and quiet parts, ordinary parts, the accent, and the extra
 * weight of a part a step focuses or the reader points at.
 */
export const stroke = stylex.defineConsts({
  hairline: "1px",
  line: "1.5px",
  strong: "2px",
  boost: "0.75px",
});

/** Diagram dash patterns: dashed for boundaries and replies, dotted for lifelines and markers. */
export const dash = stylex.defineConsts({
  dashed: "5 4",
  dotted: "2 3",
});

/** Durations. Reduced motion is honored globally in styles.css. */
export const duration = stylex.defineConsts({
  fast: "120ms",
  slow: "200ms",
});

/** Responsive conditions. Reading styles follow the reading column, not the window. */
export const when = stylex.defineConsts({
  /** The reading column is narrow, for example on a phone or beside a wide chat. */
  narrow: "@container reading (max-width: 600px)",
  /** The window is too small to show the chat beside the page. */
  smallScreen: "@media (max-width: 760px)",
  noHover: "@media (hover: none)",
  forcedColors: "@media (forced-colors: active)",
  print: "@media print",
});
