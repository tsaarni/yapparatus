/** A color ramp between two literal colors, mixed in OKLab as CSS `color-mix(in oklab)` mixes. */

/** A ramp: the color at a position from 0, the low end, to 1, the high end. */
export type Ramp = (t: number) => string;

type Triple = [number, number, number];

/** A `#rrggbb` color as linear sRGB channels from 0 to 1. */
function linearRgb(hex: string): Triple {
  const value = Number.parseInt(hex.replace("#", "").slice(0, 6), 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel(16), channel(8), channel(0)];
}

/** Linear sRGB as OKLab. */
function oklab([r, g, b]: Triple): Triple {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab as a `#rrggbb` color, clamped to sRGB. */
function hexOf([L, a, b]: Triple): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${linear
    .map((c) => {
      const v = Math.min(1, Math.max(0, c));
      const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
      return Math.round(srgb * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

/** A ramp from `low` to `high`, both `#rrggbb`, that returns `#rrggbb` colors. */
export function oklabRamp(low: string, high: string): Ramp {
  const [from, to] = [oklab(linearRgb(low)), oklab(linearRgb(high))];
  return (t) => {
    const k = Math.min(1, Math.max(0, t));
    return hexOf(from.map((v, i) => v + ((to[i] as number) - v) * k) as Triple);
  };
}
