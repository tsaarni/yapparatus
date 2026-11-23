/** Figure categories: colors in the order of first use, and the message for too many. */

import assert from "node:assert/strict";
import { test } from "node:test";
import { firstUseOrder, tooManyCategories } from "../../../src/figure/categories.ts";

test("categories take colors in the order a figure first uses them", () => {
  const uses = ["Search", "Checkout", "Search"];
  assert.deepEqual(firstUseOrder(["Checkout", "Other", "Search"], uses), [
    "Search",
    "Checkout",
    "Other",
  ]);
});

test("too many categories names the first eight and says what to do", () => {
  const names = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
  const message = tooManyCategories(names, "Merge categories.");
  assert.match(message, /9 categories: "a", .*"h", …\. It has 4 category colors/);
  assert.match(message, /Merge categories\.$/);
});
