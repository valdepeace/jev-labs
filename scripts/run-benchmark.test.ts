import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseArgs, runBenchmark } from "./run-benchmark.js";
import type { Question } from "../src/dataset.js";

test("parseArgs rejects a missing option value", () => {
  assert.throws(() => parseArgs(["--input"]), /--input requires a value/);
  assert.throws(() => parseArgs(["--output", "--limit", "3"]), /--output requires a value/);
  assert.throws(() => parseArgs(["--limit", "--input", "questions.jsonl"]), /--limit requires a value/);
});

test("parseArgs rejects a non-positive or fractional limit", () => {
  assert.throws(() => parseArgs(["--limit", "0"]), /positive integer/);
  assert.throws(() => parseArgs(["--limit", "1.5"]), /positive integer/);
});

test("parseArgs defaults to the wide pool and rejects an unknown pool name", () => {
  assert.equal(parseArgs([]).pool, "wide");
  assert.equal(parseArgs(["--pool", "tiers"]).pool, "tiers");
  assert.throws(() => parseArgs(["--pool", "bogus"]), /--pool must be 'wide' or 'tiers'/);
});

test("runBenchmark limits calls and records successful and failed classifications", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jev-benchmark-"));
  const outputPath = join(directory, "results.jsonl");
  const questions: Question[] = [
    { id: "one", text: "How do I fix this TypeScript error?", source: "test" },
    { id: "two", text: "Why does this query time out?", source: "test" },
    { id: "three", text: "This question must not be processed", source: "test" },
  ];

  try {
    const summary = await runBenchmark({
      questions,
      limit: 2,
      outputPath,
      classify: async (question) =>
        question.id === "two"
          ? { questionId: question.id, latencyMs: 4, error: "rate limited" }
          : {
              questionId: question.id,
              reasoningEffort: "low",
              reasoningConfidence: 0.9,
              modelChoice: "openai/gpt-5-mini",
              modelConfidence: 0.8,
              latencyMs: 3,
            },
    });

    assert.deepEqual(summary, { processed: 2, succeeded: 1, failed: 1 });
    const rows = (await readFile(outputPath, "utf8")).trim().split("\n").map(JSON.parse);
    assert.deepEqual(rows.map((row) => row.questionId), ["one", "two"]);
    assert.equal(rows[1].error, "rate limited");
    assert.equal(
      await readFile(join(directory, "results.summary.csv"), "utf8"),
      "processed,succeeded,failed\n2,1,1\n",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
