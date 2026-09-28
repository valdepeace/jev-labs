import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDecision, validateRequest, createLabServer } from "./server.js";

test("validates the bounded live-decision input", () => {
  assert.deepEqual(validateRequest({ task: "  Refactor this module  " }), { task: "Refactor this module" });
  assert.throws(() => validateRequest({ task: "" }), /non-empty/);
});

test("rejects an invented tier from the external decision service", () => {
  assert.deepEqual(normalizeDecision({ capability_tier: { choice: "strong", confidence: 0.84 } }), { choice: "strong", confidence: 0.84, probabilities: undefined });
  assert.throws(() => normalizeDecision({ capability_tier: { choice: "provider/model" } }), /invalid capability tier/);
});

test("serves a complete JSON decision response through the local endpoint", async () => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  const client = { alpha: { decisions: { create: async () => ({ answers: { capability_tier: { choice: "strong", confidence: 0.9 } }, usage: { cost: 0 } }) } } };
  const server = createLabServer(client);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/api/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task: "Test task" }) });
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.deepEqual(await response.json(), { decision: { choice: "strong", confidence: 0.9 }, usage: { cost: 0 } });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  }
});
