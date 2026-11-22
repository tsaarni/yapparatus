/** Writes every logo file in assets/ from one drawing of the robot: `node scripts/logo.ts`. */

import { writeFileSync } from "node:fs";

/** The robot's parts on a 24 unit grid, drawn with a round line of `weight` units. */
const robot = {
  head: "M3 13.3V10.7A5.5 5.5 0 0 1 8.5 5.2h7A5.5 5.5 0 0 1 21 10.7v2.6z",
  antenna: "M12 5.2L13.2 3.4",
  tip: { x: 13.8, y: 2.5, r: 1.2 },
  eyes: "M8.8 8.9V10.1M15.2 8.9V10.1",
  jaw: "M6 17H18a6 4.5 0 0 1-12 0z",
};

/** Line weight of the drawing, in grid units. */
const weight = 1.8;

/** Line weight of the eyes, heavier than the outline so they read as pills. */
const eyeWeight = 2.4;

/** Width of the eye holes that the favicon cuts out of its filled head, in grid units. */
const eyeHole = 2.6;

/** The web app's accent and title colors for each background. */
const themes = {
  light: { accent: "#3d4fd6", text: "#11141b" },
  dark: { accent: "#8b9bff", text: "#eef1f7" },
};

/** The name beside the robot, and where the robot sits in front of it. */
const wordmark = {
  width: 368,
  height: 88,
  robot: "translate(6 11) scale(2.8)",
  text: `x="82" y="62" font-size="48" font-weight="650" letter-spacing="-1"`,
  font: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
};

/** Size of the robot alone, in pixels. */
const markSize = 256;

/** Every 5 seconds the robot blinks and yaps twice, unless the reader prefers reduced motion. */
const animation = `  <style>
    @media (prefers-reduced-motion: no-preference) {
      .jaw { animation: yap 5s ease-in-out infinite; }
      .eyes { transform-box: fill-box; transform-origin: center; animation: blink 5s infinite; }
    }
    @keyframes yap { 0%, 78%, 86%, 94%, 100% { transform: translateY(0); } 82%, 90% { transform: translateY(-1.8px); } }
    @keyframes blink { 0%, 40%, 46%, 100% { transform: scaleY(1); } 43% { transform: scaleY(0.1); } }
  </style>
`;

/** The robot as line art in one color, with classes that the animation moves. */
function lineRobot(color: string, transform?: string): string {
  const place = transform ? ` transform="${transform}"` : "";
  const { tip } = robot;
  return `  <g${place} fill="none" stroke="${color}" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round">
    <path d="${robot.head}"/>
    <path d="${robot.antenna}"/>
    <circle cx="${tip.x}" cy="${tip.y}" r="${tip.r}" fill="${color}" stroke="none"/>
    <path class="eyes" d="${robot.eyes}" stroke-width="${eyeWeight}"/>
    <path class="jaw" d="${robot.jaw}"/>
  </g>
`;
}

/** A colored logo file: the robot alone or with the name, still or animated. */
function logo(theme: keyof typeof themes, withText: boolean, animated: boolean): string {
  const { accent, text } = themes[theme];
  const size = withText
    ? `viewBox="0 0 ${wordmark.width} ${wordmark.height}" width="${wordmark.width}" height="${wordmark.height}"`
    : `viewBox="0 0 24 24" width="${markSize}" height="${markSize}"`;
  const name = withText
    ? `  <text ${wordmark.text} fill="${text}" font-family="${wordmark.font}">Yapparatus</text>\n`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" ${size} role="img" aria-label="Yapparatus">
  <title>Yapparatus</title>
${animated ? animation : ""}${lineRobot(accent, withText ? wordmark.robot : undefined)}${name}</svg>
`;
}

/** The line icon for a document's `logo`, in `currentColor` so it follows the theme. */
function icon(): string {
  const { tip } = robot;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round"><title>Yapparatus</title><path d="${robot.head}"/><path d="${robot.antenna}"/><circle cx="${tip.x}" cy="${tip.y}" r="${tip.r}" fill="currentColor" stroke="none"/><path d="${robot.eyes}" stroke-width="${eyeWeight}"/><path d="${robot.jaw}"/></svg>
`;
}

/** The same parts filled, with the eyes cut out, so the robot still reads at 16 px. */
function favicon(): string {
  const { tip } = robot;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round"><title>Yapparatus</title><mask id="yapparatus-eyes"><rect width="24" height="24" fill="white" stroke="none"/><path d="${robot.eyes}" stroke="black" stroke-width="${eyeHole}"/></mask><g mask="url(#yapparatus-eyes)"><path d="${robot.head}"/><path d="${robot.antenna}" fill="none"/><circle cx="${tip.x}" cy="${tip.y}" r="${tip.r}"/><path d="${robot.jaw}"/></g></svg>
`;
}

const files: Record<string, string> = { "logo-icon.svg": icon(), "logo-favicon.svg": favicon() };
for (const theme of ["light", "dark"] as const) {
  files[`logo-text-animated-${theme}.svg`] = logo(theme, true, true);
  files[`logo-text-${theme}.svg`] = logo(theme, true, false);
  files[`logo-animated-${theme}.svg`] = logo(theme, false, true);
  files[`logo-${theme}.svg`] = logo(theme, false, false);
}
for (const [name, svg] of Object.entries(files)) writeFileSync(`assets/${name}`, svg);
console.log(`Wrote ${Object.keys(files).length} files in assets/`);
