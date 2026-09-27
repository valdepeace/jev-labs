import assert from "node:assert/strict";
import test from "node:test";
import { MODEL_POOL } from "./models.js";

test("MODEL_POOL has a wide, deduplicated set of current model ids", () => {
  const ids = Object.keys(MODEL_POOL);
  assert.ok(ids.length >= 15, `expected at least 15 models, got ${ids.length}`);
  assert.equal(new Set(ids).size, ids.length, "duplicate model id in MODEL_POOL");
  for (const id of ids) {
    assert.match(id, /^[a-z0-9_.-]+\/[a-z0-9_.:-]+$/, `${id} is not a valid provider/model slug`);
  }
});

test("MODEL_POOL covers Anthropic, OpenAI, Google, Meta, and at least one Chinese provider", () => {
  const ids = Object.keys(MODEL_POOL);
  const hasPrefix = (prefix: string) => ids.some((id) => id.startsWith(`${prefix}/`));
  for (const provider of ["anthropic", "openai", "google", "meta-llama"]) {
    assert.ok(hasPrefix(provider), `missing a ${provider} model`);
  }
  const chineseProviders = ["deepseek", "qwen", "moonshotai", "z-ai", "minimax"];
  assert.ok(chineseProviders.some(hasPrefix), "missing at least one Chinese-provider model");
});
