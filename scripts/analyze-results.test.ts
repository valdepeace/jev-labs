import assert from "node:assert/strict";
import test from "node:test";
import { summarizeResults } from "./analyze-results.js";

test("summarizeResults groups successful and failed classifications", () => {
  assert.equal(
    summarizeResults([
      { questionId: "a", modelChoice: "openai/gpt-5-mini", reasoningEffort: "low", latencyMs: 1 },
      { questionId: "b", modelChoice: "openai/gpt-5-mini", reasoningEffort: "high", modelConfidence: 0.4, textLength: 250, tags: ["typescript"], latencyMs: 2 },
      { questionId: "c", latencyMs: 3, error: "rate limited" },
    ]),
    "kind,value,count\nerror,classification_failed,1\nmodel,openai/gpt-5-mini,2\nmodel_confidence,below_0.5,1\nreasoning_effort,high,1\nreasoning_effort,low,1\ntag,typescript,1\ntext_length,medium,1\n",
  );
});
