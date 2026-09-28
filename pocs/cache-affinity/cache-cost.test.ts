import assert from "node:assert/strict";
import test from "node:test";

import { ANTHROPIC_STYLE, breakEvenTurns, simulateSession, type SessionConfig } from "./cache-cost.js";

const rates = { "model/a": ANTHROPIC_STYLE, "model/b": ANTHROPIC_STYLE };
const turn = (model: string) => ({ model, newInputTokens: 500, outputTokens: 400 });

function config(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    prefixTokens: 50_000,
    rates,
    cacheTtlTurns: 100,
    turns: Array.from({ length: 10 }, () => turn("model/a")),
    ...overrides,
  };
}

test("a warm turn pays the cached read price on the prefix, not the input price", () => {
  const { turns } = simulateSession(config({ turns: [{ model: "model/a", newInputTokens: 0, outputTokens: 0 }, { model: "model/a", newInputTokens: 0, outputTokens: 0 }] }));
  assert.equal(turns[0].cacheReadTokens, 0);
  assert.equal(turns[0].cacheWriteTokens, 50_000);
  assert.equal(turns[1].cacheReadTokens, 50_000);
  assert.equal(turns[1].cacheWriteTokens, 0);
  // 50k a 1,25 vs 50k a 0,1: una diferencia de 12,5x en el prefijo.
  assert.ok(turns[0].cost > turns[1].cost * 12, `cold ${turns[0].cost} vs warm ${turns[1].cost}`);
});

test("switching model re-writes the whole prefix: the cache has no cross-model hits", () => {
  const { turns } = simulateSession(config({ turns: [turn("model/a"), turn("model/b")] }));
  assert.equal(turns[1].cacheReadTokens, 0, "a different model must not read model/a's cache");
  assert.equal(turns[1].cacheWriteTokens, 50_500);
  assert.equal(turns[1].switched, true);
  assert.equal(turns[0].switched, false);
});

test("a small pool revisited within the ttl keeps every lineage warm", () => {
  const alternating = simulateSession(config({ turns: Array.from({ length: 10 }, (_, index) => turn(index % 2 === 0 ? "model/a" : "model/b")) }));
  // Solo los dos primeros turnos son fríos: despues cada modelo se relee a si mismo.
  assert.equal(alternating.turns[0].cacheReadTokens, 0);
  assert.equal(alternating.turns[1].cacheReadTokens, 0);
  assert.ok(alternating.turns[2].cacheReadTokens > 0, "model/a's entry survived model/b's turn");
  assert.equal(alternating.switches, 9);
});

test("a pool larger than the ttl window never warms anything and costs ~5x a sticky session", () => {
  const pool = Array.from({ length: 16 }, (_, index) => `model/m${index}`);
  const poolRates = Object.fromEntries(pool.map((model) => [model, ANTHROPIC_STYLE]));
  const sticky = simulateSession(config());
  // 16 modelos con un ttl de 10 turnos: cada visita encuentra la entrada caducada.
  const cycling = simulateSession(config({
    rates: poolRates,
    cacheTtlTurns: 10,
    turns: pool.slice(0, 10).map((model) => turn(model)),
  }));
  assert.equal(cycling.cacheReadTokens, 0);
  assert.equal(cycling.switches, 9);
  assert.ok(cycling.total > sticky.total * 4 && cycling.total < sticky.total * 6, `cycling ${cycling.total} vs sticky ${sticky.total}`);
});

test("the transcript grows the prefix, so staying warm is not free but stays cheap", () => {
  const { turns } = simulateSession(config({ turns: [{ model: "model/a", newInputTokens: 1_000, outputTokens: 100 }, { model: "model/a", newInputTokens: 1_000, outputTokens: 100 }, { model: "model/a", newInputTokens: 1_000, outputTokens: 100 }] }));
  assert.equal(turns[0].cacheWriteTokens, 50_000);
  assert.equal(turns[1].cacheWriteTokens, 0, "the delta was already written with the previous request");
  assert.equal(turns[1].cacheReadTokens, 51_000);
  assert.equal(turns[2].cacheReadTokens, 52_000);
});

test("a cache entry expires after cacheTtlTurns of inactivity for that model", () => {
  const turns = [turn("model/a"), turn("model/b"), turn("model/b"), turn("model/a")];
  const { turns: cold } = simulateSession(config({ turns, cacheTtlTurns: 1, rates: { "model/a": ANTHROPIC_STYLE, "model/b": ANTHROPIC_STYLE } }));
  const { turns: warm } = simulateSession(config({ turns, cacheTtlTurns: 100 }));
  assert.equal(cold[3].cacheReadTokens, 0, "expired after the ttl");
  assert.equal(warm[3].cacheReadTokens, 50_500, "still cached within the ttl");
});

test("breakEvenTurns: switching pays only past a price threshold, and never at equal price", () => {
  const base = { prefixTokens: 50_000, from: ANTHROPIC_STYLE, newInputTokens: 500, outputTokens: 400 };
  assert.equal(breakEvenTurns({ ...base, to: ANTHROPIC_STYLE }), Infinity, "no price difference means nothing to amortize");
  assert.equal(breakEvenTurns({ ...base, to: { ...ANTHROPIC_STYLE, inputUsdPerMTok: 0.1 } }), 0, "10x cheaper: the cold turn already wins");

  const half = breakEvenTurns({ ...base, to: { ...ANTHROPIC_STYLE, inputUsdPerMTok: 0.5 } });
  const fifth = breakEvenTurns({ ...base, to: { ...ANTHROPIC_STYLE, inputUsdPerMTok: 0.2 } });
  assert.ok(half >= 8 && half <= 12, `half price should need ~10 turns, got ${half}`);
  assert.ok(fifth <= 3, `five times cheaper should pay back in ~2 turns, got ${fifth}`);
  assert.ok(fifth < half, "cheaper model must amortize sooner");
});

test("the break-even matches the long-prefix approximation (w*f - r) / (r*(1-f))", () => {
  const w = ANTHROPIC_STYLE.cacheWriteMultiplier;
  const r = ANTHROPIC_STYLE.cacheReadMultiplier;
  for (const f of [0.5, 0.4, 0.3, 0.2]) {
    const exact = breakEvenTurns({ prefixTokens: 2_000_000, from: ANTHROPIC_STYLE, to: { ...ANTHROPIC_STYLE, inputUsdPerMTok: f }, newInputTokens: 500, outputTokens: 400 });
    const approximate = (w * f - r) / (r * (1 - f));
    assert.ok(Math.abs(exact - approximate) <= 1, `f=${f}: exact ${exact} vs approximation ${approximate}`);
  }
});

test("simulateSession reports the per-turn cost breakdown for the report", () => {
  const result = simulateSession(config({ turns: [turn("model/a")] }));
  assert.equal(result.turns.length, 1);
  assert.equal(result.turns[0].cost, result.turns[0].cumulative);
  assert.equal(result.cacheWriteTokens, 50_000);
  assert.equal(result.total, result.turns[0].cost);
  assert.equal(result.cacheEntries, 1);
});
