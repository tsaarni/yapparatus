import assert from "node:assert/strict";
import { test } from "node:test";
import { quoteOf, splitAddress, textFragment } from "../../../src/document/address.ts";

test("addresses carry selected words as a text fragment", () => {
  const address = `/page#first${textFragment("one two three four five six seven eight nine")}`;
  assert.deepEqual(splitAddress(address), {
    page: "page",
    anchor: "first",
    text: { start: "one two three four", end: "six seven eight nine" },
  });
  assert.equal(quoteOf(address), "one two three four … six seven eight nine");
  assert.equal(quoteOf("/page#:~:text=a%2Db%2C%20c"), "a-b, c");
  assert.equal(quoteOf("/page#first"), undefined);
});
