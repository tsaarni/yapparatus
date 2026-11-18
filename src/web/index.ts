/** The published `yapparatus` entry: the types and components a project's own code uses. */

export type { ChartSpec, PlotFunction, Row } from "../chart/spec.ts";
export type { ChartColumn, ChartData, ColumnType } from "../chart/table.ts";
export type { DiagramBuilder } from "../diagram/builder.ts";
export type { CompiledDiagram } from "../diagram/drawing.ts";
export type {
  Align,
  AnchorName,
  Corner,
  Diagnostic,
  EdgeOptions,
  EncloseOptions,
  LabelOptions,
  NodeOptions,
  PlaceOptions,
  Role,
  Route,
  Side,
  TerminalOptions,
} from "../diagram/elements.ts";
export type {
  SequenceFragment,
  SequenceMessage,
  SequenceNote,
  SequenceOptions,
  SequenceStep,
} from "../diagram/sequence.ts";
export type { CodeMark, HighlightedCode, PageOutline } from "../document/page-module.ts";
export type { Reference, TargetKind } from "../document/reference.ts";
export type { DocumentSettings, NumberingSettings } from "../document/settings.ts";
export type { SourceFileView } from "../protocol/rest-api.ts";
export { Chart, type ChartProps } from "./chart/chart.tsx";
export { Excerpt, type ExcerptProps } from "./components/excerpt.tsx";
export { Figure, type FigureProps, Listing, Table } from "./components/figure.tsx";
export { Ref, type RefProps } from "./components/ref.tsx";
export { Icon, type IconProps } from "./controls/icon.tsx";
export {
  type CompiledDiagramProps,
  Diagram,
  type DiagramProps,
  Step,
  type StepProps,
} from "./diagram/diagram.tsx";
