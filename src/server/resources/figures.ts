/**
 * Pictures of diagrams: GET /-/api/figures/{page}/{figure} answers with a PNG of the figure in
 * the light theme, optionally with element ids, so an agent can look at what it drew.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import type { ViteDevServer } from "vite";
import { fontMeasure, textOutline } from "../../compiler/font-measure.ts";
import { compilePage } from "../../compiler/page.ts";
import { pageFigures } from "../../compiler/stages/diagrams.ts";
import { lightPaint } from "../../compiler/theme-values.ts";
import type { CompiledDiagram } from "../../diagram/drawing.ts";
import { pictureOf } from "../../diagram/picture.ts";
import { createLogger } from "../../protocol/log.ts";
import { pictureErrors } from "../prompt.ts";
import { HttpError, type Router } from "../router.ts";

const log = createLogger("figures");

/** Pixels per drawing unit: small text stays legible to a model. */
export const pictureScale = 2;

/** A figure's picture as PNG, at `pictureScale` pixels per unit. */
export function renderPicture(drawing: CompiledDiagram, options: { ids: boolean }): Uint8Array {
  const fonts = { measure: fontMeasure().measure, outline: textOutline };
  const { svg } = pictureOf(drawing, options, fonts, lightPaint);
  return new Resvg(svg, {
    fitTo: { mode: "zoom", value: pictureScale },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();
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
      const figure = figures.diagrams.get(id);
      if (!figure) {
        if (figures.charts.has(id)) throw new HttpError(404, pictureErrors.chart(address));
        throw new HttpError(404, pictureErrors.noDiagram(address, [...figures.diagrams.keys()]));
      }
      if (!figure.ok) throw new HttpError(422, pictureErrors.notDrawn(address));
      const started = performance.now();
      const data = renderPicture(figure, { ids: ids === "true" });
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
