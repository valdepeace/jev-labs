import assert from "node:assert/strict";
import test from "node:test";
import { modelChart, renderReport, renderRouterReport } from "./report.js";

test("renderReport compares matching question ids and escapes model names", () => {
  const row = { questionId: "one", source: "test", textLength: 1, latencyMs: 4, modelChoice: "a<b", reasoningEffort: "low" };
  const html = renderReport([row], [{ ...row, latencyMs: 8 }]);
  assert.match(html, /Coincidencia modelo/);
  assert.match(html, /a&lt;b/);
});

test("modelChart draws one bar per classifier for every distinct model chosen", () => {
  const base = { source: "t", textLength: 1, latencyMs: 1, reasoningEffort: "low" };
  const svg = modelChart(
    [{ ...base, questionId: "a", modelChoice: "prov/a" }],
    [{ ...base, questionId: "a", modelChoice: "prov/b" }],
  );
  assert.equal((svg.match(/<rect/g) ?? []).length, 4); // 2 legend swatches + 1 bar for prov/a (Jev) + 1 bar for prov/b (Laya)
  assert.match(svg, /prov\/a/);
  assert.match(svg, /prov\/b/);
});

test("modelChart does not divide by zero when both inputs are empty", () => {
  assert.doesNotThrow(() => modelChart([], []));
});

test("renderRouterReport contains no baseline classifier", () => {
  const html = renderRouterReport([{ questionId: "one", source: "test", textLength: 1, latencyMs: 4, modelChoice: "provider/model", reasoningEffort: "low" }]);
  assert.match(html, /Jev Router/);
  assert.match(html, /provider\/model/);
  assert.doesNotMatch(html, /Jev vs Laya/);
});
