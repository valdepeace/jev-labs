import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { barChart, escapeHtml, lineChart } from "./charts.js";
import { poolMultiple, renderCacheAffinityReport } from "./report.js";
import { buildSimulation, type SimulationArtifact } from "./scenarios.js";

const artifact = JSON.parse(await readFile("pocs/cache-affinity/results/simulation.jsonl", "utf8")) as SimulationArtifact;

test("the committed artifact matches what the simulator produces today", () => {
  assert.deepEqual(artifact, buildSimulation(), "results/simulation.jsonl is stale: run `npm run cache-affinity`");
});

test("the report states the headline the simulation supports", () => {
  const html = renderCacheAffinityReport(artifact);
  assert.match(html, /Afinidad de caché en el router de modelos/);
  assert.match(html, new RegExp(`${poolMultiple(artifact).toFixed(2)}×`));
  assert.match(html, /por modelo/);
  assert.match(html, /<table>/);
  assert.match(html, /<svg/);
  assert.match(html, /npm run cache-affinity/);
});

test("every scenario appears in the table and in the cumulative chart", () => {
  const html = renderCacheAffinityReport(artifact);
  for (const scenario of artifact.scenarios) {
    assert.ok(html.includes(scenario.name), `${scenario.name} missing from the report`);
    assert.ok(html.includes(scenario.description), `${scenario.name} description missing`);
  }
  assert.equal((html.match(/<polyline/g) ?? []).length, artifact.scenarios.length, "one line per scenario");
});

test("the report says 'nunca' rather than printing Infinity", () => {
  const html = renderCacheAffinityReport(artifact);
  assert.doesNotMatch(html, /Infinity/);
  assert.doesNotMatch(html, /NaN/);
  assert.match(html, /nunca/);
});

test("a pool that cannot be revisited inside the ttl reports zero cache reads", () => {
  const saturated = artifact.pools.filter((row) => row.cacheReadTokens === 0).map((row) => row.poolSize);
  assert.ok(saturated.length > 0, "the saturation plateau is the finding; it must be present");
  // La entrada caduca a los `ttl` turnos, asi que el acantilado empieza justo
  // cuando el pool alcanza la ventana: un pool de tamano `ttl` ya no revisita.
  assert.equal(saturated[0], artifact.defaultTtlTurns, `saturation should start at the ttl window, got ${saturated[0]}`);
});

test("chart primitives escape their labels and survive empty input", () => {
  assert.equal(escapeHtml("<img src=x>"), "&lt;img src=x&gt;");
  assert.match(barChart([{ label: "<b>", value: 1, display: "1" }], "aria"), /&lt;b&gt;/);
  assert.doesNotMatch(barChart([], "aria"), /<rect/);
  assert.doesNotThrow(() => lineChart({ series: [], xLabels: [], ariaLabel: "x" }));
});
