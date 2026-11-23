/** Categories of a figure: they take the theme's category colors in the order of first use. */

/**
 * Categories a figure can color. Beyond four, readers with red-green color blindness can no
 * longer tell every pair apart, and everyone else must keep matching colors to the legend.
 */
export const categoryCount = 4;

/**
 * Values in the order a sequence first uses them, as categories take their colors. Values the
 * sequence never uses keep their place after them.
 */
export function firstUseOrder<T>(values: T[], uses: Iterable<unknown>): T[] {
  const first = new Map<string, number>();
  let i = 0;
  for (const use of uses) {
    const key = String(use);
    if (!first.has(key)) first.set(key, i);
    i++;
  }
  const at = (value: T) => first.get(String(value)) ?? Number.POSITIVE_INFINITY;
  return values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => at(a.value) - at(b.value) || a.index - b.index)
    .map(({ value }) => value);
}

/** The message of a figure with more categories than colors, with what the author can do. */
export function tooManyCategories(names: readonly unknown[], advice: string): string {
  const shown = names.slice(0, 8).map((name) => `"${String(name)}"`);
  const list = `${shown.join(", ")}${names.length > shown.length ? ", …" : ""}`;
  return `The figure has ${names.length} categories: ${list}. It has ${categoryCount} category colors, so the rest are drawn without a category color. ${advice}`;
}
