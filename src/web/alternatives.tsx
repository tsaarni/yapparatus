import * as stylex from "@stylexjs/stylex";
import {
  type CSSProperties,
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Flow, InFigureContext } from "./prose.tsx";
import {
  duration,
  fontSize,
  fontWeight,
  letterSpacing,
  radius,
  sizes,
  space,
  theme,
  when,
} from "./theme.stylex.ts";
import { styled, ui } from "./ui.tsx";

interface PanelProps {
  /** The panel's name, shown on its tab or above its column. */
  label: string;
  children: ReactNode;
}

interface ContainerProps {
  /** The panels' labels, in order. The compiler reads them from the panels; authors never write this. */
  labels?: string[];
  children: ReactNode;
}

/** What a panel needs from its container to render itself. */
type Container =
  | {
      kind: "tabs";
      labels: string[];
      selected: string | undefined;
      baseId: string;
      reveal: (label: string) => void;
    }
  | { kind: "columns"; labels: string[] };

const ContainerContext = createContext<Container | undefined>(undefined);

/**
 * A labelled piece of content. Its container decides how it shows: `Tabs` shows one panel at
 * a time, `Columns` shows them side by side.
 */
export function Panel({ label, children }: PanelProps) {
  const container = useContext(ContainerContext);
  const index = container?.labels.indexOf(label) ?? -1;
  if (container?.kind === "tabs")
    return (
      <TabPanel
        label={label}
        id={`${container.baseId}-panel-${index}`}
        labelledBy={`${container.baseId}-tab-${index}`}
        active={label === container.selected}
        onFound={() => container.reveal(label)}
      >
        {children}
      </TabPanel>
    );
  if (container?.kind === "columns")
    return (
      <section aria-label={label} {...stylex.props(s.column, index > 0 && s.columnAfter)}>
        <div aria-hidden="true" {...stylex.props(s.columnLabel)}>
          {label}
        </div>
        <Flow fill>{children}</Flow>
      </section>
    );
  // Outside a container, which the compiler reports.
  return <>{children}</>;
}

// The reader's choices, most recent first. Choosing "pnpm" in one tab set selects "pnpm" in
// every set that has it, on every page, and the choice is kept for the next visit.
const storageKey = "yapparatus.tabs";
const listeners = new Set<() => void>();
let choices: string[] = readChoices();

function readChoices(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function choose(label: string) {
  choices = [label, ...choices.filter((c) => c !== label)].slice(0, 20);
  try {
    localStorage.setItem(storageKey, JSON.stringify(choices));
  } catch {
    // Storage may be unavailable; the choice still holds for this visit.
  }
  for (const listener of listeners) listener();
}

function useChoices() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => choices,
    () => choices,
  );
}

/**
 * Alternatives the reader picks one of, such as package managers or operating systems.
 * The choice follows the label to every other set that has it.
 */
export function Tabs({ labels = [], children }: ContainerProps) {
  const chosen = useChoices();
  // Find in page can reveal a hidden panel. That shows it in this set only, without changing
  // the reader's choice, until the reader chooses again.
  const [found, setFound] = useState<{ label: string; over: string[] }>();
  const selected =
    found?.over === chosen
      ? found.label
      : (chosen.find((label) => labels.includes(label)) ?? labels[0]);
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const last = labels.length - 1;
    const next =
      event.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    const label = labels[next];
    if (label) choose(label);
    tabRefs.current[next]?.focus();
  };

  return (
    <div {...styled("tabs", s.tabs)}>
      <div role="tablist" {...stylex.props(s.tablist)}>
        {labels.map((label, index) => {
          const active = label === selected;
          return (
            <button
              key={label}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${index}`}
              aria-selected={active}
              aria-controls={`${baseId}-panel-${index}`}
              tabIndex={active ? 0 : -1}
              onClick={() => choose(label)}
              onKeyDown={(event) => onKeyDown(event, index)}
              {...stylex.props(s.tab, active && s.tabActive, ui.focus)}
            >
              {label}
            </button>
          );
        })}
      </div>
      <ContainerContext.Provider
        value={{
          kind: "tabs",
          labels,
          selected,
          baseId,
          reveal: (label) => setFound({ label, over: chosen }),
        }}
      >
        {children}
      </ContainerContext.Provider>
    </div>
  );
}
Tabs.breakout = true;

function TabPanel({
  label,
  id,
  labelledBy,
  active,
  onFound,
  children,
}: {
  label: string;
  id: string;
  labelledBy: string;
  active: boolean;
  onFound: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const found = useRef(onFound);
  found.current = onFound;
  // A hidden panel stays searchable: find in page reveals it. React renders `hidden`, so no
  // panel shows for a frame; before paint, it becomes `until-found`, which React has no value for.
  useLayoutEffect(() => {
    if (!active) ref.current?.setAttribute("hidden", "until-found");
  }, [active]);
  useLayoutEffect(() => {
    const panel = ref.current;
    const reveal = () => found.current();
    panel?.addEventListener("beforematch", reveal);
    return () => panel?.removeEventListener("beforematch", reveal);
  }, []);
  return (
    <div
      ref={ref}
      role="tabpanel"
      id={id}
      aria-labelledby={labelledBy}
      hidden={!active}
      {...stylex.props(s.panel)}
    >
      {/* Paper has no tabs: print shows every panel under its label. */}
      <div aria-hidden="true" {...stylex.props(s.columnLabel, s.printLabel)}>
        {label}
      </div>
      <Flow>{children}</Flow>
    </div>
  );
}

/**
 * Panels side by side, for the reader to see together: an old and a new design, a client and
 * its server. On a narrow page they stack. Inside a `Figure`, the figure numbers and frames them.
 */
export function Columns({ labels = [], children }: ContainerProps) {
  const inFigure = useContext(InFigureContext);
  return (
    <div
      {...styled("columns", s.columns, !inFigure && s.columnsAlone)}
      style={{ "--columns": labels.length } as CSSProperties}
    >
      <ContainerContext.Provider value={{ kind: "columns", labels }}>
        {children}
      </ContainerContext.Provider>
    </div>
  );
}
Columns.breakout = true;

const s = stylex.create({
  /** Spans the wide track so code can grow into it; the tabs and prose keep the text column. */
  tabs: {
    minWidth: 0,
    marginTop: space.sm,
    breakInside: "avoid",
  },
  tablist: {
    gap: space.xxs,
    maxWidth: sizes.textWidth,
    minHeight: sizes.control,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: theme.border,
    overflowX: "auto",
    display: { default: "flex", [when.print]: "none" },
  },
  panel: {
    display: { default: null, [when.print]: "block" },
    contentVisibility: { default: null, [when.print]: "visible" },
  },
  printLabel: {
    display: { default: "none", [when.print]: "block" },
    paddingTop: space.md,
  },
  tab: {
    position: "relative",
    paddingBlock: space.xs,
    paddingInline: space.sm,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: { default: theme.textMuted, ":hover": theme.text },
    fontFamily: theme.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    whiteSpace: "nowrap",
    cursor: "pointer",
    transitionProperty: "color",
    transitionDuration: duration.fast,
    // The selected tab's underline sits on the strip's bottom border.
    "::after": {
      content: '""',
      position: "absolute",
      insetInline: space.sm,
      bottom: -1,
      height: 2,
      borderRadius: radius.full,
      backgroundColor: "transparent",
    },
  },
  tabActive: {
    color: theme.text,
    "::after": {
      backgroundColor: theme.accent,
    },
  },
  columns: {
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(var(--columns, 2), minmax(0, 1fr))",
      [when.narrow]: "minmax(0, 1fr)",
    },
    columnGap: space.xl,
    rowGap: space.xl,
    textAlign: "start",
  },
  columnsAlone: {
    marginBlock: space.xl,
    breakInside: "avoid",
  },
  column: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  // A rule between columns; stacked, between rows.
  columnAfter: {
    paddingLeft: { default: space.xl, [when.narrow]: 0 },
    paddingTop: { default: 0, [when.narrow]: space.xl },
    borderLeftWidth: { default: 1, [when.narrow]: 0 },
    borderTopWidth: { default: 0, [when.narrow]: 1 },
    borderLeftStyle: "solid",
    borderTopStyle: "solid",
    borderLeftColor: theme.border,
    borderTopColor: theme.border,
  },
  columnLabel: {
    margin: 0,
    color: theme.textMuted,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.caps,
    textTransform: "uppercase",
  },
});
