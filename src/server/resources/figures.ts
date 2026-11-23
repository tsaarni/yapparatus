/**
 * Pictures of figures: GET /-/api/figures/{page}/{figure} answers with a PNG of a diagram or chart
 * in the light theme, a diagram optionally with element ids, so an agent can look at what it drew.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import type { ViteDevServer } from "vite";
import { chartPictureOf, type DrawnChart } from "../../chart/picture.ts";
import { fontMeasure, textOutline } from "../../compiler/font-measure.ts";
import { compilePage } from "../../compiler/page.ts";
import { drawingFont } from "../../compiler/stages/charts.ts";
import { pageFigures } from "../../compiler/stages/diagrams.ts";
import { chartPaint, lightPaint } from "../../compiler/theme-values.ts";
import type { CompiledDiagram } from "../../diagram/drawing.ts";
import { pictureOf } from "../../diagram/picture.ts";
import { createLogger } from "../../protocol/log.ts";
import { pictureErrors } from "../prompt.ts";
import { HttpError, type Router } from "../router.ts";

const log = createLogger("figures");

/** Pixels per drawing unit: small text stays legible to a model. */
export const pictureScale = 2;

/** The fonts a picture's text is measured and outlined with. */
const pictureFonts = () => ({ measure: fontMeasure().measure, outline: textOutline });

/** An SVG picture as PNG, at `pictureScale` pixels per unit. */
function png(svg: string): Uint8Array {
  return new Resvg(svg, {
    fitTo: { mode: "zoom", value: pictureScale },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();
}

/** A diagram's picture as PNG. */
export function diagramPicture(drawing: CompiledDiagram, options: { ids: boolean }): Uint8Array {
  return png(pictureOf(drawing, options, pictureFonts(), lightPaint).svg);
}

/** A chart's picture as SVG, from the drawing the page compiler checked. */
export function chartPictureSvg(drawing: DrawnChart): string {
  return chartPictureOf(drawing, pictureFonts(), drawingFont(), chartPaint).svg;
}

/** A chart's picture as PNG. */
export function chartPicture(drawing: DrawnChart): Uint8Array {
  return png(chartPictureSvg(drawing));
}

/** Serves `/-/api/figures`, compiling a page first when its drawings are out of date. */
export class FiguresResource {
  private readonly root: string;
  private readonly content: string;
  private readonly server: ViteDevServer;

  constructor(options: { root: string; content: string; server: ViteDevServer }) {
    this.root = options.root;
    this.content = options.content;
    this.server = options.server;
  }

  mount(router: Router) {
    router.on("GET", "/figures/:rest*", async ({ params, query }) => {
      const segments = params.rest?.split("/") ?? [];
      const id = segments.pop() ?? "";
      const page = segments.join("/");
      const address = `/${page}#${id}`;
      if (!page || !id || segments.some((s) => !s || s === "." || s === ".."))
        throw new HttpError(400, pictureErrors.badPath());
      const ids = query.get("ids");
      if (ids !== null && ids !== "true" && ids !== "false")
        throw new HttpError(400, pictureErrors.badIds());
      const figures = await this.figuresOf(page);
      if (!figures) throw new HttpError(404, pictureErrors.noPage(page));
      const diagram = figures.diagrams.get(id);
      const chart = figures.charts.has(id);
      if (!diagram && !chart)
        throw new HttpError(
          404,
          pictureErrors.noFigure(address, [...figures.diagrams.keys(), ...figures.charts.keys()]),
        );
      if (!diagram && ids !== null) throw new HttpError(400, pictureErrors.chartIds(address));
      const drawing = figures.charts.get(id);
      if (diagram ? !diagram.ok : !drawing?.svg)
        throw new HttpError(422, pictureErrors.notDrawn(address));
      const started = performance.now();
      const data = diagram
        ? diagramPicture(diagram, { ids: ids === "true" })
        : chartPicture(drawing as DrawnChart);
      log.debug(`${address}: ${Math.round(performance.now() - started)} ms`);
      return { status: 200, content: { type: "image/png", data } };
    });
  }

  /**
   * The figures of a page as its text is on disk now. A page edited since it was last compiled,
   * or never compiled, is compiled first.
   */
  private async figuresOf(page: string) {
    const source = `${this.content}/${page}.mdx`;
    const file = path.join(this.root, source);
    if (!existsSync(file)) return undefined;
    try {
      await compilePage(this.server, this.root, `/${source}`);
    } catch (error) {
      const message = error instanceof Error ? (error.message.split("\n")[0] ?? "") : "";
      throw new HttpError(422, pictureErrors.notCompiled(`/${page}`, message));
    }
    return pageFigures.get(file);
  }
}
