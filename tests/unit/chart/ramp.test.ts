/** The ramp of amounts: literal colors mixed in OKLab between the two ends. */

import assert from "node:assert/strict";
import { test } from "node:test";
import { oklabRamp } from "../../../src/chart/ramp.ts";

test("a ramp starts and ends at its colors and mixes in OKLab between them", () => {
  const ramp = oklabRamp("#ccd3f7", "#3d4fd6");
  assert.equal(ramp(0), "#ccd3f7");
  assert.equal(ramp(1), "#3d4fd6");
  assert.equal(ramp(-1), "#ccd3f7");
  assert.equal(ramp(2), "#3d4fd6");
  assert.match(ramp(0.5), /^#[0-9a-f]{6}$/);
  const gray = oklabRamp("#000000", "#ffffff")(0.5);
  assert.equal(gray, "#636363");
});
