/**
 * Sequence diagrams, composed from the diagram primitives.
 *
 * The author lists participants and steps in time order. The builder places participants
 * in a row, draws lifelines, derives activation bars from calls and replies, attaches each
 * message to the right bar edge, and draws notes and fragments (alt, loop, opt) as frames.
 */
import {
  type DiagramBuilder,
  Edge,
  type EdgeOptions,
  type Element,
  type Frame,
  Node,
  type PointLike,
  type Role,
  slug,
} from "./scene.ts";

/** Parts a fragment or a whole sequence holds, for steps that focus it. */
type Members = Array<Element | Edge | Frame>;

export interface SequenceMessage {
  from: Node;
  to: Node;
  label: string;
  /** A return: dashed line, open arrowhead. Ends the activation of `from`. */
  reply?: boolean;
  /** Fire and forget: open arrowhead, no activation on the receiver. */
  async?: boolean;
  /** Default: derived from the label, such as `get-item`. */
  id?: string;
  role?: Role;
  /** See `category` on shapes: a color shared with the parts of the same category. */
  category?: string;
}

export interface SequenceNote {
  note: string;
  /** One participant, or two to span between them. */
  over: Node | [Node, Node];
  id?: string;
}

export interface SequenceFragment {
  /** The operator in the tab: alt, opt, loop, par, critical… */
  fragment: string;
  /** Guard or description, shown in brackets after the tab. */
  title?: string;
  steps: SequenceStep[];
  /** Alternative branches, separated by dashed dividers. */
  else?: Array<{ title?: string; steps: SequenceStep[] }>;
  id?: string;
}

export type SequenceStep = SequenceMessage | SequenceNote | SequenceFragment;

export interface SequenceOptions {
  id?: string;
  /** Space between participants. Default: 40. */
  gap?: number;
  /** Vertical space per message. Default: 44. */
  step?: number;
  /** Prefix messages with 1, 2, 3… Default: false. */
  numbered?: boolean;
}

interface Bar {
  start: number;
  end?: number;
  depth: number;
  /** The message that opens the bar; steps show the bar with it. */
  edge?: Edge;
}

const barHalf = 5;
const nest = 6;

export function sequence(
  d: DiagramBuilder,
  participants: Node[],
  steps: SequenceStep[],
  options: SequenceOptions = {},
): Element {
  const step = options.step ?? 44;
  const boxes = participants.filter((n) => n.shape !== "actor");
  for (const n of boxes) n.options.minWidth ??= 96;
  if (boxes.length > 1) d.equalSize(boxes);
  const header = d.row(participants, { gap: options.gap ?? 40, align: "end" });
  const known = new Set(participants);
  const check = (n: Node) => {
    if (!known.has(n)) throw new Error(`Sequence step uses "${n.id}", which is not a participant.`);
    return n;
  };
  const at = (y: number) => header.bottom.offset(0, y);
  const arrow = (
    from: PointLike,
    to: PointLike,
    o: EdgeOptions,
    derivedId: string,
    passive = false,
  ) => {
    const edge = new Edge(from, to, o, { passive, derivedId });
    d.edges.push(edge);
    return edge;
  };
  const all: Members = [...participants];

  // Lay out rows in time order and collect what happens on each.
  type Event =
    | { kind: "message"; m: SequenceMessage; y: number; n: number; within: Members[] }
    | { kind: "note"; s: SequenceNote; y: number; within: Members[] };
  const events: Event[] = [];
  const frames: Array<() => void> = [];
  let y = step * 0.75;
  let count = 0;
  const involved = (list: SequenceStep[]): Node[] =>
    list.flatMap((s) =>
      "from" in s
        ? [s.from, s.to]
        : "note" in s
          ? Array.isArray(s.over)
            ? s.over
            : [s.over]
          : [...involved(s.steps), ...(s.else ?? []).flatMap((b) => involved(b.steps))],
    );
  const walk = (list: SequenceStep[], depth: number, within: Members[]) => {
    for (const s of list) {
      if ("from" in s) {
        check(s.from);
        check(s.to);
        events.push({ kind: "message", m: s, y, n: ++count, within });
        y += s.from === s.to ? step * 1.25 : step;
      } else if ("note" in s) {
        for (const n of Array.isArray(s.over) ? s.over : [s.over]) check(n);
        events.push({ kind: "note", s, y: y + step * 0.15, within });
        y += step * 1.15;
      } else {
        const indexes = involved([s]).map((n) => participants.indexOf(n));
        const left = participants[Math.min(...indexes)] ?? participants[0];
        const right = participants[Math.max(...indexes)] ?? left;
        const top = y - step * 0.45;
        y += step * 0.55;
        const members: Members = [];
        walk(s.steps, depth + 1, [...within, members]);
        const dividers: Array<{ y: number; label?: string }> = [];
        for (const branch of s.else ?? []) {
          dividers.push({
            y: y - step * 0.35,
            ...(branch.title ? { label: `[${branch.title}]` } : {}),
          });
          y += step * 0.35;
          walk(branch.steps, depth + 1, [...within, members]);
        }
        const bottom = y - step * 0.3;
        y += step * 0.25;
        const inset = 14 + 8 * Math.max(0, 3 - depth);
        if (left && right)
          frames.push(() => {
            const frame = d.frame(
              d.xy(left.left.offset(-inset, 0), at(top)),
              d.xy(right.right.offset(inset, 0), at(bottom)),
              {
                ...(s.id ? { id: s.id } : {}),
                tab: s.fragment,
                ...(s.title ? { title: `[${s.title}]` } : {}),
                dividers: dividers.map((div) => ({
                  at: at(div.y),
                  ...(div.label ? { label: div.label } : {}),
                })),
              },
            );
            d.groups.set(frame, members);
            for (const outer of within) outer.push(frame);
            all.push(frame);
          });
      }
    }
  };
  walk(steps, 0, []);
  const bottom = y + step * 0.1;

  // A call is answered when the receiver later replies to the caller.
  const answered = new Set<Event>();
  events.forEach((e, i) => {
    if (e.kind !== "message" || e.m.reply || e.m.async || e.m.from === e.m.to) return;
    for (const later of events.slice(i + 1))
      if (
        later.kind === "message" &&
        later.m.reply &&
        later.m.from === e.m.to &&
        later.m.to === e.m.from
      ) {
        answered.add(e);
        return;
      }
  });

  // Activation bars: a call opens a bar on the receiver; its reply closes it.
  const stacks = new Map<Node, Bar[]>(participants.map((n) => [n, []]));
  const bars: Array<{ owner: Node; bar: Bar }> = [];
  const lastSeen = new Map<Node, number>();
  for (const e of events)
    if (e.kind === "message") {
      lastSeen.set(e.m.from, e.y);
      lastSeen.set(e.m.to, e.y);
    }
  // Bars opened while handling the current message; its edge is theirs.
  let opened: Bar[] = [];
  const open = (owner: Node, start: number) => {
    const stack = stacks.get(owner) ?? [];
    const bar: Bar = { start, depth: stack.length + 1 };
    stack.push(bar);
    bars.push({ owner, bar });
    opened.push(bar);
    return bar;
  };
  const depthOf = (n: Node) => stacks.get(n)?.length ?? 0;
  const offset = (depth: number) => (depth > 0 ? (depth - 1) * nest : 0);
  const edgeX = (depth: number, toward: number) =>
    depth > 0 ? offset(depth) + Math.sign(toward) * barHalf : 0;

  for (const e of events) {
    if (e.kind === "note") {
      const [a, b] = Array.isArray(e.s.over) ? e.s.over : [e.s.over, e.s.over];
      const note = d.note(e.s.note, { ...(e.s.id ? { id: e.s.id } : {}) });
      d.place(note, { at: d.xy(d.lerp(a.center, b.center), at(e.y)), anchor: "top" });
      for (const members of [all, ...e.within]) members.push(note);
      continue;
    }
    const { m } = e;
    const { from, to } = m;
    const label = options.numbered ? `${e.n}. ${m.label}` : m.label;
    const id = m.id ? { id: m.id } : {};
    const derived = slug(m.label);
    opened = [];
    const add = (edge: Edge) => {
      for (const members of [all, ...e.within]) members.push(edge);
      for (const bar of opened) bar.edge ??= edge;
    };
    const role = {
      ...(m.role ? { role: m.role } : {}),
      ...(m.category ? { category: m.category } : {}),
    };
    if (from === to) {
      if (depthOf(from) === 0) open(from, e.y - 6);
      const outer = depthOf(from);
      const inner = open(from, e.y + step * 0.45);
      inner.end = e.y + step * 0.95;
      stacks.get(from)?.pop();
      const start = d.xy(from.center.offset(offset(outer) + barHalf, 0), at(e.y));
      const back = d.xy(
        from.center.offset(offset(inner.depth) + barHalf, 0),
        at(e.y + step * 0.55),
      );
      add(
        arrow(
          start,
          back,
          {
            ...id,
            route: {
              via: [
                start.offset(26, 0),
                back.offset(26 - (offset(inner.depth) - offset(outer)), 0),
              ],
            },
            label: { text: label, segment: 1, side: "right", gap: 8 },
            ...role,
          },
          derived,
        ),
      );
      continue;
    }
    const toward = participants.indexOf(to) - participants.indexOf(from);
    if (m.reply) {
      const x1 = edgeX(depthOf(from), toward);
      const bar = stacks.get(from)?.pop();
      if (bar) bar.end = e.y;
      const x2 = edgeX(depthOf(to), -toward);
      add(
        arrow(
          d.xy(from.center.offset(x1, 0), at(e.y)),
          d.xy(to.center.offset(x2, 0), at(e.y)),
          { ...id, dashed: true, head: "open", label: { text: label, side: "above" }, ...role },
          derived,
        ),
      );
      continue;
    }
    if (depthOf(from) === 0) open(from, e.y - 6);
    const x1 = edgeX(depthOf(from), toward);
    let x2: number;
    if (m.async) {
      x2 = edgeX(depthOf(to), -toward);
    } else {
      const bar = open(to, e.y);
      if (!answered.has(e)) {
        // Nobody replies: a short activation for the work the call starts.
        bar.end = e.y + step * 0.55;
        stacks.get(to)?.pop();
      }
      x2 = offset(bar.depth) - Math.sign(toward) * barHalf;
    }
    add(
      arrow(
        d.xy(from.center.offset(x1, 0), at(e.y)),
        d.xy(to.center.offset(x2, 0), at(e.y)),
        {
          ...id,
          ...(m.async ? { head: "open" as const } : {}),
          label: { text: label, side: "above" },
          ...role,
        },
        derived,
      ),
    );
  }
  // Bars nobody closed end shortly after their participant's last message.
  for (const { owner, bar } of bars)
    bar.end ??= Math.max(bar.start + step * 0.5, (lastSeen.get(owner) ?? bar.start) + step * 0.35);

  for (const n of participants)
    arrow(
      n.bottom,
      d.xy(n.bottom, at(bottom)),
      { id: `${n.id}-lifeline`, dashed: true, role: "muted", ends: "--" },
      "",
      true,
    );
  bars.forEach(({ owner, bar }, i) => {
    const shape = new Node(
      "bar",
      "",
      {
        id: `${owner.id}-active-${i + 1}`,
        width: barHalf * 2,
        height: (bar.end ?? bar.start) - bar.start,
      },
      { passive: true, ...(bar.edge ? { follows: bar.edge } : {}) },
    );
    d.nodes.push(shape);
    d.place(shape, {
      at: d.xy(owner.center.offset(offset(bar.depth), 0), at(bar.start)),
      anchor: "top",
    });
  });
  for (const make of frames) make();

  // One placeable element: the participants over the space their lifelines take.
  const space = new Node(
    "space",
    "",
    { id: `${options.id ?? header.id}-space`, width: 0, height: bottom },
    { passive: true },
  );
  d.nodes.push(space);
  const sequence = d.column([header, space], { gap: 0, ...(options.id ? { id: options.id } : {}) });
  d.groups.set(sequence, all);
  return sequence;
}
