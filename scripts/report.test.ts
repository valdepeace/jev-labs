import assert from "node:assert/strict";
import test from "node:test";
import { renderReport } from "./report.js";

test("renderReport compares matching question ids and escapes model names", () => {
  const row = { questionId: "one", source: "test", textLength: 1, latencyMs: 4, modelChoice: "a<b", reasoningEffort: "low" };
  const html = renderReport([row], [{ ...row, latencyMs: 8 }]);
  assert.match(html, /Coincidencia modelo/);
  assert.match(html, /a&lt;b/);
});
