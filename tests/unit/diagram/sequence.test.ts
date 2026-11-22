/**
 * Sequences create their elements through the scene: categories, step-only entries, and the
 * element limit apply, and a reply without a call is reported.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { DiagramBuilder } from "../../../src/diagram/builder.ts";
import { compile } from "../../../src/diagram/compile/compile.ts";
import {
  edgeEnds,
  elementState,
  stepFocus,
  stepOnlyElements,
} from "../../../src/diagram/drawing.ts";
import type { Node } from "../../../src/diagram/elements.ts";
import { compileFigure } from "../../../src/diagram/figure.ts";
import type { Measure } from "../../../src/diagram/metrics.ts";
import { pictureOf } from "../../../src/diagram/picture.ts";
import { Scene } from "../../../src/diagram/scene.ts";
import type { SequenceEntry } from "../../../src/diagram/sequence.ts";
import { lightPaint } from "../../../src/server/theme-values.ts";
import { fixedIcons } from "./fixed-icons.ts";

/** 7 units per character: deterministic stand-in for font measurement. */
const measure: Measure = (text) => text.length * 7;
const lookups = { measure, icons: fixedIcons };

test("a sequence message with a category has a color, a legend entry, and a step focus", () => {
  const out = compileFigure(
    {
      draw: (d) => {
        const a = d.box("Client");
        const b = d.box("API");
        d.sequence(
          [a, b],
          [
            { from: a, to: b, label: "get item", category: "New" },
            { from: b, to: a, label: "item", reply: true },
          ],
        );
      },
      steps: [{ focus: ["new"] }],
      build: false,
    },
    lookups,
  );
  assert.deepEqual(out.diagnostics, []);
  assert.equal(out.edges.find((e) => e.id === "get-item")?.category, 1);
  assert.equal(out.edges.find((e) => e.id === "item")?.category, undefined);
  assert.deepEqual(out.legend, [{ name: "New", id: "new", slot: 1, elements: ["get-item"] }]);
  assert.deepEqual(out.groups.new, ["get-item"]);
});

test("a sequence with more messages than the element limit is DRAW_FAILED when created", () => {
  const messages = (d: DiagramBuilder): SequenceEntry[] => {
    const a = d.box("A");
    const b = d.box("B");
    return Array.from({ length: 2500 }, (_, i) => ({ from: a, to: b, label: `m${i}` }));
  };
  const out = compileFigure(
    {
      draw: (d) => {
        const entries = messages(d);
        const [first] = entries;
        if (first && "from" in first) d.sequence([first.from, first.to], entries);
      },
      steps: [],
      build: false,
    },
    lookups,
  );
  assert.deepEqual(out.diagnostics, [
    { code: "DRAW_FAILED", message: "The drawing has more than 2000 elements.", ids: [] },
  ]);

  const scene = new Scene();
  const d = new DiagramBuilder(scene);
  const entries = messages(d);
  const [first] = entries;
  assert.ok(first && "from" in first);
  assert.throws(() => d.sequence([first.from, first.to], entries));
  assert.equal(scene.nodes.length + scene.edges.length + scene.grids.length, 2000);
});

test("two participants with the same label have their own lifelines", () => {
  const scene = new Scene();
  const d = new DiagramBuilder(scene);
  const a = d.box("API");
  const b = d.box("API");
  d.sequence([a, b], [{ from: a, to: b, label: "call" }]);
  const out = compile(scene, lookups);
  assert.deepEqual(out.diagnostics, []);
  assert.deepEqual(
    out.edges.filter((e) => e.passive).map((e) => e.id),
    ["api-lifeline", "api-2-lifeline"],
  );
});

test("a sequence's elements are named after their owners", () => {
  const scene = new Scene();
  const d = new DiagramBuilder(scene);
  const client = d.box("Client");
  const api = d.box("API");
  const db = d.cylinder("DB");
  const first = d.sequence(
    [client, api, db],
    [
      { from: client, to: api, label: "get" },
      { from: api, to: db, label: "read" },
      { from: db, to: api, label: "rows", reply: true },
      { from: api, to: client, label: "item", reply: true },
      { from: client, to: api, label: "put" },
      {
        fragment: "loop",
        title: "until empty",
        messages: [{ from: api, to: db, label: "drain" }],
      },
    ],
  );
  const x = d.box("X");
  const y = d.box("Y");
  const second = d.sequence([x, y], [{ from: x, to: y, label: "ping" }], { id: "pings" });
  d.column([first, second]);
  const out = compile(scene, lookups);
  assert.deepEqual(out.diagnostics, []);
  assert.deepEqual([first.id, second.id], ["sequence-1", "pings"]);
  assert.deepEqual(
    out.nodes.filter((n) => n.passive).map((n) => n.id),
    [
      "api-active-1",
      "db-active-1",
      "api-active-2",
      "db-active-2",
      "sequence-1-space",
      "y-active-1",
      "pings-space",
    ],
  );
  assert.deepEqual(
    scene.grids.map((g) => g.id),
    ["sequence-1-participants", "sequence-1", "pings-participants", "pings", "column-1"],
  );
  assert.deepEqual(
    out.frames.map((f) => f.id),
    ["loop-until-empty"],
  );
  assert.ok(out.groups["loop-until-empty"]?.includes("drain"));
});

/** The ids of a compiled sequence's messages: its edges that are not lifelines. */
const messages = (out: ReturnType<typeof compile>) =>
  out.edges.filter((e) => !e.passive).map((e) => e.id);

test("a message to a shape that is not a participant is UNKNOWN_PARTICIPANT and skipped", () => {
  const scene = new Scene();
  const d = new DiagramBuilder(scene);
  const a = d.box("A");
  const b = d.box("A");
  const outside = d.box("A");
  const s = d.sequence(
    [a, b],
    [
      { from: a, to: outside, label: "lost" },
      { note: "aside", over: [a, outside] },
      { from: a, to: b, label: "call" },
    ],
  );
  d.place(outside, { below: s });
  const out = compile(scene, lookups);
  const participants = "The participants are a, a-2: add it to them, or name one of them.";
  assert.deepEqual(out.diagnostics, [
    {
      code: "UNKNOWN_PARTICIPANT",
      message: `sequence sequence-1: messages[0].to is a-3, which is not a participant. messages[0] is left out. ${participants}`,
      ids: ["sequence-1", "a-3"],
      subject: "messages[0].to",
    },
    {
      code: "UNKNOWN_PARTICIPANT",
      message: `sequence sequence-1: messages[1].over[1] is a-3, which is not a participant. messages[1] is left out. ${participants}`,
      ids: ["sequence-1", "a-3"],
      subject: "messages[1].over[1]",
    },
  ]);
  assert.deepEqual(messages(out), ["call"]);
  assert.ok(out.nodes.some((n) => n.id === "a-3"));
});

test("a message without a label, and an entry of no kind, are reported and skipped", () => {
  const scene = new Scene();
  const d = new DiagramBuilder(scene);
  const a = d.box("A");
  const b = d.box("B");
  d.sequence(
    [a, b],
    [
      { from: a, to: b, lable: "typo" } as never,
      { form: a } as never,
      { fragment: "loop", messages: [{ from: a, to: b, label: "poll" }, 3 as never] },
      { from: a, to: b, label: "call" },
    ],
  );
  const out = compile(scene, lookups);
  const entry =
    "a message { from, to, label }, a note { note, over }, or a fragment { fragment, messages }";
  assert.deepEqual(out.diagnostics, [
    {
      code: "UNKNOWN_OPTION",
      message:
        "sequence sequence-1: messages[0].lable is not an option. messages[0] takes label, from, to, reply, async, dashed, id, role, category, stepOnly. It is ignored.",
      ids: ["sequence-1"],
      subject: "messages[0].lable",
    },
    {
      code: "INVALID_ARGUMENT",
      message:
        "sequence sequence-1: messages[0].label is missing; it takes text. messages[0] is left out.",
      ids: ["sequence-1"],
      subject: "messages[0].label",
    },
    {
      code: "INVALID_ARGUMENT",
      message: `sequence sequence-1: messages[1] is { form }, but it takes ${entry}. messages[1] is left out.`,
      ids: ["sequence-1"],
      subject: "messages[1]",
    },
    {
      code: "INVALID_ARGUMENT",
      message: `sequence sequence-1: messages[2].messages[1] is 3, but it takes ${entry}. messages[2].messages[1] is left out.`,
      ids: ["sequence-1"],
      subject: "messages[2].messages[1]",
    },
  ]);
  assert.deepEqual(messages(out), ["poll", "call"]);
  assert.deepEqual(
    out.frames.map((f) => f.id),
    ["loop"],
  );
});

/** Compile a figure with a step for each list of ids it focuses. */
function stepped(draw: (d: DiagramBuilder) => void, focus: string[][] = []) {
  return compileFigure({ draw, steps: focus.map((f) => ({ focus: f })), build: false }, lookups);
}

/** The state of each element in each step of a compiled figure, by element. */
function states(out: ReturnType<typeof stepped>, focus: string[][], ids: string[]) {
  const view = {
    steps: focus.map((f) => stepFocus(f, out)),
    build: false,
    stepOnly: stepOnlyElements(out),
    ends: edgeEnds(out),
  };
  return ids.map((id) => view.steps.map((_, active) => elementState(id, { ...view, active })));
}

/** The ids of the elements that the picture of a compiled figure draws. */
function pictured(out: ReturnType<typeof stepped>): string[] {
  const outline = (text: string, _font: unknown, x: number, y: number) =>
    `M${x} ${y}h${text.length}`;
  const { svg } = pictureOf(out, {}, { measure, outline }, lightPaint);
  return [...svg.matchAll(/<g data-element-id="([^"]+)"/g)].map((m) => m[1] as string);
}

test("a step-only message appears only in its steps, with the activation bar it opens", () => {
  const focus = [["get-item"], ["retry"]];
  const out = stepped((d) => {
    const a = d.box("Client");
    const b = d.box("API");
    d.sequence(
      [a, b],
      [
        { from: a, to: b, label: "get item" },
        { from: b, to: a, label: "item", reply: true },
        { from: a, to: b, label: "retry", stepOnly: true },
      ],
    );
  }, focus);
  assert.deepEqual(out.diagnostics, []);
  assert.equal(out.edges.find((e) => e.id === "retry")?.stepOnly, true);
  assert.equal(out.edges.find((e) => e.id === "get-item")?.stepOnly, undefined);
  assert.equal(out.nodes.find((n) => n.follows === "retry")?.id, "api-active-2");
  assert.deepEqual(states(out, focus, ["retry", "get-item"]), [
    ["absent", "focus"],
    ["focus", "dim"],
  ]);
  const drawn = pictured(out);
  assert.ok(drawn.includes("get-item") && drawn.includes("api-active-1"));
  assert.ok(!drawn.includes("retry") && !drawn.includes("api-active-2"));
});

test("a step that focuses two participants focuses none of their messages or lifelines", () => {
  const focus = [
    ["client", "api"],
    ["client", "api", "item"],
  ];
  const out = stepped((d) => {
    const a = d.box("Client");
    const b = d.box("API");
    d.sequence(
      [a, b],
      [
        { from: a, to: b, label: "get item" },
        { from: b, to: a, label: "item", reply: true },
      ],
    );
  }, focus);
  assert.deepEqual(out.diagnostics, []);
  assert.deepEqual(
    out.edges.filter((e) => e.ends),
    [],
    "messages and lifelines do not follow their ends",
  );
  assert.deepEqual(
    focus.map((f) => [...stepFocus(f, out).elements].sort()),
    [
      ["api", "client"],
      ["api", "client", "item"],
    ],
  );
  assert.deepEqual(states(out, focus, ["get-item", "item", "client-lifeline"]), [
    ["dim", "dim"],
    ["dim", "focus"],
    ["dim", "dim"],
  ]);
});

test("a step-only note shows only in its steps, and is reported when no step focuses it", () => {
  const draw = (d: DiagramBuilder) => {
    const a = d.box("Client");
    const b = d.box("API");
    d.sequence(
      [a, b],
      [
        { from: a, to: b, label: "get item" },
        { note: "Cached for a minute", over: b, stepOnly: true, category: "New" },
      ],
    );
  };
  const focus = [["get-item"], ["cached-for-a-minute"]];
  const out = stepped(draw, focus);
  assert.deepEqual(out.diagnostics, []);
  const note = out.nodes.find((n) => n.id === "cached-for-a-minute");
  assert.equal(note?.stepOnly, true);
  assert.equal(note?.category, 1);
  assert.deepEqual(states(out, focus, ["cached-for-a-minute"]), [["absent", "focus"]]);
  assert.ok(!pictured(out).includes("cached-for-a-minute"));
  assert.deepEqual(
    stepped(draw, [["get-item"]]).diagnostics.map((x) => [x.code, x.ids]),
    [["STEP_ONLY_UNUSED", ["cached-for-a-minute"]]],
  );
});

test("a step-only fragment shows its frame only in its steps; its messages say so themselves", () => {
  const focus = [["ask"], ["retry"]];
  const out = stepped((d) => {
    const a = d.box("Client");
    const b = d.box("API");
    d.sequence(
      [a, b],
      [
        {
          fragment: "loop",
          id: "retry",
          stepOnly: true,
          messages: [
            { from: a, to: b, label: "ask" },
            { from: a, to: b, label: "again", stepOnly: true },
          ],
        },
      ],
    );
  }, focus);
  assert.deepEqual(out.diagnostics, []);
  assert.equal(out.frames.find((f) => f.id === "retry")?.stepOnly, true);
  assert.deepEqual(states(out, focus, ["retry", "ask", "again"]), [
    ["absent", "focus"],
    ["focus", "focus"],
    ["absent", "focus"],
  ]);
  const drawn = pictured(out);
  assert.ok(drawn.includes("ask"));
  assert.ok(!drawn.includes("retry") && !drawn.includes("again"));
});

test("a fragment with a category is drawn in its color", () => {
  const out = stepped((d) => {
    const a = d.box("Client");
    const b = d.box("API");
    d.sequence(
      [a, b],
      [{ fragment: "opt", category: "New", messages: [{ from: a, to: b, label: "ask" }] }],
    );
  });
  assert.deepEqual(out.diagnostics, []);
  assert.equal(out.frames[0]?.category, 1);
  assert.deepEqual(out.legend, [{ name: "New", id: "new", slot: 1, elements: ["opt"] }]);
  const outline = (text: string, _font: unknown, x: number, y: number) =>
    `M${x} ${y}h${text.length}`;
  const { svg } = pictureOf(out, {}, { measure, outline }, lightPaint);
  const frame = /<g data-element-id="opt"[^>]*>(.*?)<\/g>/.exec(svg)?.[1] ?? "";
  assert.match(frame, new RegExp(`stroke="${lightPaint.colors.category1}"`));
});

test("reply and async set a message's line and head, and an explicit dashed overrides the line", () => {
  const out = stepped((d) => {
    const a = d.box("Client");
    const b = d.box("API");
    d.sequence(
      [a, b],
      [
        { from: a, to: b, label: "call" },
        { from: b, to: a, label: "reply", reply: true },
        { from: a, to: b, label: "solid call" },
        { from: b, to: a, label: "solid reply", reply: true, dashed: false },
        { from: a, to: b, label: "event", async: true },
        { from: a, to: b, label: "dashed call", dashed: true },
      ],
    );
  });
  assert.deepEqual(out.diagnostics, []);
  assert.deepEqual(
    out.edges.filter((e) => !e.passive).map((e) => [e.id, e.dashed, e.head?.kind]),
    [
      ["call", undefined, "filled"],
      ["reply", true, "open"],
      ["solid-call", undefined, "filled"],
      ["solid-reply", undefined, "open"],
      ["event", undefined, "open"],
      ["dashed-call", true, "filled"],
    ],
  );
});

test("a message with both reply and async is INVALID_ARGUMENT, and the first form is used", () => {
  const out = stepped((d) => {
    const a = d.box("Client");
    const b = d.box("API");
    d.sequence(
      [a, b],
      [
        { from: a, to: b, label: "call" },
        { from: b, to: a, label: "back", reply: true, async: true } as never,
      ],
    );
  });
  assert.deepEqual(
    out.diagnostics.map((x) => [x.code, x.subject]),
    [["INVALID_ARGUMENT", "messages[1].async"]],
  );
  assert.equal(out.edges.find((e) => e.id === "back")?.dashed, true);
});

/** The subjects of REPLY_WITHOUT_CALL in a sequence of three participants. */
function lonelyReplies(entries: (a: Node, b: Node, c: Node) => SequenceEntry[]) {
  return stepped((d) => {
    const a = d.box("A");
    const b = d.box("B");
    const c = d.box("C");
    d.sequence([a, b, c], entries(a, b, c));
  })
    .diagnostics.filter((x) => x.code === "REPLY_WITHOUT_CALL")
    .map((x) => x.subject);
}

test("a reply with no open call from the participant it returns to is REPLY_WITHOUT_CALL", () => {
  const out = stepped((d) => {
    const a = d.box("A");
    const b = d.box("B");
    d.sequence(
      [a, b],
      [
        { from: a, to: b, label: "get" },
        { from: a, to: b, label: "item", reply: true },
      ],
    );
  });
  assert.deepEqual(out.diagnostics, [
    {
      code: "REPLY_WITHOUT_CALL",
      message:
        "sequence sequence-1: messages[1], item, is a reply from a to b, but b has no open call to a. Swap from and to, or remove reply.",
      ids: ["item"],
      subject: "messages[1].reply",
    },
  ]);
  assert.deepEqual(
    out.edges.filter((e) => !e.passive).map((e) => [e.id, e.dashed, e.head?.kind]),
    [
      ["get", undefined, "filled"],
      ["item", true, "open"],
    ],
  );
  assert.deepEqual(
    lonelyReplies((a, b) => [
      { from: a, to: b, label: "event", async: true },
      { from: b, to: a, label: "after async", reply: true },
      { from: a, to: b, label: "call" },
      { from: b, to: a, label: "first", reply: true },
      { from: b, to: a, label: "second", reply: true },
    ]),
    ["messages[1].reply", "messages[4].reply"],
  );
  assert.deepEqual(
    lonelyReplies((a, b, c) => [
      { from: a, to: b, label: "outer" },
      { from: c, to: b, label: "inner" },
      { from: b, to: a, label: "closes both", reply: true },
      { from: b, to: c, label: "too late", reply: true },
    ]),
    ["messages[3].reply"],
  );
});

test("the branches of a fragment may each reply to the call open when it began", () => {
  assert.deepEqual(
    lonelyReplies((a, b, c) => [
      { from: a, to: b, label: "get" },
      { from: b, to: c, label: "query" },
      { from: c, to: b, label: "rows", reply: true },
      {
        fragment: "alt",
        messages: [{ from: b, to: a, label: "found", reply: true }],
        else: [
          { title: "missing", messages: [{ from: b, to: a, label: "404", reply: true }] },
          {
            title: "late",
            messages: [
              { fragment: "opt", messages: [{ from: b, to: a, label: "503", reply: true }] },
            ],
          },
        ],
      },
      { from: a, to: a, label: "self", reply: true },
    ]),
    [],
  );
  assert.deepEqual(
    lonelyReplies((a, b) => [
      { from: a, to: b, label: "get" },
      { from: b, to: a, label: "item", reply: true },
      { fragment: "opt", messages: [{ from: b, to: a, label: "again", reply: true }] },
      {
        fragment: "alt",
        messages: [{ note: "nothing open", over: a }],
        else: [{ messages: [{ from: b, to: a, label: "other", reply: true }] }],
      },
    ]),
    ["messages[2].messages[0].reply", "messages[3].else[0].messages[0].reply"],
  );
});
