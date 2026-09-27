import assert from "node:assert/strict";
import test from "node:test";
import { flattenTierPool, PROVIDER_TIER_POOLS } from "./provider-tiers.js";
import { MODEL_POOL } from "./models.js";

test("PROVIDER_TIER_POOLS phase 1 covers anthropic, google, and openai only", () => {
  assert.deepEqual(Object.keys(PROVIDER_TIER_POOLS).sort(), ["anthropic", "google", "openai"]);
});

test("every tier model id exists in MODEL_POOL", () => {
  for (const tiers of Object.values(PROVIDER_TIER_POOLS)) {
    for (const modelId of Object.values(tiers)) assert.ok(modelId in MODEL_POOL, `${modelId} is missing from MODEL_POOL`);
  }
});

test("flattenTierPool returns the 9 phase-1 models by default", () => {
  const pool = flattenTierPool();
  assert.equal(Object.keys(pool).length, 9);
});

test("flattenTierPool rejects an unknown provider", () => {
  assert.throws(() => flattenTierPool(["mistral"]), /unknown provider tier pool: mistral/);
});
