import { Chart } from "../chart/Chart.tsx";
import { Diagram, Step } from "../diagram/Diagram.tsx";
import type { pageComponents } from "../document.ts";
import { Columns, Panel, Tabs } from "./alternatives.tsx";
import { Excerpt, Figure, FileTree, Listing, Ref, Table } from "./components.tsx";
import { Icon } from "./icons.tsx";
import { prose } from "./prose.tsx";

/**
 * Components available in MDX pages and chat replies without imports. The server checks
 * replies against `pageComponents`; `satisfies` keeps every name in that list here.
 */
export const components = {
  ...prose,
  Figure,
  Chart,
  Diagram,
  Step,
  Icon,
  Ref,
  Table,
  Listing,
  FileTree,
  Excerpt,
  Tabs,
  Columns,
  Panel,
} satisfies Record<(typeof pageComponents)[number], unknown>;
