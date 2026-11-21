/**
 * Sequence diagrams from the diagram primitives: participants in a row with lifelines, and
 * activation bars derived from calls and replies, with notes and fragments drawn as frames.
 */
import {
  type Edge,
  type EdgeOptions,
  type Element,
  type Frame,
  lerp,
  type Node,
  type PointLike,
  type Role,
  slug,
  xy,
} from "./elements.ts";
import { defaultGap, sequenceSpacing, shapes } from "./metrics.ts";
import type { Scene } from "./scene.ts";
import type { CallCheck } from "./signature.ts";

/** Elements a fragment or a whole sequence holds, for steps that focus it. */
type Members = Array<Element | Edge | Frame>;

/** A message from one participant to another, in time order. */
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
  /** See `category` on shapes: a color shared with the elements of the same category. */
  category?: string;
}

/** A note over one participant or spanning two. */
export interface SequenceNote {
  note: string;
  /** One participant, or two to span between them. */
  over: Node | [Node, Node];
  id?: string;
}

/** A framed group of steps, such as an alt with its else branches or a loop. */
export interface SequenceFragment {
  /** The operator in the tab: alt, opt, loop, par, critical… */
  fragment: string;
  /** Guard or description, shown in brackets after the tab. */
  title?: string;
  steps: SequenceStep[];
  /** Alternative branches, separated by dashed dividers. */
  else?: SequenceBranch[];
  id?: string;
}

/** An alternative branch of a fragment, after a dashed divider. */
export interface SequenceBranch {
  title?: string;
  steps: SequenceStep[];
}

/** One step of a sequence: a message, a note, or a fragment. */
export type SequenceStep = SequenceMessage | SequenceNote | SequenceFragment;

/** Options of a sequence diagram. */
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

/** Half an activation bar's width: how far a message stops short of the bar's center line. */
const barHalf = shapes.bar / 2;

/**
 * Draw a sequence diagram into the scene and return the column that holds it all. `name` is
 * its id without an `id`, such as `sequence-1`. `call` checked the steps and reports about it.
 */
export function sequence(
  scene: Scene,
  call: CallCheck,
  participants: Node[],
  steps: SequenceStep[],
  options: SequenceOptions,
  name: string,
): Element {
  const step = options.step ?? sequenceSpacing.step;
  const boxes = participants.filter((n) => n.shape !== "actor" && n.shape !== "icon");
  for (const n of boxes) n.options.minWidth ??= sequenceSpacing.minWidth;
  if (boxes.length > 1) scene.addSizeGroup({ members: boxes, width: true, height: true });
  const header = scene.addGrid("row", [participants], {
    gap: [options.gap ?? sequenceSpacing.gap, defaultGap.y],
    align: "end",
  });
  const at = (y: number) => header.bottom.offset(0, y);
  const arrow = (
    from: PointLike,
    to: PointLike,
    o: EdgeOptions,
    derivedId: string,
    passive = false,
  ) => scene.addEdge(from, to, o, { passive, derivedId });
  const all: Members = [...participants];

  type Event =
    | { kind: "message"; m: SequenceMessage; y: number; n: number; within: Members[] }
    | { kind: "note"; s: SequenceNote; y: number; within: Members[] };
  const events: Event[] = [];
  const frames: Array<() => void> = [];
  let y = step * sequenceSpacing.start;
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
        if (s.from === s.to) ignoreForm(call, s);
        events.push({ kind: "message", m: s, y, n: ++count, within });
        y += s.from === s.to ? step * sequenceSpacing.self.step : step;
      } else if ("note" in s) {
        events.push({ kind: "note", s, y: y + step * sequenceSpacing.note.drop, within });
        y += step * sequenceSpacing.note.step;
      } else {
        const indexes = involved([s]).map((n) => participants.indexOf(n));
        const left = participants[Math.min(...indexes)] ?? participants[0];
        const right = participants[Math.max(...indexes)] ?? left;
        const top = y - step * sequenceSpacing.fragment.top;
        y += step * sequenceSpacing.fragment.head;
        const members: Members = [];
        walk(s.steps, depth + 1, [...within, members]);
        const dividers: Array<{ y: number; label?: string }> = [];
        for (const branch of s.else ?? []) {
          dividers.push({
            y: y - step * sequenceSpacing.fragment.divider,
            ...(branch.title ? { label: `[${branch.title}]` } : {}),
          });
          y += step * sequenceSpacing.fragment.divider;
          walk(branch.steps, depth + 1, [...within, members]);
        }
        const bottom = y - step * sequenceSpacing.fragment.bottom;
        y += step * sequenceSpacing.fragment.foot;
        const insets = sequenceSpacing.inset;
        const inset = insets.base + insets.step * Math.max(0, insets.levels - depth);
        if (left && right)
          frames.push(() => {
            const frame = scene.addFrame(
              xy(left.left.offset(-inset, 0), at(top)),
              xy(right.right.offset(inset, 0), at(bottom)),
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
            scene.addGroup(frame, members);
            for (const outer of within) outer.push(frame);
            all.push(frame);
          });
      }
    }
  };
  walk(steps, 0, []);
  const bottom = y + step * sequenceSpacing.end;

  const answers = new Map<Event, Event>();
  const pending = new Map<Node, Array<Event & { kind: "message" }>>();
  for (const e of events) {
    if (e.kind !== "message" || e.m.async || e.m.from === e.m.to) continue;
    const callee = e.m.reply ? e.m.from : e.m.to;
    const calls = pending.get(callee) ?? [];
    pending.set(callee, calls);
    if (!e.m.reply) {
      calls.push(e);
      continue;
    }
    const i = calls.findLastIndex((call) => call.m.from === e.m.to);
    const call = calls[i];
    if (!call) continue;
    answers.set(e, call);
    calls.splice(i);
  }

  const stacks = new Map<Node, Bar[]>(participants.map((n) => [n, []]));
  const bars: Array<{ owner: Node; bar: Bar }> = [];
  const answered = new Set(answers.values());
  const barOf = new Map<Event, Bar>();
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
  const offset = (depth: number) => (depth > 0 ? (depth - 1) * sequenceSpacing.bar.nest : 0);
  const edgeX = (depth: number, toward: number) =>
    depth > 0 ? offset(depth) + Math.sign(toward) * barHalf : 0;

  for (const e of events) {
    if (e.kind === "note") {
      const [a, b] = Array.isArray(e.s.over) ? e.s.over : [e.s.over, e.s.over];
      const note = scene.addNode("note", e.s.note, { ...(e.s.id ? { id: e.s.id } : {}) });
      const top = xy(lerp(a.center, b.center), at(e.y));
      scene.own(note, { kind: "at", at: top, anchor: "top" });
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
      const outer = depthOf(from);
      const inner = open(from, e.y + step * sequenceSpacing.self.barStart);
      inner.end = e.y + step * sequenceSpacing.self.barEnd;
      stacks.get(from)?.pop();
      const start = xy(from.center.offset(edgeX(outer, 1), 0), at(e.y));
      const back = xy(
        from.center.offset(offset(inner.depth) + barHalf, 0),
        at(e.y + step * sequenceSpacing.self.back),
      );
      const reach = from.center.offset(offset(outer) + barHalf + sequenceSpacing.self.reach, 0);
      add(
        arrow(
          start,
          back,
          {
            ...id,
            route: { via: [xy(reach, start), xy(reach, back)] },
            label: { text: label, segment: 1, side: "right", gap: sequenceSpacing.self.labelGap },
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
      const call = answers.get(e);
      const bar = call && barOf.get(call);
      const stack = stacks.get(from) ?? [];
      if (bar && stack.includes(bar)) {
        bar.end = e.y;
        stack.splice(stack.indexOf(bar), 1);
      }
      const x2 = edgeX(depthOf(to), -toward);
      add(
        arrow(
          xy(from.center.offset(x1, 0), at(e.y)),
          xy(to.center.offset(x2, 0), at(e.y)),
          { ...id, dashed: true, head: "open", label: { text: label, side: "above" }, ...role },
          derived,
        ),
      );
      continue;
    }
    const x1 = edgeX(depthOf(from), toward);
    let x2: number;
    if (m.async) {
      x2 = edgeX(depthOf(to), -toward);
    } else {
      const bar = open(to, e.y);
      barOf.set(e, bar);
      if (!answered.has(e)) {
        bar.end = e.y + step * sequenceSpacing.bar.short;
        stacks.get(to)?.pop();
      }
      x2 = offset(bar.depth) - Math.sign(toward) * barHalf;
    }
    add(
      arrow(
        xy(from.center.offset(x1, 0), at(e.y)),
        xy(to.center.offset(x2, 0), at(e.y)),
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
  for (const n of participants) {
    const lifeline = arrow(
      n.bottom,
      xy(n.bottom, at(bottom)),
      { dashed: true, role: "muted", ends: "--" },
      "",
      true,
    );
    scene.nameAfter(lifeline, n, "-lifeline");
  }
  const barCount = new Map<Node, number>();
  for (const { owner, bar } of bars) {
    const shape = scene.addNode(
      "bar",
      "",
      { width: shapes.bar, height: (bar.end ?? bar.start) - bar.start },
      { passive: true, ...(bar.edge ? { follows: bar.edge } : {}) },
    );
    const n = (barCount.get(owner) ?? 0) + 1;
    barCount.set(owner, n);
    scene.nameAfter(shape, owner, `-active-${n}`);
    const top = xy(owner.center.offset(offset(bar.depth), 0), at(bar.start));
    scene.own(shape, { kind: "at", at: top, anchor: "top" });
  }
  for (const make of frames) make();

  const space = scene.addNode("space", "", { width: 0, height: bottom }, { passive: true });
  const sequence = scene.addGrid(
    "column",
    [[header], [space]],
    { gap: [defaultGap.x, 0], ...(options.id ? { id: options.id } : {}) },
    name,
  );
  scene.nameAfter(header, sequence, "-participants");
  scene.nameAfter(space, sequence, "-space");
  scene.addGroup(sequence, all);
  call.done([sequence]);
  return sequence;
}

/** Report `reply` or `async` on a message to the sender itself, which is drawn as a call. */
function ignoreForm(call: CallCheck, message: SequenceMessage) {
  for (const key of ["reply", "async"] as const) {
    const path = `${call.pathOf(message)}.${key}`;
    if (message[key])
      call.ignore(
        path,
        message[key],
        () => `${path} is true, but a message from a participant to itself is drawn as a call.`,
      );
  }
}
