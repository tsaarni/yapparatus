/**
 * The `<Diagram>` component: compiles the draw program, runs its steps, and reports problems.
 */
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
import type { DiagnosticCode } from "../protocol.ts";
import { FigureFrame } from "../reader/components.tsx";
import { useDiagramReport } from "../reader/diagnostics.tsx";
import { AppIcon } from "../reader/icons.tsx";
import { useScopedId } from "../reader/prose.tsx";
import { useRoute } from "../reader/router.ts";
import { fontSize, lineHeight, sizes, space, theme, when } from "../reader/theme.stylex.ts";
import { Button, styled } from "../reader/ui.tsx";
import { compile } from "./compile.ts";
import type { CompiledDiagram } from "./compiled.ts";
import { Diagnostics } from "./Diagnostics.tsx";
import { DiagramView, minScale } from "./DiagramView.tsx";
import { canvasMeasure, useFontsReady } from "./fonts.ts";
import { overlap } from "./geometry.ts";
import { Legend } from "./Legend.tsx";
import type { PartState } from "./part.tsx";
import { type Diagnostic, DiagramBuilder } from "./scene.ts";

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

const dev = import.meta.env.DEV;

const lastValid = new Map<string, CompiledDiagram>();

/** Inner width of a figure in the wide track: text column plus breakout. */
const readingWidth = 960;

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
      message: `The drawing is ${natural} units wide. The widest figure area fits ${readingWidth} at full size and ${Math.floor(readingWidth / minScale)} when shrunk, so readers must scroll sideways. Stack rows into columns or shorten labels.`,
      ids: [],
    });
  if (result?.ok) diagnostics.push(...checkSteps(steps, result, build ?? false));
  useDiagramReport(
    marker,
    key ?? marker,
    result &&
      diagnostics.map((d) => ({
        code: d.code,
        message: d.message,
        ...(d.subject ? { subject: d.subject } : {}),
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
          code: "DRAW_FAILED",
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
  const diagnostic = (
    code: DiagnosticCode,
    message: string,
    ids: string[] = [],
    subject?: string,
  ): Diagnostic => ({ code, message, ids, ...(subject ? { subject } : {}) });
  const diagnostics: Diagnostic[] = steps.flatMap((step, i) =>
    step.focus
      .filter((part) => !known.has(part))
      .map((part) =>
        diagnostic(
          "UNKNOWN_PART",
          `Step ${i + 1} focuses "${part}", which is not a part of this diagram. Parts: ${parts.join(", ")}.`,
          [],
          part,
        ),
      ),
  );
  const ids = new Set<string>();
  for (const step of steps) {
    if (!step.id) continue;
    if (known.has(step.id) || ids.has(step.id))
      diagnostics.push(
        diagnostic(
          "DUPLICATE_ID",
          `Step id "${step.id}" is already used in this figure.`,
          [],
          step.id,
        ),
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

/* ---------- rendering ---------- */

const styles = stylex.create({
  pending: { minHeight: 120 },
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
});
