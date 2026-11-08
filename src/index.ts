export { Chart, type ChartProps } from "./chart/Chart.tsx";
export type { ChartColumn, ChartData, ColumnType } from "./chart/data.ts";
export type { ChartSpec, PlotFunction, Row } from "./chart/plot.ts";
export { Diagram, type DiagramProps, Step, type StepProps } from "./diagram/Diagram.tsx";
export type {
  Align,
  AnchorName,
  Corner,
  Diagnostic,
  DiagramBuilder,
  EdgeOptions,
  EncloseOptions,
  LabelOptions,
  NodeOptions,
  PlaceOptions,
  Role,
  Route,
  Side,
  TerminalOptions,
} from "./diagram/scene.ts";
export type {
  SequenceFragment,
  SequenceMessage,
  SequenceNote,
  SequenceOptions,
  SequenceStep,
} from "./diagram/sequence.ts";
export type { DocumentSettings, NumberingSettings, PageOutline } from "./document.ts";
export type { ContextItem, SourceFileView, TargetKind } from "./protocol.ts";
export {
  Excerpt,
  type ExcerptProps,
  Figure,
  type FigureProps,
  Listing,
  Ref,
  type RefProps,
  Table,
} from "./reader/components.tsx";

export { Icon, type IconProps } from "./reader/icons.tsx";
