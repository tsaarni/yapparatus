/** Figure pictures: the legend's entries wrap into rows as wide as the figure. */

import assert from "node:assert/strict";
import { test } from "node:test";
import { legend, legendLayout } from "../../../src/figure/picture.ts";

const measure = (text: string) => text.length * 10;

test("legend entries follow each other and wrap when the row is full", () => {
  const { places, height } = legendLayout(["ab", "cd", "ef"], 120, "sans", measure);
  const button = legend.padX * 2 + legend.swatch.width + legend.gap + 20;
  assert.equal(places[0]?.swatchX, legend.padX);
  assert.equal(places[1]?.swatchX, button + legend.gap + legend.padX);
  assert.equal(places[2]?.swatchX, legend.padX);
  assert.equal(
    places[2]?.middle,
    legend.marginTop + legend.height + legend.gap + legend.height / 2,
  );
  assert.equal(height, legend.marginTop + 2 * legend.height + legend.gap);
});

test("a figure without categories has no legend", () => {
  assert.equal(legendLayout([], 100, "sans", measure).height, 0);
});
