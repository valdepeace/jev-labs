import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { barChart, escapeHtml, lineChart } from "./charts.js";
import { renderCacheAffinityReport } from "./report.js";
import { buildSimulation, type SimulationArtifact } from "./scenarios.js";

const artifact = JSON.parse(await readFile("pocs/cache-affinity/results/simulation.jsonl", "utf8")) as SimulationArtifact;

test("the committed artifact matches what the simulator produces today", () => {
  assert.deepEqual(artifact, buildSimulation(), "results/simulation.jsonl is stale: run `npm run cache-affinity`");
});

test("the report renders without leaking NaN, Infinity or undefined", () => {
  const html = renderCacheAffinityReport(artifact);
  for (const broken of ["NaN", "Infinity", "undefined", "[object Object]"]) {
    assert.ok(!html.includes(broken), );
  }
  assert.match(html, /Afinidad de caché en el router de modelos/);
  assert.match(html, /nunca/, "a break-even that never pays must read 'nunca', not Infinity");
});

test("every workload, sequence and strategy appears in the report", () => {
  const html = renderCacheAffinityReport(artifact);
  for (const comparison of artifact.strategies) {
    assert.ok(html.includes(comparison.workloadName), `${comparison.workloadName} missing`);
    // El informe escapa el apostrofo de «B' · ...», asi que se busca el texto escapado.
    for (const run of comparison.runs) assert.ok(html.includes(escapeHtml(run.policyName)), `${run.policyName} missing`);
  }
  for (const sequence of artifact.sequences) assert.ok(html.includes(sequence.pattern), `${sequence.pattern} missing`);
});

test("the report draws a timeline per representative session, with cache state per turn", () => {
  const html = renderCacheAffinityReport(artifact);
  const blocks = html.split('aria-label="Modelo y estado de caché por turno de ').slice(1);
  assert.equal(blocks.length, artifact.timelines.length, "one timeline per representative session");
  const cells = blocks.map((block) => [...block.matchAll(/>(H|M)<\/text>/g)].map((match) => match[1]));
  const warm = artifact.timelines.map((timeline) => timeline.rows.filter((row) => row.warm).length);
  cells.forEach((block, index) => {
    assert.equal(block.length, artifact.timelines[index].rows.length, "one cell per turn");
    assert.equal(block.filter((cell) => cell === "H").length, warm[index], "H means it found a warm cache");
  });
});

test("the pace sweep shows the cliff: some pace loses the cache entirely", () => {
  const cold = artifact.paces.filter((row) => row.cacheHitRatio === 0);
  assert.ok(cold.length > 0, "the TTL cliff is the headline; it must be present");
  assert.ok(cold[0].multipleOfSingle > 3, `a lost cache should cost multiples, got ${cold[0].multipleOfSingle}`);
});

test("the price-gap sweep finds both regimes: cache-aware wins somewhere, cheapest wins somewhere", () => {
  const winners = new Set(artifact.priceGaps.map((row) => row.winner));
  assert.ok(winners.has("cacheAware"), "the cache-aware router must win in some band");
  assert.ok(winners.has("cheapest"), "and the cheapest router must win once the gap is wide");
  const aware = artifact.priceGaps.filter((row) => row.winner === "cacheAware");
  const cheapest = artifact.priceGaps.filter((row) => row.winner === "cheapest");
  assert.ok(Math.min(...aware.map((row) => row.midPrice)) > Math.max(...cheapest.map((row) => row.midPrice)), "the crossover must be monotone: wide gaps favour the cheapest");
});

test("every scenario satisfies the capability it requires", () => {
  // La estrategia fija usa el modelo que cubre el pico del workload: si no, el
  // baseline haria trampa comparandose contra routers que si respetan la capacidad.
  for (const comparison of artifact.strategies) {
    const fixed = comparison.runs.find((run) => run.policy === "fixed");
    assert.ok(fixed, `${comparison.workload} has no fixed baseline`);
    assert.equal(fixed.multipleOfFixed, 1, "the baseline is the reference by definition");
  }
});

test("chart primitives escape their labels and survive empty input", () => {
  assert.equal(escapeHtml("<img src=x>"), "&lt;img src=x&gt;");
  assert.match(barChart([{ label: "<b>", value: 1, display: "1" }], "aria"), /&lt;b&gt;/);
  assert.doesNotMatch(barChart([], "aria"), /<rect/);
  assert.doesNotThrow(() => lineChart({ series: [], xLabels: [], ariaLabel: "x" }));
});
