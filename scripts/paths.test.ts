import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import { DEFAULT_OUT_DIR, outFile, resolveOutDir, runName } from "./paths.js";
import { parseArgs } from "./run-benchmark.js";

test("resolveOutDir defaults to the root scratch directory", () => {
  assert.equal(resolveOutDir([], {}), DEFAULT_OUT_DIR);
  assert.equal(DEFAULT_OUT_DIR, "results");
});

test("resolveOutDir accepts --out-dir and RESULTS_DIR, in that order", () => {
  assert.equal(resolveOutDir(["--out-dir", "pocs/jev-kev-laya/results"], {}), "pocs/jev-kev-laya/results");
  assert.equal(resolveOutDir([], { RESULTS_DIR: "results/scratch" }), "results/scratch");
  assert.equal(resolveOutDir(["--out-dir", "pocs/one/results"], { RESULTS_DIR: "results/scratch" }), "pocs/one/results");
});

test("resolveOutDir rejects a missing or flag-like value", () => {
  assert.throws(() => resolveOutDir(["--out-dir"], {}), /--out-dir requires a value/);
  assert.throws(() => resolveOutDir(["--out-dir", "--limit"], {}), /--out-dir requires a value/);
});

test("parseArgs writes into the requested out-dir with a timestamped name", () => {
  const parsed = parseArgs(["--out-dir", "pocs/jev-kev-laya/results"]);
  assert.equal(parsed.outDir, "pocs/jev-kev-laya/results");
  assert.equal(parsed.outputPath, join("pocs/jev-kev-laya/results", parsed.outputPath.split(/[\\/]/).pop()!));
  assert.match(parsed.outputPath, /benchmark-\d{4}-\d{2}-\d{2}T.*\.jsonl$/);
});

test("outFile joins names into the results directory", () => {
  assert.equal(outFile("pocs/jev-kev-laya/results", "kev-wide.jsonl"), join("pocs/jev-kev-laya/results", "kev-wide.jsonl"));
});

test("runName is a filesystem-safe timestamp with the given prefix", () => {
  const name = runName("benchmark", new Date("2026-09-27T14:44:37.993Z"));
  assert.equal(name, "benchmark-2026-09-27T14-44-37.993Z");
  assert.doesNotMatch(name, /:/);
});
