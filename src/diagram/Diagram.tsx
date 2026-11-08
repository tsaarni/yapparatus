import * as stylex from "@stylexjs/stylex";
import {
  Children,
  isValidElement,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { partSeparator } from "../document.ts";
import { FigureFrame } from "../reader/components.tsx";
import { useDiagramReport } from "../reader/diagnostics.tsx";
import { AppIcon } from "../reader/icons.tsx";
import { useScopedId } from "../reader/prose.tsx";
import { useRoute } from "../reader/router.ts";
import {
  duration,
  fontSize,
  fontWeight,
  lineHeight,
  radius,
  sizes,
  space,
  theme,
  when,
} from "../reader/theme.stylex.ts";
import { Button, styled } from "../reader/ui.tsx";
import {
  type CompiledDiagram,
  type CompiledEdge,
  type CompiledEnclosure,
  type CompiledFrame,
  type CompiledNode,
  compile,
  cylinderCap,
  defaultMetrics,
  type LegendEntry,
  type Measure,
  type TextLine,
} from "./compile.ts";
import { overlap, type Rect, union, type Vec } from "./geometry.ts";
import { type Diagnostic, DiagramBuilder, type Role } from "./scene.ts";

export interface DiagramProps {
  /** Builds the scene: create elements, arrange them, connect them. */
  draw: (d: DiagramBuilder) => void;
  /** Figure id for references and links. With a caption, the figure is numbered. */
  id?: string;
  caption?: string;
  description?: string;
  /** Hide each part until the first step that focuses it. Needs `<Step>` children. */
  build?: boolean;
  /** `<Step>` elements: an explanation of the figure, in order. */
  children?: ReactNode;
  /** Show layout bounds, element ids, and route vertices. */
  debug?: boolean;
}

export interface StepProps {
  /** An address for the step: `/page#figure--id`. Unique among the figure's parts and steps. */
  id?: string;
  /**
   * Ids of the parts this step is about, separated by spaces. A container (an enclosure,
   * row, column, sequence, or fragment) stands for everything in it.
   */
  focus?: string;
  /** One or two sentences. */
  children?: ReactNode;
}

/** One step of a diagram's explanation. It is drawn by its `<Diagram>`, never by itself. */
export function Step(_props: StepProps) {
  return null;
}
/** Marks Step by a property, not by identity: hot reload replaces the function. */
Step.diagramStep = true;

interface StepItem {
  id?: string;
  /** The ids as written. */
  focus: string[];
  /** The focused parts, with containers expanded to their contents. */
  parts: Set<string>;
  content: ReactNode;
}

/** How a part looks in the current step. "absent" is a step-only part outside its steps. */
type PartState = "focus" | "dim" | "hidden" | "absent" | undefined;

const dev = import.meta.env.DEV;
const lastValid = new Map<string, CompiledDiagram>();
/** Drawings shrink to this fraction of their natural size before the figure scrolls. */
const minScale = 0.75;
/** Inner width of a figure in the wide track: text column plus breakout. */
const readingWidth = 960;
const m = defaultMetrics;

export function Diagram({ draw, id, caption, description, build, children, debug }: DiagramProps) {
  const ready = useFontsReady();
  const marker = useId();
  const figure = useScopedId(id);
  // `draw` is a new function on every render, but a pure one: its source text identifies
  // the drawing. Compile once per source, not on every step or parent render.
  const source = draw.toString();
  // biome-ignore lint/correctness/useExhaustiveDependencies: The source text stands for `draw`.
  const result = useMemo(() => (ready ? compileDraw(draw) : undefined), [ready, source]);
  // While editing, keep showing the last valid drawing above the errors.
  const key = id ?? caption;
  if (result?.ok && key) lastValid.set(key, result);
  const fallback = dev && result && !result.ok && key ? lastValid.get(key) : undefined;
  const shown = fallback ?? result;

  const steps = collectSteps(children, shown?.groups ?? {});
  const stepsOf = (part: string) => steps.flatMap((step, i) => (step.parts.has(part) ? [i] : []));
  const stepOnly = new Set([
    ...(shown?.nodes ?? []).filter((n) => n.stepOnly).map((n) => n.id),
    ...(shown?.edges ?? []).filter((e) => e.stepOnly).map((e) => e.id),
  ]);
  const [active, setActive] = useState<number | undefined>(undefined);
  // Parts a legend entry highlights while the reader points at it or focuses it.
  const [preview, setPreview] = useState<string[]>();
  const current = active === undefined ? undefined : steps[active];
  const stateOf = (part: string): PartState => {
    if (preview) return preview.includes(part) ? "focus" : stepOnly.has(part) ? "absent" : "dim";
    if (current?.parts.has(part)) return "focus";
    if (stepOnly.has(part)) return "absent";
    if (!current || active === undefined) return undefined;
    const first = stepsOf(part)[0];
    if (build && first !== undefined && first > active) return "hidden";
    return "dim";
  };

  // A link to a step, or to a part, opens that step, or the first step about the part.
  const route = useRoute();
  const prefix = `${figure}${partSeparator}`;
  const fragment =
    figure && route.fragment.startsWith(prefix) ? route.fragment.slice(prefix.length) : "";
  const byId = steps.findIndex((step) => step.id === fragment);
  const linked = !fragment ? undefined : byId >= 0 ? byId : stepsOf(fragment)[0];
  useEffect(() => {
    if (!route || linked === undefined) return;
    setActive(linked);
    // A step has no element of its own to scroll to; show its figure.
    if (byId >= 0 && figure) document.getElementById(figure)?.scrollIntoView({ block: "center" });
  }, [route, linked, byId, figure]);

  // In a figure that scrolls sideways, bring the focused parts into view.
  useEffect(() => {
    if (active !== undefined) revealFocused(marker);
  }, [active, marker]);

  const natural = result?.ok ? result.viewBox.width : 0;
  const diagnostics: Diagnostic[] = result ? [...result.diagnostics] : [];
  // Checked against a fixed budget, not the current window, so every author sees the same result.
  if (natural * minScale > readingWidth)
    diagnostics.push({
      code: "DIAGRAM_SCROLLS",
      severity: "warning",
      message: `The drawing is ${natural} units wide. The widest figure area fits ${readingWidth} at full size and ${Math.floor(readingWidth / minScale)} when shrunk, so readers must scroll sideways. Stack rows into columns or shorten labels.`,
      ids: [],
    });
  if (result?.ok) diagnostics.push(...checkSteps(steps, result, build ?? false));
  useDiagramReport(
    marker,
    key ?? marker,
    result &&
      diagnostics.map((d) => ({
        severity: d.severity,
        code: d.code,
        message: d.message,
        ...(id ? { target: id } : {}),
        ...(d.ids.length ? { elements: d.ids } : {}),
      })),
  );

  const label = caption ?? "Diagram";
  const partOf = (target: EventTarget) =>
    target instanceof Element
      ? target.closest<SVGElement>("[data-element-id]")?.dataset.elementId
      : undefined;
  // Clicking a part again moves on to the next step about it, so a reader can follow its arc.
  const openPart = (part: string | undefined) => {
    const about = part === undefined ? [] : stepsOf(part);
    const next = about.find((i) => active === undefined || i > active) ?? about[0];
    if (next !== undefined) setActive(next);
  };
  const go = (step: number | undefined) =>
    setActive(step === undefined ? undefined : Math.max(0, Math.min(steps.length - 1, step)));
  const onKeyDown = (event: KeyboardEvent) => {
    if (!steps.length) return;
    if (event.key === "Escape" && active !== undefined) go(undefined);
    else if (event.key === "ArrowRight") go(active === undefined ? 0 : active + 1);
    else if (event.key === "ArrowLeft" && active !== undefined) go(active - 1);
    else if (event.key === "Enter" || event.key === " ") return openPart(partOf(event.target));
    else return;
    event.preventDefault();
  };
  const body = (
    <>
      {shown ? (
        <DiagramView
          diagram={shown}
          title={label}
          debug={debug ?? false}
          stale={!!fallback}
          marker={marker}
          figure={figure}
          stateOf={stateOf}
          stepped={(part) => stepsOf(part).length > 0}
          {...(steps.length
            ? { onClick: (event: MouseEvent) => openPart(partOf(event.target)), onKeyDown }
            : {})}
        />
      ) : (
        <div data-diagram={marker} {...stylex.props(styles.pending)} />
      )}
      {shown && shown.legend.length > 0 && <Legend legend={shown.legend} preview={setPreview} />}
      {dev && diagnostics.length > 0 && <Diagnostics items={diagnostics} />}
    </>
  );
  const footer = steps.length ? <StepControls steps={steps} active={active} go={go} /> : undefined;
  if (!id && !caption)
    return (
      <>
        {body}
        {footer}
      </>
    );
  return (
    <FigureFrame
      {...(id ? { id } : {})}
      {...(caption ? { caption } : {})}
      {...(description ? { description } : {})}
      footer={footer}
    >
      {body}
    </FigureFrame>
  );
}

Diagram.breakout = true;

function compileDraw(draw: DiagramProps["draw"]): CompiledDiagram {
  const scene = new DiagramBuilder();
  try {
    draw(scene);
  } catch (error) {
    return {
      ok: false,
      viewBox: { x: 0, y: 0, width: 0, height: 0 },
      nodes: [],
      edges: [],
      enclosures: [],
      frames: [],
      legend: [],
      groups: {},
      diagnostics: [
        {
          code: "DRAW_ERROR",
          severity: "error",
          message: error instanceof Error ? error.message : String(error),
          ids: [],
        },
      ],
    };
  }
  return compile(scene, canvasMeasure);
}

/* ---------- steps ---------- */

function collectSteps(children: ReactNode, groups: Record<string, string[]>): StepItem[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<StepProps>(child)) return [];
    if (!(child.type as { diagramStep?: boolean }).diagramStep) return [];
    const focus = (child.props.focus ?? "").split(/\s+/).filter(Boolean);
    return [
      {
        ...(child.props.id ? { id: child.props.id } : {}),
        focus,
        parts: expand(focus, groups),
        content: child.props.children,
      },
    ];
  });
}

/** The parts named, with every container replaced by itself plus all it holds. */
function expand(ids: string[], groups: Record<string, string[]>): Set<string> {
  const parts = new Set<string>();
  const visit = (id: string) => {
    if (parts.has(id)) return;
    parts.add(id);
    for (const member of groups[id] ?? []) visit(member);
  };
  for (const id of ids) visit(id);
  return parts;
}

/** Scroll a sideways-scrolling figure so its focused parts are visible. */
function revealFocused(marker: string) {
  const svg = document.querySelector(`svg[data-diagram="${CSS.escape(marker)}"]`);
  const scroller = svg?.closest<HTMLElement>(".figure-scroll");
  if (!svg || !scroller || scroller.scrollWidth <= scroller.clientWidth) return;
  const boxes = [...svg.querySelectorAll("[data-state=focus]")].map((e) =>
    e.getBoundingClientRect(),
  );
  if (!boxes.length) return;
  const left = Math.min(...boxes.map((b) => b.left));
  const right = Math.max(...boxes.map((b) => b.right));
  const view = scroller.getBoundingClientRect();
  if (left >= view.left && right <= view.right) return;
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  scroller.scrollBy({
    left: (left + right) / 2 - (view.left + view.right) / 2,
    behavior: smooth ? "smooth" : "auto",
  });
}

function checkSteps(steps: StepItem[], diagram: CompiledDiagram, build: boolean): Diagnostic[] {
  const parts = [
    ...diagram.nodes.filter((n) => !n.passive).map((n) => n.id),
    ...diagram.edges.filter((e) => !e.passive).map((e) => e.id),
    ...diagram.enclosures.map((e) => e.id),
    ...diagram.frames.map((f) => f.id),
  ];
  const known = new Set([...parts, ...Object.keys(diagram.groups)]);
  const diagnostic = (code: string, message: string, ids: string[] = []): Diagnostic => ({
    code,
    severity: "warning",
    message,
    ids,
  });
  const diagnostics: Diagnostic[] = steps.flatMap((step, i) =>
    step.focus
      .filter((part) => !known.has(part))
      .map((part) =>
        diagnostic(
          "UNKNOWN_PART",
          `Step ${i + 1} focuses "${part}", which is not a part of this diagram. Parts: ${parts.join(", ")}.`,
        ),
      ),
  );
  const ids = new Set<string>();
  for (const step of steps) {
    if (!step.id) continue;
    if (known.has(step.id) || ids.has(step.id))
      diagnostics.push(
        diagnostic("DUPLICATE_ID", `Step id "${step.id}" is already used in this figure.`),
      );
    ids.add(step.id);
  }
  // Step-only parts: each must appear somewhere, and those shown together must not collide.
  const stepOnly = diagram.nodes.filter((n) => n.stepOnly);
  for (const part of [...stepOnly, ...diagram.edges.filter((e) => e.stepOnly)])
    if (!steps.some((step) => step.parts.has(part.id)))
      diagnostics.push(
        diagnostic("STEP_ONLY_UNUSED", `${part.id} is stepOnly, but no step focuses it.`, [
          part.id,
        ]),
      );
  steps.forEach((step, i) => {
    const together = stepOnly.filter((n) => step.parts.has(n.id));
    for (let a = 0; a < together.length; a++)
      for (let b = a + 1; b < together.length; b++) {
        const [x, y] = [together[a], together[b]];
        if (x && y && overlap(x.rect, y.rect))
          diagnostics.push(
            diagnostic(
              "NODE_OVERLAP",
              `${x.id} and ${y.id} overlap, and step ${i + 1} shows both.`,
              [x.id, y.id],
            ),
          );
      }
  });
  if (build && !steps.length)
    diagnostics.push(
      diagnostic(
        "BUILD_WITHOUT_STEPS",
        "build reveals parts step by step, but the diagram has no <Step> children.",
      ),
    );
  return diagnostics;
}

/** Previous and next buttons, and the text of every step; print shows all of them. */
function StepControls({
  steps,
  active,
  go,
}: {
  steps: StepItem[];
  active: number | undefined;
  go: (step: number | undefined) => void;
}) {
  return (
    <div
      {...styled("diagram-steps", styles.steps)}
      // Questions about the figure record the step the reader had open.
      {...(active === undefined
        ? {}
        : {
            "data-step": `Step ${active + 1} of ${steps.length}${steps[active]?.id ? ` (${steps[active]?.id})` : ""}`,
          })}
    >
      <div {...stylex.props(styles.stepBar)}>
        <Button
          variant="icon"
          aria-label="Previous step"
          disabled={!active}
          onClick={() => go((active ?? 1) - 1)}
        >
          <AppIcon name="previous" />
        </Button>
        <span {...stylex.props(styles.stepCount)}>
          {active === undefined ? `${steps.length} steps` : `Step ${active + 1} of ${steps.length}`}
        </span>
        <Button
          variant="icon"
          aria-label={active === undefined ? "Start steps" : "Next step"}
          disabled={active === steps.length - 1}
          onClick={() => go(active === undefined ? 0 : active + 1)}
        >
          <AppIcon name="next" />
        </Button>
        {active !== undefined && (
          <Button size="small" variant="ghost" onClick={() => go(undefined)}>
            Show all
          </Button>
        )}
      </div>
      <ol aria-live="polite" {...stylex.props(styles.stepList)}>
        {steps.map((step, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: Steps are positional.
            key={i}
            {...(active === i ? { "data-active": "" } : {})}
            {...stylex.props(styles.stepText, active === i && styles.stepActive)}
          >
            {step.content}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------- measurement ---------- */

let context: CanvasRenderingContext2D | null | undefined;
const canvasMeasure: Measure = (text, font) => {
  context ??= document.createElement("canvas").getContext("2d");
  if (!context) return text.length * font.size * 0.55;
  context.font = `${font.weight} ${font.size}px ${font.family}`;
  return context.measureText(text).width;
};

const fontQueries = [
  ...[m.textWeight, m.edgeWeight, m.labelWeight].map((w) => `${w} ${m.labelSize}px ${m.sans}`),
  `${m.textWeight} ${m.smallSize}px ${m.mono}`,
];
let fontsLoaded = false;

/** Measurement is only meaningful with the real fonts, so wait for them once. */
export function useFontsReady() {
  const [ready, setReady] = useState(fontsLoaded);
  useEffect(() => {
    if (ready) return;
    let live = true;
    Promise.all(fontQueries.map((q) => document.fonts.load(q)))
      .catch(() => undefined)
      .then(() => {
        fontsLoaded = true;
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [ready]);
  return ready;
}

/* ---------- rendering ---------- */

function DiagramView({
  diagram,
  title,
  debug,
  stale = false,
  marker,
  figure,
  stateOf,
  stepped,
  onClick,
  onKeyDown,
}: {
  diagram: CompiledDiagram;
  title: string;
  debug: boolean;
  stale?: boolean;
  marker: string;
  figure: string | undefined;
  stateOf: (part: string) => PartState;
  stepped: (part: string) => boolean;
  /** Delegated from the parts: open the step a part belongs to, and step with the keyboard. */
  onClick?: (event: MouseEvent) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
}) {
  if (!diagram.ok)
    return (
      <div data-diagram={marker} role="img" aria-label={title} {...stylex.props(styles.failed)}>
        This diagram could not be drawn. See the errors below.
      </div>
    );
  const vb = diagram.viewBox;
  const flagged = new Set(
    dev ? diagram.diagnostics.flatMap((d) => (d.severity === "warning" ? d.ids : [])) : [],
  );
  const passive = diagram.edges.filter((e) => e.passive);
  const active = diagram.edges.filter((e) => !e.passive);
  const part = (id: string, label: string) => ({
    state: stateOf(id),
    target: interactive(id, label, figure, dev || stepped(id)),
  });
  // Decorations fade and hide with their edge, but never take the accent themselves.
  const decoration = (state: PartState) => (state && state !== "focus" ? { state } : {});
  const anyStepped = [...diagram.nodes, ...diagram.edges].some((p) => stepped(p.id));
  return (
    <svg
      data-diagram={marker}
      viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
      width={vb.width}
      height={vb.height}
      // An image hides its parts from assistive technology; interactive parts need a group.
      role={dev || anyStepped ? "group" : "img"}
      onClick={onClick}
      onKeyDown={onKeyDown}
      aria-label={title}
      {...stylex.props(
        styles.svg,
        styles.minWidth(Math.round(vb.width * minScale)),
        stale && styles.stale,
      )}
    >
      {diagram.frames.map((frame) => (
        <FrameView key={frame.id} frame={frame} layer="outline" state={stateOf(frame.id)} />
      ))}
      {diagram.enclosures.map((e) => (
        <EnclosureView key={e.id} enclosure={e} state={stateOf(e.id)} />
      ))}
      {passive.map((edge) => (
        <EdgeView key={edge.id} edge={edge} flagged={false} />
      ))}
      {diagram.nodes.map((node) => (
        <NodeView
          key={node.id}
          node={node}
          flagged={flagged.has(node.id)}
          {...(node.passive
            ? decoration(node.follows ? stateOf(node.follows) : undefined)
            : part(node.id, node.label))}
        />
      ))}
      {active.map((edge) => (
        <EdgeView
          key={edge.id}
          edge={edge}
          flagged={flagged.has(edge.id)}
          {...part(edge.id, edge.ariaLabel)}
        />
      ))}
      {diagram.frames.map((frame) => (
        <FrameView
          key={`${frame.id}-labels`}
          frame={frame}
          layer="labels"
          state={stateOf(frame.id)}
        />
      ))}
      {debug && <DebugLayer diagram={diagram} />}
    </svg>
  );
}

/**
 * Diagram parts are targets: a namespaced DOM id (`figure--part`) makes them linkable.
 * Parts are buttons while editing (to ask about them) and when a step explains them.
 */
function interactive(id: string, label: string, figure: string | undefined, button: boolean) {
  return {
    ...(figure ? { id: `${figure}${partSeparator}${id}` } : {}),
    "data-element-id": id,
    "data-target": "diagram-part",
    "data-title": label,
    "aria-label": label,
    ...(button ? { role: "button", tabIndex: 0 } : {}),
  };
}

type Target = ReturnType<typeof interactive>;

/** Focused parts are drawn heavier; others fade; parts not yet built are hidden. */
function stateStyle(state: PartState): stylex.StyleXStyles | null {
  return state === "focus"
    ? (styles.focused as stylex.StyleXStyles)
    : state === "dim"
      ? styles.dimmed
      : state === "hidden"
        ? styles.hidden
        : state === "absent"
          ? styles.absent
          : null;
}

/** Briefly mark a part the reader arrived at: heavier, with the focus ring around it. */
export function flashPart(element: SVGElement) {
  const classes = stylex.props(styles.arrived).className?.split(" ") ?? [];
  element.classList.add(...classes);
  window.setTimeout(() => element.classList.remove(...classes), 1800);
}

/** Hidden parts leave the tab order. The state is also an attribute, for scrolling into view. */
function targetFor(target: Target | undefined, state: PartState) {
  const marked = state ? { "data-state": state } : {};
  if (!target) return marked;
  return state === "hidden" || state === "absent"
    ? { ...target, ...marked, tabIndex: -1, "aria-hidden": true }
    : { ...target, ...marked };
}

/** Text exactly as the compiler measured it: its size, weight, and position. */
function Line({ line, halo = false }: { line: TextLine; halo?: boolean }) {
  return (
    <text
      x={line.x}
      y={line.y}
      fontSize={line.size}
      fontWeight={line.weight}
      {...stylex.props(
        styles.text,
        line.mono ? styles.mono : styles.sans,
        line.align === "start" && styles.start,
        line.muted && styles.muted,
        halo && styles.halo,
      )}
    >
      {line.text}
    </text>
  );
}

function Lines({ lines }: { lines: TextLine[] }) {
  // biome-ignore lint/suspicious/noArrayIndexKey: Lines are positional.
  return lines.map((line, i) => <Line key={i} line={line} />);
}

function NodeView({
  node,
  flagged,
  target,
  state,
}: {
  node: CompiledNode;
  flagged: boolean;
  target?: Target;
  state?: PartState;
}) {
  const r = node.rect;
  if (node.shape === "space") return null;
  if (node.shape === "bar")
    return (
      <rect
        x={r.x}
        y={r.y}
        width={r.width}
        height={r.height}
        rx={2}
        {...stylex.props(styles.bar, styles.fade, stateStyle(state))}
      />
    );
  return (
    <g
      {...targetFor(target, state)}
      {...styled(
        "diagram-target",
        styles.target,
        roleStyle(node.role),
        categoryStyle(node.category),
        styles.fade,
        stateStyle(state),
      )}
    >
      <Shape node={node} />
      <Lines lines={node.lines} />
      {node.role === "warning" && <WarningBadge node={node} />}
      {flagged && (
        <rect
          {...outline(node.labelRect ? (union([r, node.labelRect]) as Rect) : r, 4)}
          rx={8}
          {...stylex.props(styles.flag)}
        />
      )}
    </g>
  );
}

/**
 * A warning part also says so without color: an exclamation mark on its top-right corner.
 * Amber and the accent can look alike, at a glance and with color blindness.
 */
function WarningBadge({ node }: { node: CompiledNode }) {
  const { x, y, width } = node.rect;
  const cx = x + width - 2;
  const cy = y + 2;
  return (
    <g>
      <circle cx={cx} cy={cy} r={badge.radius} {...stylex.props(styles.badge)} />
      <path
        d={`M${cx} ${cy - 3.5}V${cy + 0.5}M${cx} ${cy + 3.2}V${cy + 3.3}`}
        {...stylex.props(styles.badgeMark)}
      />
    </g>
  );
}

function Shape({ node }: { node: CompiledNode }) {
  const r = node.rect;
  const { x, y, width: w, height: h } = r;
  const shape = stylex.props(styles.shape, node.role === "external" && styles.dashed);
  switch (node.shape) {
    case "box":
      return <rect x={x} y={y} width={w} height={h} rx={corner.shape} {...shape} />;
    case "cylinder": {
      const ry = cylinderCap(w);
      const rx = w / 2;
      const top = y + ry;
      const bottom = y + h - ry;
      return (
        <>
          <path
            d={`M${x} ${top}A${rx} ${ry} 0 0 1 ${x + w} ${top}V${bottom}A${rx} ${ry} 0 0 1 ${x} ${bottom}Z`}
            {...shape}
          />
          <ellipse cx={x + rx} cy={top} rx={rx} ry={ry} {...shape} />
        </>
      );
    }
    case "actor": {
      const cx = x + w / 2;
      return (
        <g {...stylex.props(styles.figure)}>
          <circle cx={cx} cy={y + 6.5} r={5.5} />
          <path
            d={`M${cx} ${y + 12}V${y + 22}M${cx - 8} ${y + 15.5}H${cx + 8}M${cx} ${y + 22}L${cx - 6.5} ${y + 30}M${cx} ${y + 22}L${cx + 6.5} ${y + 30}`}
          />
        </g>
      );
    }
    case "note": {
      const f = 10;
      return (
        <>
          <path d={`M${x} ${y}H${x + w - f}L${x + w} ${y + f}V${y + h}H${x}Z`} {...shape} />
          <path d={`M${x + w - f} ${y}V${y + f}H${x + w}`} {...stylex.props(styles.fold)} />
        </>
      );
    }
    case "diamond":
      return (
        <polygon
          points={`${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`}
          {...shape}
        />
      );
    case "dot":
      return <circle cx={x + w / 2} cy={y + h / 2} r={w / 2} {...stylex.props(styles.solid)} />;
    case "ring":
      return (
        <>
          <circle cx={x + w / 2} cy={y + h / 2} r={w / 2 - 0.75} {...stylex.props(styles.ring)} />
          <circle cx={x + w / 2} cy={y + h / 2} r={w / 2 - 5} {...stylex.props(styles.solid)} />
        </>
      );
    case "record":
      return (
        <>
          <rect x={x} y={y} width={w} height={h} rx={corner.shape} {...shape} />
          {node.divider !== undefined && (
            <path d={`M${x} ${node.divider}H${x + w}`} {...stylex.props(styles.rule)} />
          )}
        </>
      );
    default:
      return <rect x={x} y={y} width={w} height={h} fill="transparent" />;
  }
}

/** A polyline whose bends are rounded by up to `radius`. */
function roundedPath(points: Vec[], radius: number): string {
  const first = points[0];
  if (!first) return "";
  let d = `M${first.x} ${first.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1] as Vec;
    const at = points[i] as Vec;
    const next = points[i + 1] as Vec;
    const inLen = Math.hypot(at.x - prev.x, at.y - prev.y);
    const outLen = Math.hypot(next.x - at.x, next.y - at.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r < 0.5) {
      d += `L${at.x} ${at.y}`;
      continue;
    }
    const a = { x: at.x - ((at.x - prev.x) / inLen) * r, y: at.y - ((at.y - prev.y) / inLen) * r };
    const b = {
      x: at.x + ((next.x - at.x) / outLen) * r,
      y: at.y + ((next.y - at.y) / outLen) * r,
    };
    d += `L${a.x} ${a.y}Q${at.x} ${at.y} ${b.x} ${b.y}`;
  }
  const last = points[points.length - 1] as Vec;
  return `${d}L${last.x} ${last.y}`;
}

function EdgeView({
  edge,
  flagged,
  target,
  state,
}: {
  edge: CompiledEdge;
  flagged: boolean;
  target?: Target;
  state?: PartState;
}) {
  const d = roundedPath(edge.points, edge.radius);
  if (edge.passive) return <path d={d} {...stylex.props(roleStyle(edge.role), styles.lifeline)} />;
  return (
    <g
      {...targetFor(target, state)}
      {...styled(
        "diagram-target",
        styles.target,
        roleStyle(edge.role),
        categoryStyle(edge.category),
        styles.edge,
        styles.fade,
        stateStyle(state),
      )}
    >
      <path d={d} {...stylex.props(styles.line, edge.dashed && styles.dashed)} />
      <path d={d} {...stylex.props(styles.hit)} />
      {edge.heads.map((head, i) =>
        edge.head === "open" ? (
          <polyline
            // biome-ignore lint/suspicious/noArrayIndexKey: Heads are positional.
            key={i}
            points={head.map((p) => `${p.x},${p.y}`).join(" ")}
            {...stylex.props(styles.openHead)}
          />
        ) : (
          <polygon
            // biome-ignore lint/suspicious/noArrayIndexKey: Heads are positional.
            key={i}
            points={head.map((p) => `${p.x},${p.y}`).join(" ")}
            {...stylex.props(styles.head)}
          />
        ),
      )}
      {edge.labels.map((label, i) => (
        <text
          // biome-ignore lint/suspicious/noArrayIndexKey: Labels are positional.
          key={i}
          x={label.center.x}
          y={label.center.y}
          fontSize={label.size}
          fontWeight={label.weight}
          {...stylex.props(styles.text, styles.sans, styles.edgeLabel, styles.halo)}
        >
          {label.text}
        </text>
      ))}
      {flagged &&
        edge.labels.map((label, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Labels are positional.
          <rect key={`f${i}`} {...outline(label.rect, 1)} rx={4} {...stylex.props(styles.flag)} />
        ))}
    </g>
  );
}

function EnclosureView({
  enclosure: e,
  state,
}: {
  enclosure: CompiledEnclosure;
  state: PartState;
}) {
  const t = e.titleRect;
  return (
    <g
      data-element-id={e.id}
      {...stylex.props(
        roleStyle(e.role),
        categoryStyle(e.category),
        styles.fade,
        stateStyle(state),
      )}
    >
      <rect
        x={e.rect.x}
        y={e.rect.y}
        width={e.rect.width}
        height={e.rect.height}
        rx={corner.group}
        {...stylex.props(styles.enclosure)}
      />
      {e.title && t && (
        <>
          <rect
            x={t.x}
            y={t.y}
            width={t.width}
            height={t.height}
            rx={t.height / 2}
            {...stylex.props(styles.tab)}
          />
          <Line line={e.title} />
        </>
      )}
    </g>
  );
}

/** Frames paint in two layers: the outline under everything, the labels above it. */
function FrameView({
  frame: f,
  layer,
  state,
}: {
  frame: CompiledFrame;
  layer: "outline" | "labels";
  state: PartState;
}) {
  const fade = stylex.props(styles.fade, stateStyle(state));
  const { x, y, width: w, height: h } = f.rect;
  if (layer === "outline")
    return (
      <g data-element-id={f.id} {...fade}>
        <rect x={x} y={y} width={w} height={h} rx={corner.frame} {...stylex.props(styles.frame)} />
        {f.dividers.map((divider, i) => (
          <path
            // biome-ignore lint/suspicious/noArrayIndexKey: Dividers are positional.
            key={i}
            d={`M${x} ${divider.y}H${x + w}`}
            {...stylex.props(styles.frame, styles.dashed)}
          />
        ))}
      </g>
    );
  const tab = f.tab?.rect;
  return (
    <g {...fade}>
      {f.tab && tab && (
        <>
          <path
            d={`M${tab.x} ${tab.y}H${tab.x + tab.width}V${tab.y + tab.height - 6}L${tab.x + tab.width - 6} ${tab.y + tab.height}H${tab.x}Z`}
            {...stylex.props(styles.frameTab)}
          />
          <Line line={f.tab.line} />
        </>
      )}
      {f.title && <Line line={f.title} halo />}
      {f.dividers.map(
        (divider, i) =>
          // biome-ignore lint/suspicious/noArrayIndexKey: Dividers are positional.
          divider.label && <Line key={i} line={divider.label} halo />,
      )}
    </g>
  );
}

function DebugLayer({ diagram }: { diagram: CompiledDiagram }) {
  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: The debug layer has no focusable content.
    <g aria-hidden="true" {...stylex.props(styles.debug)}>
      {diagram.nodes.map((n) => (
        <g key={n.id}>
          <rect {...outline(n.rect, 0)} fill="none" />
          <text x={n.rect.x + 2} y={n.rect.y - 4} {...stylex.props(styles.debugText)}>
            {n.id}
          </text>
        </g>
      ))}
      {diagram.edges.flatMap((e) =>
        e.points.map((p, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Vertices are positional.
          <circle key={`${e.id}-${i}`} cx={p.x} cy={p.y} r={2.5} />
        )),
      )}
      {diagram.edges.flatMap((e) =>
        e.labels.map((l) => <rect key={`${e.id}-${l.text}`} {...outline(l.rect, 0)} fill="none" />),
      )}
    </g>
  );
}

/** A figure's diagnostics under it, open while there are errors. Charts show theirs here too. */
export function Diagnostics({
  items,
  of = "diagram",
}: {
  items: Pick<Diagnostic, "code" | "severity" | "message">[];
  of?: "diagram" | "chart";
}) {
  const errors = items.filter((d) => d.severity === "error").length;
  const warnings = items.length - errors;
  const count = (n: number, word: string) => (n ? `${n} ${word}${n === 1 ? "" : "s"}` : "");
  return (
    <details open={errors > 0} {...stylex.props(styles.diagnostics)}>
      <summary {...stylex.props(styles.summary, errors ? styles.summaryError : null)}>
        {[count(errors, "error"), count(warnings, "warning")].filter(Boolean).join(", ")} in this{" "}
        {of}
      </summary>
      <ul
        aria-label={of === "chart" ? "Chart diagnostics" : "Diagram diagnostics"}
        {...stylex.props(styles.list)}
      >
        {items.map((d, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Diagnostics can repeat.
          <li key={i} {...stylex.props(styles.item, d.severity === "error" && styles.itemError)}>
            <code {...stylex.props(styles.code)}>{d.code}</code> {d.message}
          </li>
        ))}
      </ul>
    </details>
  );
}

function outline(r: Rect, pad: number) {
  return { x: r.x - pad, y: r.y - pad, width: r.width + 2 * pad, height: r.height + 2 * pad };
}

/**
 * A part's role, the same for shapes, edges, and enclosures: its ink, fill, label color, and
 * stroke weight, as custom properties that the shape and line styles read.
 */
function roleStyle(role: Role): stylex.StyleXStyles {
  switch (role) {
    case "accent":
      return styles.roleAccent as stylex.StyleXStyles;
    case "warning":
      return styles.roleWarning as stylex.StyleXStyles;
    case "muted":
      return styles.roleMuted as stylex.StyleXStyles;
    default:
      return styles.roleDefault as stylex.StyleXStyles;
  }
}

/** A category's color, by its slot in the legend. */
function categoryStyle(slot: number | undefined): stylex.StyleXStyles | null {
  switch (slot) {
    case 1:
      return styles.category1 as stylex.StyleXStyles;
    case 2:
      return styles.category2 as stylex.StyleXStyles;
    case 3:
      return styles.category3 as stylex.StyleXStyles;
    case 4:
      return styles.category4 as stylex.StyleXStyles;
    default:
      return null;
  }
}

/**
 * The legend: one entry per category, with its color and its words. Pointing at an entry,
 * or focusing it, highlights the category's parts, so the reader can find them without
 * telling colors apart.
 */
function Legend({
  legend,
  preview,
}: {
  legend: LegendEntry[];
  preview: (parts: string[] | undefined) => void;
}) {
  return (
    <ul aria-label="Legend" {...styled("diagram-legend", styles.legend)}>
      {legend.map((entry) => (
        <li key={entry.id}>
          <Button
            variant="ghost"
            size="small"
            title="Highlight these parts"
            onMouseEnter={() => preview(entry.parts)}
            onMouseLeave={() => preview(undefined)}
            onFocus={() => preview(entry.parts)}
            onBlur={() => preview(undefined)}
          >
            <span {...stylex.props(categoryStyle(entry.slot), styles.swatch)} />
            {entry.name}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Shape corners, by kind. */
const corner = { shape: 6, group: 10, frame: 4 };
/** Stroke weights: dividers and quiet parts, ordinary parts, the accent, and the extra weight of a part in focus. */
const stroke = { hairline: "1px", line: "1.5px", strong: "2px", boost: "0.75px" };
/** Dash patterns: dashed for boundaries and replies, dotted for lifelines and markers. */
const dash = { dashed: "5 4", dotted: "2 3" };
/** The warning badge on a part's corner. */
const badge = { radius: 7 };

const styles = stylex.create({
  svg: {
    display: "block",
    maxWidth: "100%",
    height: "auto",
    marginInline: "auto",
    overflow: "visible",
  },
  minWidth: (width: number) => ({ minWidth: `${width}px` }),
  pending: { minHeight: 120 },
  stale: { opacity: 0.35, filter: "grayscale(1)" },
  failed: {
    padding: space.xl,
    color: theme.error,
    fontSize: fontSize.sm,
    textAlign: "center",
  },
  /**
   * Parts that can be pointed at. Hover draws the part heavier, keeping its color; keyboard
   * focus draws the reader's focus ring, as everywhere else in the app.
   */
  target: {
    cursor: { default: "inherit", ":is([role=button])": "pointer" },
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineWidth: 2,
    outlineColor: theme.accentStrong,
    outlineOffset: 3,
    "--boost": { default: "0px", ":hover": stroke.boost, ":focus-visible": stroke.boost },
  },
  fade: {
    transitionProperty: "opacity",
    transitionDuration: duration.slow,
  },
  /** A part a step is about: heavier, in its own color, while the others fade. */
  focused: {
    "--boost": stroke.boost,
  },
  /** A part the reader just arrived at, by a link or Show on page. */
  arrived: {
    "--boost": stroke.boost,
    outlineStyle: "solid",
    outlineWidth: 2,
    outlineColor: theme.accentStrong,
    outlineOffset: 3,
  },
  dimmed: { opacity: { default: 0.35, [when.print]: 1 } },
  hidden: {
    opacity: { default: 0, [when.print]: 1 },
    pointerEvents: "none",
  },
  /** Step-only parts outside their steps: gone on screen and in print. */
  absent: {
    opacity: 0,
    pointerEvents: "none",
  },
  steps: {
    maxWidth: sizes.textWidth,
    marginTop: space.md,
    color: theme.textBody,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.normal,
  },
  stepBar: {
    display: { default: "flex", [when.print]: "none" },
    alignItems: "center",
    gap: space.xs,
    marginInlineStart: `calc(-1 * ${space.sm})`,
  },
  stepCount: {
    minWidth: 92,
    color: theme.textMuted,
    fontSize: fontSize.xs,
    textAlign: "center",
    fontVariantNumeric: "tabular-nums",
  },
  stepList: {
    margin: 0,
    paddingInlineStart: { default: 0, [when.print]: space.xl },
    listStylePosition: "outside",
    listStyleType: { default: "none", [when.print]: "decimal" },
  },
  stepText: {
    display: { default: "none", [when.print]: "list-item" },
    marginTop: space.xs,
  },
  stepActive: { display: "list-item" },
  // Roles. Every kind of part reads the same properties, so a role means the same everywhere.
  roleDefault: {
    "--ink": theme.borderControl,
    "--fill": theme.surfaceRaised,
    "--label": theme.text,
    "--weight": stroke.line,
  },
  roleAccent: {
    "--ink": theme.accent,
    "--fill": theme.accentSurface,
    "--label": theme.text,
    // The accent is also heavier, so it stands out without its color.
    "--weight": stroke.strong,
  },
  roleWarning: {
    "--ink": theme.warning,
    "--fill": theme.warningSurface,
    "--label": theme.text,
    "--weight": stroke.line,
  },
  // Category colors: they replace a role's hue and keep its weight, badge, and dashes.
  category1: { "--ink": theme.category1, "--fill": theme.category1Surface },
  category2: { "--ink": theme.category2, "--fill": theme.category2Surface },
  category3: { "--ink": theme.category3, "--fill": theme.category3Surface },
  category4: { "--ink": theme.category4, "--fill": theme.category4Surface },
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.xs,
    margin: 0,
    marginTop: space.md,
    padding: 0,
    listStyle: "none",
  },
  swatch: {
    display: "inline-block",
    flexShrink: 0,
    width: 14,
    height: 10,
    borderWidth: 1.5,
    borderStyle: "solid",
    borderColor: "var(--ink)",
    borderRadius: 3,
    backgroundColor: "var(--fill)",
  },
  roleMuted: {
    "--ink": theme.borderStrong,
    "--fill": "transparent",
    "--label": theme.textMuted,
    "--weight": stroke.hairline,
  },
  shape: {
    fill: "var(--fill)",
    stroke: "var(--ink)",
    strokeWidth: `calc(var(--weight) + var(--boost, 0px))`,
    strokeLinejoin: "round",
  },
  fold: {
    fill: theme.diagramShade,
    stroke: "var(--ink)",
    strokeWidth: `calc(var(--weight) + var(--boost, 0px))`,
    strokeLinejoin: "round",
  },
  figure: {
    fill: "none",
    stroke: "var(--ink)",
    strokeWidth: `calc(var(--weight) + var(--boost, 0px))`,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
  solid: { fill: theme.text },
  ring: { fill: "none", stroke: theme.text, strokeWidth: stroke.line },
  rule: { stroke: "var(--ink)", strokeWidth: stroke.hairline },
  bar: {
    fill: theme.surfaceHover,
    stroke: theme.borderControl,
    strokeWidth: stroke.hairline,
  },
  dashed: { strokeDasharray: dash.dashed },
  text: {
    fill: `var(--label, ${theme.text})`,
    textAnchor: "middle",
    dominantBaseline: "central",
  },
  sans: { fontFamily: theme.sans },
  mono: { fontFamily: theme.mono },
  start: { textAnchor: "start" },
  muted: { fill: theme.textMuted },
  edgeLabel: { fill: theme.textBody },
  /** A halo in the figure's own color keeps text readable over lines. */
  halo: {
    paintOrder: "stroke",
    stroke: `var(--figure-bg, ${theme.surface})`,
    strokeWidth: 5,
    strokeLinejoin: "round",
  },
  edge: { color: "var(--ink)" },
  line: {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: `calc(var(--weight) + var(--boost, 0px))`,
    strokeLinejoin: "round",
    strokeLinecap: "round",
  },
  lifeline: {
    fill: "none",
    stroke: "var(--ink)",
    strokeWidth: stroke.hairline,
    strokeDasharray: dash.dotted,
  },
  hit: {
    fill: "none",
    stroke: "transparent",
    strokeWidth: 14,
  },
  head: { fill: "currentColor" },
  openHead: {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: `calc(var(--weight) + var(--boost, 0px))`,
    strokeLinejoin: "round",
    strokeLinecap: "round",
  },
  enclosure: {
    fill: "transparent",
    stroke: "var(--ink)",
    strokeWidth: `calc(var(--weight) + var(--boost, 0px))`,
    strokeDasharray: dash.dashed,
  },
  tab: {
    fill: `var(--figure-bg, ${theme.surface})`,
    stroke: "var(--ink)",
    strokeWidth: `calc(var(--weight) + var(--boost, 0px))`,
  },
  frame: {
    fill: "none",
    stroke: theme.borderControl,
    strokeWidth: stroke.hairline,
  },
  frameTab: {
    fill: theme.surfaceRaised,
    stroke: theme.borderControl,
    strokeWidth: stroke.hairline,
  },
  badge: {
    fill: theme.warning,
    stroke: `var(--figure-bg, ${theme.surface})`,
    strokeWidth: 2,
  },
  badgeMark: {
    fill: "none",
    stroke: theme.canvas,
    strokeWidth: 1.8,
    strokeLinecap: "round",
  },
  flag: {
    fill: "none",
    stroke: theme.warning,
    strokeWidth: stroke.hairline,
    strokeDasharray: dash.dotted,
  },
  debug: {
    color: theme.error,
    fill: "currentColor",
    stroke: "currentColor",
    strokeWidth: 0.75,
    pointerEvents: "none",
  },
  debugText: {
    fontFamily: theme.mono,
    fontSize: "9px",
    stroke: "none",
  },
  diagnostics: {
    marginTop: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: theme.border,
    backgroundColor: theme.canvas,
  },
  summary: {
    paddingBlock: space.sm,
    paddingInline: space.md,
    color: theme.warning,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    cursor: "pointer",
  },
  summaryError: { color: theme.error },
  list: {
    display: "grid",
    gap: space.xs,
    margin: 0,
    paddingBlock: `0 ${space.md}`,
    paddingInline: space.md,
    listStyle: "none",
  },
  item: {
    color: theme.textBody,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.normal,
  },
  itemError: { color: theme.error },
  code: {
    color: theme.warning,
    fontFamily: theme.mono,
    fontSize: fontSize.xs,
  },
});
