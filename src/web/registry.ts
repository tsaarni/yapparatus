/** The components MDX pages and chat replies use without imports. */

import type { pageComponents } from "../document/page-module.ts";
import { Chart } from "./chart/chart.tsx";
import { Columns, Panel, Tabs } from "./components/alternatives.tsx";
import { Excerpt } from "./components/excerpt.tsx";
import { Figure, Listing, Table } from "./components/figure.tsx";
import { FileTree } from "./components/file-tree.tsx";
import { Ref } from "./components/ref.tsx";
import { Icon } from "./controls/icon.tsx";
import { Diagram, Step } from "./diagram/diagram.tsx";
import { prose } from "./prose/elements.tsx";

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
