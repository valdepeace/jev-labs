import assert from "node:assert/strict";
import test from "node:test";
import { DesignPatternRouter, type Candidate, type DecisionEngine, type RoutingContext, type RoutingPolicy } from "./router.js";

const candidates: Candidate[] = [
  { id: "local-qwen", tier: "local", provider: "ollama", tools: false, context: 32_000, healthy: true },
  { id: "cheap-qwen", tier: "cheap", provider: "openrouter", tools: true, context: 128_000, healthy: true },
  { id: "strong-kimi", tier: "strong", provider: "openrouter", tools: true, context: 256_000, healthy: true },
  { id: "frontier-gpt", tier: "frontier", provider: "openai", tools: true, context: 1_000_000, healthy: true },
];

const policy: RoutingPolicy = { minConfidence: 0.7, minMargin: 0.1, allowedProviders: ["ollama", "openrouter"] };
const context: RoutingContext = { task: "refactor this module", requiresTools: true, minContext: 128_000 };

test("filters capabilities before a closed-world decision, then resolves without executing", async () => {
  let allowed: readonly string[] = [];
  const engine: DecisionEngine = { decide: async (_, options) => {
    allowed = options;
    return { choice: "strong", probabilities: { cheap: 0.1, strong: 0.85 } };
  } };
  const receipt = await new DesignPatternRouter(engine, policy).route(context, candidates);
  assert.deepEqual(allowed, ["cheap", "strong"]);
  assert.equal(receipt.candidateId, "strong-kimi");
  assert.equal(receipt.effectiveTier, "strong");
});

test("abstains on an ambiguous or invented decision", async () => {
  const engine: DecisionEngine = { decide: async () => ({ choice: "strong", probabilities: { cheap: 0.49, strong: 0.51 } }) };
  const receipt = await new DesignPatternRouter(engine, policy).route(context, candidates);
  assert.equal(receipt.fallback, "abstain");
});

test("keeps a healthy session binding instead of re-routing each tool loop", async () => {
  let calls = 0;
  const engine: DecisionEngine = { decide: async () => {
    calls += 1;
    return { choice: "strong", probabilities: { cheap: 0.1, strong: 0.9 } };
  } };
  const router = new DesignPatternRouter(engine, policy);
  await router.route({ ...context, sessionId: "turn-1" }, candidates);
  const next = await router.route({ ...context, sessionId: "turn-1", task: "run tests" }, candidates);
  assert.equal(calls, 1);
  assert.equal(next.strategy, "session-affinity");
  assert.equal(next.candidateId, "strong-kimi");
});

test("handles a deterministic health check without calling the engine", async () => {
  const engine: DecisionEngine = { decide: async () => { throw new Error("must not be called"); } };
  const receipt = await new DesignPatternRouter(engine, policy).route({ task: "health-check", requiresTools: false, minContext: 0 }, candidates);
  assert.deepEqual(receipt, { strategy: "rules", effectiveTier: "local" });
});
