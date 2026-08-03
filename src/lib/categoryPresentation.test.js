import assert from "node:assert/strict";
import test from "node:test";
import { CATEGORY_CLASS_NAMES, EXPANDED_CATEGORY_NAMES, getCategoryClassName } from "./categoryPresentation.js";

test("assigns every expanded category a unique presentation class", () => {
  const classes = EXPANDED_CATEGORY_NAMES.map((category) => getCategoryClassName(category));
  assert.equal(new Set(classes).size, EXPANDED_CATEGORY_NAMES.length);
});

test("preserves original category presentation classes", () => {
  assert.equal(CATEGORY_CLASS_NAMES.Food, "food");
  assert.equal(CATEGORY_CLASS_NAMES["Coffee/Bar"], "coffee");
  assert.equal(CATEGORY_CLASS_NAMES.Culture, "culture");
  assert.equal(CATEGORY_CLASS_NAMES.Transit, "transit");
  assert.equal(CATEGORY_CLASS_NAMES.Hotel, "hotel");
  assert.equal(CATEGORY_CLASS_NAMES.Shopping, "shopping");
  assert.equal(CATEGORY_CLASS_NAMES["Open Time"], "open");
});
