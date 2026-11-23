/** The `<Diagram>` component: draws the compiled drawing and runs its steps. */

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
import type { DiagramBuilder } from "../../diagram/builder.ts";
import {
  type CompiledDiagram,
  type ElementState,
  edgeEnds,
  elementState,
  type StepView,
  stepFocus,
  stepOnlyElements,
} from "../../diagram/drawing.ts";
import { elementSeparator } from "../../document/address.ts";
import { useRoute } from "../addressing/router.ts";
import { FigureFrame } from "../components/figure.tsx";
import { Diagnostics } from "../components/figure-diagnostics.tsx";
import { useScopedId } from "../prose/contexts.ts";
import { DiagramView } from "./diagram-view.tsx";
import { Legend } from "./legend.tsx";
import { StepControls, type StepItem } from "./step-controls.tsx";

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
  /** Hide each element until the first step that focuses it. Needs `<Step>` children. */
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

/** What an author writes on a diagram step. */
export interface StepProps {
  /**
   * An address for the step: `/page#figure--id`. Unique among the figure's elements and steps.
   * Plain text: the page compiler checks it.
   */
  id?: string;
  /**
   * Ids of the elements this step is about, separated by spaces, in plain text the page compiler
   * checks. A container, such as an enclosure, row, or sequence, stands for everything in it.
   */
  focus?: string;
  /** One or two sentences. */
  children?: ReactNode;
}

/** One step of a diagram's explanation. It is drawn by its `<Diagram>`, never by itself. */
export function Step(_props: StepProps) {
  return null;
}
Step.diagramStep = true;

const dev = import.meta.env.DEV;

const lastValid = new Map<string, CompiledDiagram>();

/**
 * A compiled diagram in a figure, with its steps, legend, and in development its diagnostics.
 * The step a link names opens, and while editing a broken diagram shows its last valid drawing.
 */
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
  const key = id ?? caption;
  if (drawing.ok && key) lastValid.set(key, drawing);
  const fallback = dev && !drawing.ok && key ? lastValid.get(key) : undefined;
  const shown = fallback ?? drawing;

  const steps = collectSteps(children).map((step) => ({
    ...step,
    ...stepFocus(step.focus, shown),
  }));
  const stepsOf = (element: string) =>
    steps.flatMap((step, i) => (step.elements.has(element) ? [i] : []));
  const [active, setActive] = useState<number | undefined>(undefined);
  const [preview, setPreview] = useState<string[]>();
  const view: StepView = {
    steps,
    active,
    build: build ?? false,
    stepOnly: stepOnlyElements(shown),
    ends: edgeEnds(shown),
    ...(preview ? { preview } : {}),
  };
  const stateOf = (element: string): ElementState => elementState(element, view);

  const route = useRoute();
  const prefix = `${figure}${elementSeparator}`;
  const fragment =
    figure && route.fragment.startsWith(prefix) ? route.fragment.slice(prefix.length) : "";
  const byId = steps.findIndex((step) => step.id === fragment);
  const linked = !fragment ? undefined : byId >= 0 ? byId : stepsOf(fragment)[0];
  useEffect(() => {
    if (!route || linked === undefined) return;
    setActive(linked);
    if (byId >= 0 && figure) document.getElementById(figure)?.scrollIntoView({ block: "center" });
  }, [route, linked, byId, figure]);

  useEffect(() => {
    if (active !== undefined) revealFocused(marker);
  }, [active, marker]);

  const diagnostics = drawing.diagnostics;

  const label = caption ?? "Diagram";
  const elementOf = (target: EventTarget) =>
    target instanceof Element
      ? target.closest<SVGElement>("[data-element-id]")?.dataset.elementId
      : undefined;
  const openElement = (element: string | undefined) => {
    const about = element === undefined ? [] : stepsOf(element);
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
    else if (event.key === "Enter" || event.key === " ")
      return openElement(elementOf(event.target));
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
        stepped={(element) => stepsOf(element).length > 0}
        {...(steps.length
          ? { onClick: (event: MouseEvent) => openElement(elementOf(event.target)), onKeyDown }
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

/** The `<Step>` children's ids, focused element ids, and content, in order. */
function collectSteps(children: ReactNode): StepItem[] {
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

/** Scroll a sideways-scrolling figure so its focused elements are visible. */
function revealFocused(marker: string) {
  const svg = document.querySelector(`svg[data-figure="${CSS.escape(marker)}"]`);
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
