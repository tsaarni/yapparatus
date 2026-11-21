/**
 * The signature of every call a draw program makes: the calls of `d` and the methods of the
 * elements they return. Each is the one list of what the call takes.
 */
import type {
  Align,
  AnchorName,
  BoxOptions,
  CellOptions,
  Corner,
  EdgeOptions,
  EncloseOptions,
  FrameOptions,
  GridOptions,
  HeadKind,
  LabelOptions,
  LineOptions,
  MarkOptions,
  NodeOptions,
  PlaceOptions,
  RecordOptions,
  Role,
  Route,
  Side,
  StackOptions,
  TerminalOptions,
  TextOptions,
} from "./elements.ts";
import type {
  SequenceBranch,
  SequenceFragment,
  SequenceMessage,
  SequenceNote,
  SequenceOptions,
} from "./sequence.ts";
import {
  among,
  arg,
  boolean,
  either,
  element,
  empty,
  fn,
  list,
  names,
  number,
  oneOf,
  optional,
  options,
  point,
  type Signature,
  standIn,
  text,
  tuple,
  type Value as ValueOf,
} from "./signature.ts";
import type { TreeLayout, TreeOptions } from "./tree.ts";

/** What an element is for. */
const role = oneOf<Role>()("default", "accent", "muted", "warning", "external");
/** Where a cell sits in its track, or a placed element across its reference. */
const align = oneOf<Align>()("start", "center", "end");
/** A side of an element. */
const side = oneOf<Side>()("top", "bottom", "left", "right");
/** A size, in units: 0 or more. */
const size = number({ min: 0 });
/** A gap, in units. A negative gap overlaps what it separates. */
const gap = number();
/**
 * An element that a grid, a placement, or an enclosure takes. A grid or a placement that positions
 * an enclosure or a frame is reported when the call records it.
 */
const anyElement = element("shape", "grid", "enclosure", "frame");
/** Text that names something, which stands in empty when it is not text. */
const label = standIn(text, "", "Empty text stands in.");

/** The options of every shape. */
const node = {
  id: text,
  sub: text,
  role,
  category: text,
  width: size,
  height: size,
  minWidth: size,
  minHeight: size,
  mono: boolean,
  stepOnly: boolean,
};
/** The options of a shape such as `cylinder`. */
const nodeOptions = options<NodeOptions>()(node);
/** The options of a stack: a box or a document. */
const stack = { ...node, replicas: number({ min: 2, max: 4, whole: true }) };

/** The options of a member: a record's cell or a text's mark. */
const member = { role, category: text, stepOnly: boolean, pin: number({ min: 0, whole: true }) };
/** The columns a cell covers. */
const span = number({ min: 1, whole: true });
/** A record cell: its label, with its span or its options. */
const cell = either(
  text,
  tuple("[label, span]", text, standIn(span, 1, "A span of 1 stands in.")),
  tuple("[label, options]", text, options<CellOptions>()({ ...member, id: text, span })),
);
/** A line of a text, counted from 1. */
const lineNumber = number({ min: 1, whole: true });
/** A text's mark: the text it highlights, or its lines. */
const mark = either(
  text,
  options<MarkOptions>()(
    { ...member, text, lines: either(lineNumber, tuple("[first, last]", lineNumber, lineNumber)) },
    { forms: { keys: { text: [], lines: [] }, required: true } },
  ),
);

/** An edge label: its text, or its text with where it sits. */
const edgeLabel = either(
  text,
  options<LabelOptions>()(
    {
      text,
      segment: number({ min: 0, whole: true }),
      along: number({ min: 0, max: 1 }),
      side,
      gap,
    },
    { required: ["text"] },
  ),
);
/** An edge's labels: one label, or a list of them. */
const edgeLabels = either(edgeLabel, list(edgeLabel));
/** How an edge travels. */
const route = either(
  oneOf<Extract<Route, string>>()("straight", "hv", "vh"),
  options<Extract<Route, { via: unknown }>>()(
    { via: list(point) },
    { required: ["via"], tag: "via", noun: "{ via: [points] }" },
  ),
  options<Extract<Route, { viaX: unknown }>>()(
    { viaX: either(number(), point) },
    { required: ["viaX"], tag: "viaX", noun: "{ viaX: x }" },
  ),
  options<Extract<Route, { viaY: unknown }>>()(
    { viaY: either(number(), point) },
    { required: ["viaY"], tag: "viaY", noun: "{ viaY: y }" },
  ),
  options<Extract<Route, { bend: unknown }>>()(
    { bend: number() },
    { required: ["bend"], tag: "bend", noun: "{ bend: units }" },
  ),
  options<Extract<Route, { loop: unknown }>>()(
    { loop: side },
    { required: ["loop"], tag: "loop", noun: "{ loop: side }" },
  ),
);
/** The arrowhead at one end of an edge. */
const headKind = oneOf<HeadKind>()("filled", "open", "none");
/** How an edge is drawn, which a tree's lines share. */
const edgeStyle = {
  role,
  category: text,
  dashed: boolean,
  head: headKind,
  tail: headKind,
  stepOnly: boolean,
};
/** The options of an edge, or its label alone. */
const edgeOptions = either(
  text,
  options<EdgeOptions>()({
    ...edgeStyle,
    id: text,
    label: edgeLabels,
    route,
  }),
);

/** A participant of a sequence: one of the shapes its first argument lists. */
const participant = among("shape", {
  arg: "participants",
  noun: "participant",
  code: "UNKNOWN_PARTICIPANT",
});
/** The options every entry of a sequence takes, as every drawn element does. */
const entry = { id: text, role, category: text, stepOnly: boolean };
/** A list of sequence entries, which a fragment and its branches hold too. */
const messages: ValueOf = standIn(
  list(() => sequenceEntry, "a list of messages, notes, and fragments"),
  [],
  "An empty list stands in.",
);
/** An entry of a sequence: a message, a note, or a fragment. */
const sequenceEntry: ValueOf = either(
  options<SequenceMessage>()(
    {
      from: participant,
      to: participant,
      label: text,
      reply: boolean,
      async: boolean,
      dashed: boolean,
      ...entry,
    },
    {
      required: ["from", "to", "label"],
      tag: "from",
      noun: "a message { from, to, label }",
      forms: { keys: { reply: [], async: [] }, required: false },
    },
  ),
  options<SequenceNote>()(
    {
      note: text,
      over: either(participant, tuple("[shape, shape]", participant, participant)),
      ...entry,
    },
    { required: ["note", "over"], tag: "note", noun: "a note { note, over }" },
  ),
  options<SequenceFragment>()(
    {
      fragment: text,
      title: text,
      messages,
      else: list(options<SequenceBranch>()({ title: text, messages }, { required: ["messages"] })),
      ...entry,
    },
    {
      required: ["fragment", "messages"],
      tag: "fragment",
      noun: "a fragment { fragment, messages }",
    },
  ),
);

/** A child of a tree: a shape, or a shape with its own children. */
const treeChild: ValueOf = either(
  element("shape"),
  tuple(
    "[shape, children]",
    element("shape"),
    standIn(
      list(() => treeChild, "a list of children"),
      [],
      "An empty list stands in.",
    ),
  ),
);

/** The calls of `d`, then the methods of elements and points, by name. */
export const signatures = {
  box: call("box", options<BoxOptions>()({ ...stack, icon: text })),
  cylinder: call("cylinder", nodeOptions),
  io: call("io", nodeOptions),
  doc: call("doc", options<StackOptions>()(stack)),
  queue: call("queue", nodeOptions),
  text: call(
    "text",
    options<TextOptions>()({ ...node, marks: names(mark, "an object of marks by name") }),
  ),
  actor: call("actor", nodeOptions),
  icon: {
    name: "icon",
    args: [
      arg("name", text, "The icon is left out."),
      arg("label", label),
      optional("options", nodeOptions, {}),
    ],
  },
  note: call("note", nodeOptions),
  decision: call("decision", nodeOptions),
  start: terminal("start"),
  end: terminal("end"),
  record: {
    name: "record",
    args: [
      arg("cells", standIn(list(cell), [], "An empty list stands in.")),
      optional(
        "options",
        options<RecordOptions>()({
          id: text,
          role,
          category: text,
          width: size,
          mono: boolean,
          stepOnly: boolean,
          title: text,
          header: text,
          columns: number({ min: 1, whole: true }),
          ruler: options<NonNullable<RecordOptions["ruler"]>>()({ top: fn, left: fn }),
        }),
        {},
      ),
    ],
  },
  sequence: {
    name: "sequence",
    args: [
      arg("participants", standIn(list(element("shape")), [], "An empty list stands in.")),
      arg("messages", messages),
      optional(
        "options",
        options<SequenceOptions>()({ id: text, gap, rowHeight: size, numbered: boolean }),
        {},
      ),
    ],
  },
  tree: {
    name: "tree",
    args: [
      arg("root", element("shape"), "The tree is left out."),
      arg("children", standIn(list(treeChild), [], "An empty list stands in.")),
      optional(
        "options",
        options<TreeOptions>()({
          id: text,
          layout: oneOf<TreeLayout>()("down", "right", "both", "indent"),
          gap,
          levelGap: gap,
          edge: options<NonNullable<TreeOptions["edge"]>>()(edgeStyle),
        }),
        {},
      ),
    ],
  },
  frame: {
    name: "frame",
    args: [
      arg("from", standIn(point, [0, 0], "[0, 0] stands in.")),
      arg("to", standIn(point, [0, 0], "[0, 0] stands in.")),
      optional(
        "options",
        options<FrameOptions>()({
          id: text,
          tab: text,
          title: text,
          role,
          category: text,
          stepOnly: boolean,
          dividers: list(
            options<NonNullable<FrameOptions["dividers"]>[number]>()(
              { at: point, label: text },
              { required: ["at"] },
            ),
          ),
        }),
        {},
      ),
    ],
  },
  grid: {
    name: "grid",
    args: [
      arg(
        "rows",
        standIn(
          list(
            standIn(
              list(
                standIn(either(anyElement, empty), null, "The cell is empty."),
                "a list of cells",
              ),
              [],
              "An empty row stands in.",
            ),
          ),
          [],
          "An empty list stands in.",
        ),
      ),
      optional(
        "options",
        options<GridOptions>()({
          id: text,
          gap: either(gap, tuple("[columnGap, rowGap]", gap, gap)),
          align: either(align, tuple("[horizontal, vertical]", align, align)),
        }),
        {},
      ),
    ],
  },
  row: line("row"),
  column: line("column"),
  place: {
    name: "place",
    args: [
      arg("el", anyElement, "The placement is ignored."),
      optional(
        "options",
        options<PlaceOptions>()(
          {
            below: anyElement,
            above: anyElement,
            leftOf: anyElement,
            rightOf: anyElement,
            gap,
            align,
            at: point,
            anchor: oneOf<AnchorName>()(
              "center",
              "top",
              "bottom",
              "left",
              "right",
              "topLeft",
              "topRight",
              "bottomLeft",
              "bottomRight",
            ),
          },
          {
            forms: {
              keys: {
                below: ["gap", "align"],
                above: ["gap", "align"],
                leftOf: ["gap", "align"],
                rightOf: ["gap", "align"],
                at: ["anchor"],
              },
              required: true,
            },
          },
        ),
        {},
        "The placement is ignored.",
      ),
    ],
  },
  enclose: {
    name: "enclose",
    args: [
      arg("members", standIn(list(anyElement), [], "An empty list stands in.")),
      optional(
        "options",
        options<EncloseOptions>()({
          id: text,
          title: text,
          titleCorner: oneOf<Corner>()("topLeft", "topRight", "bottomLeft", "bottomRight"),
          padding: size,
          role,
          category: text,
          stepOnly: boolean,
        }),
        {},
      ),
    ],
  },
  arrow: edge("arrow"),
  line: edge("line"),
  equalSize: sizeGroup("equalSize"),
  equalWidth: sizeGroup("equalWidth"),
  equalHeight: sizeGroup("equalHeight"),
  xy: {
    name: "xy",
    args: [
      arg("x", standIn(point, [0, 0], "[0, 0] stands in.")),
      arg("y", standIn(point, [0, 0], "[0, 0] stands in.")),
    ],
  },
  lerp: {
    name: "lerp",
    args: [
      arg("a", standIn(point, [0, 0], "[0, 0] stands in.")),
      arg("b", standIn(point, [0, 0], "[0, 0] stands in.")),
      optional("t", standIn(number(), 0.5, "0.5 stands in."), 0.5),
    ],
  },
  port: {
    name: "port",
    args: [
      arg("side", side, "The center stands in."),
      optional("t", standIn(number({ min: 0, max: 1 }), 0.5, "0.5 stands in."), 0.5),
    ],
  },
  offset: {
    name: "offset",
    args: [
      arg("dx", standIn(number(), 0, "0 stands in.")),
      arg("dy", standIn(number(), 0, "0 stands in.")),
    ],
  },
  member: { name: "member", args: [arg("id", text, "The shape stands in.")] },
} satisfies Record<string, Signature>;

/** The name of a call or a method that has a signature. */
export type CallName = keyof typeof signatures;

/** A shape's call: its label, then its options. */
function call(name: string, takes: ValueOf): Signature {
  return { name, args: [arg("label", label), optional("options", takes, {})] };
}

/** `start` or `end`: an optional label, then the options. */
function terminal(name: string): Signature {
  return {
    name,
    args: [
      optional("label", label, ""),
      optional(
        "options",
        options<TerminalOptions>()({
          id: text,
          sub: text,
          role,
          category: text,
          stepOnly: boolean,
          labelSide: side,
        }),
        {},
      ),
    ],
  };
}

/** A row or a column: its children, then its options. */
function line(name: string): Signature {
  return {
    name,
    args: [
      arg("children", standIn(list(anyElement), [], "An empty list stands in.")),
      optional("options", options<LineOptions>()({ id: text, gap, align }), {}),
    ],
  };
}

/** An arrow or a line: its ends, then its label or its options. */
function edge(name: string): Signature {
  return {
    name,
    args: [
      arg("from", point, "The edge is left out."),
      arg("to", point, "The edge is left out."),
      optional("options", edgeOptions, {}),
    ],
  };
}

/** A size group of shapes. */
function sizeGroup(name: string): Signature {
  return {
    name,
    args: [arg("nodes", standIn(list(element("shape")), [], "An empty list stands in."))],
  };
}
