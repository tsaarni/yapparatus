/**
 * Icons: each node's icon looked up in the icon set, and the drawing of each icon used, once.
 */
import type { Node } from "../elements.ts";
import type { IconSet } from "../metrics.ts";
import type { Report } from "./text.ts";

/** The most names an unknown icon's message suggests. */
const suggestions = 5;

/** The icons of one compile: which nodes have a known icon, and the table of their drawings. */
export type Icons = ReturnType<typeof createIcons>;

/**
 * Look up the icon of every box and icon shape, and report each name the set does not have.
 * `iconOf` gives a node's known icon, and `table` each icon used, once, with its drawing.
 */
export function createIcons(set: IconSet, nodes: Node[], report: Report) {
  const known = new Map<Node, string>();
  const table = new Map<string, string>();
  for (const node of nodes) {
    const name = node.options.icon;
    if (name === undefined || (node.shape !== "box" && node.shape !== "icon")) continue;
    const body = set.body(name);
    if (body === undefined) {
      const near = nearest(name, set.names);
      report(
        "UNKNOWN_ICON",
        `${node.id} has the icon "${name}", which Lucide does not have.${near.length ? ` Nearest names: ${near.join(", ")}.` : ""} Diagrams draw Lucide icons only, named without a prefix.`,
        [node.id],
      );
      continue;
    }
    known.set(node, name);
    if (!table.has(name)) table.set(name, body);
  }
  return {
    iconOf: (node: Node) => known.get(node),
    table: (): Record<string, string> => Object.fromEntries(table),
  };
}

/** Names that contain the given name, shortest first, then names a few edits away. */
function nearest(name: string, names: readonly string[]): string[] {
  const word = name.toLowerCase();
  const limit = Math.max(2, Math.floor(word.length / 3));
  const order = (a: [string, number], b: [string, number]) =>
    a[1] - b[1] || a[0].localeCompare(b[0]);
  const containing = names
    .filter((candidate) => candidate.includes(word))
    .map((candidate): [string, number] => [candidate, candidate.length])
    .sort(order);
  const close = names
    .filter((candidate) => !candidate.includes(word))
    .map((candidate): [string, number] => [candidate, distance(word, candidate)])
    .filter(([, edits]) => edits <= limit)
    .sort(order);
  return [...containing, ...close].slice(0, suggestions).map(([candidate]) => candidate);
}

/** The number of single-character edits that turn one word into the other. */
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++)
      current.push(
        Math.min(
          (previous[j] ?? 0) + 1,
          (current[j - 1] ?? 0) + 1,
          (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
        ),
      );
    previous = current;
  }
  return previous[b.length] ?? 0;
}
