import assert from "node:assert/strict";
import test from "node:test";
import { classifyWithLaya } from "../src/laya.js";

test("classifyWithLaya maps the System One response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ answers: { reasoning_effort: { score: 1.8, confidence: 0.4 }, model_choice: { choice: "openai/gpt-5-mini", confidence: 0.6 } } }));
  try {
    const result = await classifyWithLaya({ id: "one", text: "Fix a Python error", source: "test" });
    assert.deepEqual({ ...result, latencyMs: 0 }, { questionId: "one", reasoningEffort: "high", reasoningConfidence: 0.4, modelChoice: "openai/gpt-5-mini", modelConfidence: 0.6, latencyMs: 0 });
  } finally { globalThis.fetch = originalFetch; }
});

test("classifyWithLaya sends a custom model pool as model_choice criteria", async () => {
  const originalFetch = globalThis.fetch;
  let sentBody: any;
  globalThis.fetch = async (_url, init) => {
    sentBody = JSON.parse(init!.body as string);
    return new Response(JSON.stringify({ answers: { reasoning_effort: { score: 0, confidence: 0.5 }, model_choice: { choice: "custom/model", confidence: 0.5 } } }));
  };
  try {
    await classifyWithLaya({ id: "one", text: "Fix a bug", source: "test" }, undefined, { "custom/model": "a test model" });
    assert.deepEqual(sentBody.questions.model_choice.criteria, { "custom/model": "a test model" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
