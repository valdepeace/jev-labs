import assert from "node:assert/strict";
import test from "node:test";

import { ANTHROPIC_STYLE } from "./cache-cost.js";
import { cacheKey, createEntry, isWarm, recreationCost, ttlRemainingSeconds, type CacheEntry } from "./ledger.js";

const entry = (overrides: Partial<CacheEntry> = {}): CacheEntry => ({
  ...createEntry({ domain: { provider: "anthropic", model: "frontier", contextHash: "abc" }, cachedTokens: 60_000, rates: ANTHROPIC_STYLE, nowSeconds: 0 }),
  ...overrides,
});

test("the cache domain is provider + model + prefix hash, not just the model", () => {
  assert.equal(cacheKey({ provider: "anthropic", model: "frontier", contextHash: "abc" }), "anthropic:frontier:abc");
  assert.notEqual(
    cacheKey({ provider: "anthropic", model: "frontier", contextHash: "abc" }),
    cacheKey({ provider: "openrouter", model: "frontier", contextHash: "abc" }),
  );
  assert.notEqual(
    cacheKey({ provider: "anthropic", model: "frontier", contextHash: "abc" }),
    cacheKey({ provider: "anthropic", model: "frontier", contextHash: "def" }),
  );
});

test("an entry is warm until the ttl elapses, and the clock is absolute seconds", () => {
  const created = entry({ createdAt: 1_000, lastUsedAt: 1_000, ttlSeconds: 300 });
  assert.equal(isWarm(created, 1_000), true, "just written");
  assert.equal(isWarm(created, 1_299), true, "inside the ttl");
  assert.equal(isWarm(created, 1_300), false, "the ttl is exclusive at its edge");
  assert.equal(isWarm(created, 5_000), false, "long pause");
});

test("reading a live entry refreshes it at no extra cost, which is the preservation value", () => {
  const refreshed = { ...entry({ createdAt: 1_000, lastUsedAt: 1_000, ttlSeconds: 300 }), lastUsedAt: 1_200 };
  assert.equal(isWarm(refreshed, 1_400), true, "the read pushed the expiry out");
  assert.equal(ttlRemainingSeconds(refreshed, 1_200), 300);
  assert.equal(ttlRemainingSeconds(refreshed, 1_450), 50);
  assert.equal(ttlRemainingSeconds(refreshed, 9_999), 0, "never negative");
});

test("recreationCost is what re-writing the prefix would cost, which is the switching penalty", () => {
  const created = entry({ cachedTokens: 60_000 });
  assert.equal(recreationCost(created), 60_000 * 1.25 / 1e6);
  const freeWrite = { ...created, rates: { ...ANTHROPIC_STYLE, cacheWriteMultiplier: 1 } };
  assert.equal(recreationCost(freeWrite), 60_000 / 1e6);
});

test("a minimum cacheable prefix makes short prompts uncacheable", () => {
  const tiny = createEntry({ domain: { provider: "anthropic", model: "fast", contextHash: "x" }, cachedTokens: 524, rates: ANTHROPIC_STYLE, nowSeconds: 0 });
  assert.equal(tiny.cachedTokens, 0, "below the provider minimum nothing is cached");
  assert.equal(tiny.cacheable, false);
  const big = createEntry({ domain: { provider: "anthropic", model: "fast", contextHash: "x" }, cachedTokens: 4_096, rates: ANTHROPIC_STYLE, nowSeconds: 0 });
  assert.equal(big.cachedTokens, 4_096, "at the minimum it caches");
  assert.equal(big.cacheable, true);
});
