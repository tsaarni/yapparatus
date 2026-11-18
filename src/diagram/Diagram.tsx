/**
 * The `<Diagram>` component: draws the drawing the page compiler made from `draw`, and runs
 * its steps.
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
  useState,
} from "react";
import { partSeparator } from "../document.ts";
import { FigureFrame } from "../reader/components.tsx";
import { AppIcon } from "../reader/icons.tsx";
import { useScopedId } from "../reader/prose.tsx";
import { useRoute } from "../reader/router.ts";
import { fontSize, lineHeight, sizes, space, theme, when } from "../reader/theme.stylex.ts";
import { Button, styled } from "../reader/ui.tsx";
import {
  type CompiledDiagram,
  expand,
  type PartState,
  partState,
  type StepView,
  stepOnlyParts,
} from "./compiled.ts";
import { Diagnostics } from "./Diagnostics.tsx";
import { DiagramView } from "./DiagramView.tsx";
import { Legend } from "./Legend.tsx";
import type { DiagramBuilder } from "./scene.ts";

/**
 * What an author writes: `<Diagram>` in a page or a reply, not in a document's own components.
 * The page compiler runs `draw` and passes the component the drawing instead.
 */
export interface DiagramProps {
  /**
   * Builds the scene: create elements, arrange them, connect them. It uses only `d` and the
   * values it defines itself.
   */
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

/** What the component receives: the page compiler replaced `draw` with the drawing. */
export interface CompiledDiagramProps extends Omit<DiagramProps, "draw"> {
  /** The compiled drawing, with its diagnostics. */
  drawing: CompiledDiagram;
}

export interface StepProps {
  /**
   * An address for the step: `/page#figure--id`. Unique among the figure's parts and steps.
   * Plain text: the page compiler checks it.
   */
  id?: string;
  /**
   * Ids of the parts this step is about, separated by spaces. A container (an enclosure,
   * row, column, sequence, or fragment) stands for everything in it. Plain text: the page
   * compiler checks it.
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

export function Diagram({
  drawing,
  id,
  caption,
  description,
  build,
  children,
  debug,
}: CompiledDiagramProps) {
  const marker = useId();
  const figure = useScopedId(id);
  if (!drawing)
    throw new Error(
      "<Diagram> has no drawing. The page compiler compiles a <Diagram> written in a page or a reply, not one inside a component.",
    );
  // While editing, keep showing the last valid drawing above the errors.
  const key = id ?? caption;
  if (drawing.ok && key) lastValid.set(key, drawing);
  const fallback = dev && !drawing.ok && key ? lastValid.get(key) : undefined;
  const shown = fallback ?? drawing;

  const steps = collectSteps(children).map((step) => ({
    ...step,
    parts: expand(step.focus, shown.groups),
  }));
  const stepsOf = (part: string) => steps.flatMap((step, i) => (step.parts.has(part) ? [i] : []));
  const [active, setActive] = useState<number | undefined>(undefined);
  // Parts a legend entry highlights while the reader points at it or focuses it.
  const [preview, setPreview] = useState<string[]>();
  const view: StepView = {
    steps: steps.map((step) => step.parts),
    active,
    build: build ?? false,
    stepOnly: stepOnlyParts(shown),
    ...(preview ? { preview } : {}),
  };
  const stateOf = (part: string): PartState => partState(part, view);

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

  const diagnostics = drawing.diagnostics;

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
      {shown.legend.length > 0 && <Legend legend={shown.legend} preview={setPreview} />}
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

/* ---------- steps ---------- */

function collectSteps(children: ReactNode): Omit<StepItem, "parts">[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<StepProps>(child)) return [];
    if (!(child.type as { diagramStep?: boolean }).diagramStep) return [];
    return [
      {
        ...(child.props.id ? { id: child.props.id } : {}),
        focus: (child.props.focus ?? "").split(/\s+/).filter(Boolean),
        content: child.props.children,
      },
    ];
  });
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
