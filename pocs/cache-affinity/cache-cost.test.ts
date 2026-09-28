import assert from "node:assert/strict";
import test from "node:test";

import { ANTHROPIC_STYLE, FREE_WRITE_STYLE, breakEvenTurns, priceTurn, projectTurnCost, simulateSession, type Candidate } from "./cache-cost.js";
import { cacheKey } from "./ledger.js";

const rates = { ...ANTHROPIC_STYLE, inputUsdPerMTok: 1 };

/** Dos modelos distintos, mismo precio y misma capacidad: la caché es lo único que cambia. */
export const POOL: Candidate[] = [
  { provider: "p", model: "a", capability: 2, rates },
  { provider: "p", model: "b", capability: 2, rates },
];

const turn = (model: string, extra = {}) => ({ model, newInputTokens: 500, outputTokens: 400, ...extra });
const session = (turns: ReturnType<typeof turn>[], prefixTokens = 50_000) =>
  simulateSession({ prefixTokens, pool: POOL, turns, defaultSecondsPerTurn: 30 });

test("a warm turn pays the cached read price on the prefix, not the input price", () => {
  const { turns } = session([turn("a"), turn("a")]);
  assert.equal(turns[0].cacheReadTokens, 0);
  assert.equal(turns[0].cacheWriteTokens, 50_000);
  assert.equal(turns[1].cacheReadTokens, 50_500, "reads everything cached so far, including the previous delta");
  assert.equal(turns[1].cacheWriteTokens, 0);
  // El prefijo se paga a 1,25x en frio y a 0,1x en tibio: el turno frio sale ~9x
  // mas caro, y el delta y la salida son identicos en los dos.
  assert.ok(turns[0].cost > turns[1].cost * 8, `cold ${turns[0].cost} vs warm ${turns[1].cost}`);
});

test("switching model re-writes the whole prefix: the cache has no cross-model hits", () => {
  const { turns } = session([turn("a"), turn("b")]);
  assert.equal(turns[1].cacheReadTokens, 0, "another model must not read a's cache");
  assert.equal(turns[1].switched, true);
  assert.equal(turns[0].switched, false);
  assert.ok(turns[1].coldPrefixPenalty > 0);
});

test("the cache domain includes the provider, so the same model elsewhere is a cold domain", () => {
  const twoProviders: Candidate[] = [
    { provider: "one", model: "m", capability: 2, rates },
    { provider: "two", model: "m", capability: 2, rates },
  ];
  assert.notEqual(cacheKey({ provider: "one", model: "m", contextHash: "x" }), cacheKey({ provider: "two", model: "m", contextHash: "x" }));
});

test("a small pool revisited within the ttl keeps every lineage warm", () => {
  const alternating = session([turn("a"), turn("b"), turn("a"), turn("b"), turn("a")]);
  assert.equal(alternating.turns[0].warm, false);
  assert.equal(alternating.turns[1].warm, false, "b's first visit");
  assert.equal(alternating.turns[2].warm, true, "a's entry survived b's turn");
  assert.equal(alternating.switches, 4);
});

test("the transcript grows the prefix, so staying warm is not free but stays cheap", () => {
  const { turns } = session([turn("a", { newInputTokens: 1_000, outputTokens: 100 }), turn("a", { newInputTokens: 1_000, outputTokens: 100 }), turn("a", { newInputTokens: 1_000, outputTokens: 100 })]);
  assert.equal(turns[0].cacheWriteTokens, 50_000);
  assert.equal(turns[1].cacheWriteTokens, 0, "the delta was already written with the previous request");
  assert.equal(turns[1].cacheReadTokens, 51_000);
  assert.equal(turns[2].cacheReadTokens, 52_000);
});

test("an entry expires by wall clock, so a slow turn loses the cache a model switch would", () => {
  const fast = session([turn("a"), turn("a")]);
  const slow = session([turn("a"), turn("a", { secondsSincePrevious: 1_200 })]);
  assert.equal(fast.turns[1].warm, true);
  assert.equal(slow.turns[1].warm, false, "20 minutes outlive a 5-minute ttl");
  assert.equal(slow.turns[1].expired, true);
  assert.equal(slow.cacheExpirations, 1);
  assert.equal(slow.cacheHitTurns, 0);
});

test("priceTurn adds the four terms at the right rates", () => {
  const cost = priceTurn({ rates, readTokens: 1_000, writeTokens: 2_000, inputTokens: 500, outputTokens: 400 });
  assert.equal(cost, (1_000 * 0.1 + 2_000 * 1.25 + 500 + 400 * 4) / 1e6);
});

test("projectTurnCost prices a candidate against the ledger, warm or cold", () => {
  const first = simulateSession({ prefixTokens: 50_000, pool: POOL, turns: [turn("a")] });
  const afterFirst: Parameters<typeof projectTurnCost>[0]["ledger"] = new Map();
  // Tras el primer turno, el dominio de `a` está tibio y el de `b` no existe.
  afterFirst.set(cacheKey({ provider: "p", model: "a", contextHash: "prefix" }), {
    domain: { provider: "p", model: "a", contextHash: "prefix" },
    cachedTokens: 50_500, cacheable: true, createdAt: 30, lastUsedAt: 30, ttlSeconds: 300, rates,
  });
  const warm = projectTurnCost({ candidate: POOL[0], ledger: afterFirst, domain: { provider: "p", model: "a", contextHash: "prefix" }, nowSeconds: 60, prefixTokens: 50_500, newInputTokens: 500, outputTokens: 400 });
  const cold = projectTurnCost({ candidate: POOL[1], ledger: afterFirst, domain: { provider: "p", model: "b", contextHash: "prefix" }, nowSeconds: 60, prefixTokens: 50_500, newInputTokens: 500, outputTokens: 400 });
  assert.equal(warm.warm, true);
  assert.equal(cold.warm, false);
  assert.ok(cold.cost > warm.cost, "a cold domain must project higher");
  assert.equal(first.turns[0].cost, first.total);
});

test("breakEvenTurns: switching pays only past a price threshold, and never at equal price", () => {
  const base = { prefixTokens: 50_000, from: rates, newInputTokens: 500, outputTokens: 400 };
  assert.equal(breakEvenTurns({ ...base, to: rates }), Infinity, "no price difference means nothing to amortize");
  assert.equal(breakEvenTurns({ ...base, to: { ...rates, inputUsdPerMTok: 0.1 } }), 0, "10x cheaper: the cold turn already wins");

  const half = breakEvenTurns({ ...base, to: { ...rates, inputUsdPerMTok: 0.5 } });
  const fifth = breakEvenTurns({ ...base, to: { ...rates, inputUsdPerMTok: 0.2 } });
  assert.ok(half >= 8 && half <= 12, `half price should need ~10 turns, got ${half}`);
  assert.ok(fifth <= 3, `five times cheaper should pay back in ~2 turns, got ${fifth}`);
  assert.ok(fifth < half, "a cheaper model must amortize sooner");
});

test("free cache writes shorten the break-even, because the penalty is smaller", () => {
  const penalised = breakEvenTurns({ prefixTokens: 50_000, from: rates, to: { ...rates, inputUsdPerMTok: 0.5 }, newInputTokens: 500, outputTokens: 400 });
  const freeWrite = breakEvenTurns({ prefixTokens: 50_000, from: { ...FREE_WRITE_STYLE, inputUsdPerMTok: 1 }, to: { ...FREE_WRITE_STYLE, inputUsdPerMTok: 0.5 }, newInputTokens: 500, outputTokens: 400 });
  assert.ok(freeWrite < penalised, `free writes should amortize sooner: ${freeWrite} vs ${penalised}`);
});

test("the break-even matches the long-prefix approximation (w*f - r) / (r*(1-f))", () => {
  const w = rates.cacheWriteMultiplier;
  const r = rates.cacheReadMultiplier;
  for (const f of [0.5, 0.4, 0.3, 0.2]) {
    const exact = breakEvenTurns({ prefixTokens: 2_000_000, from: rates, to: { ...rates, inputUsdPerMTok: f }, newInputTokens: 500, outputTokens: 400 });
    const approximate = (w * f - r) / (r * (1 - f));
    assert.ok(Math.abs(exact - approximate) <= 1, `f=${f}: exact ${exact} vs approximation ${approximate}`);
  }
});

test("below the provider minimum nothing is cached, so per-turn switching is free", () => {
  const short = session([turn("a", { newInputTokens: 100, outputTokens: 400 }), turn("b", { newInputTokens: 100, outputTokens: 400 })], 500);
  assert.equal(short.cacheHitTurns, 0);
  assert.equal(short.turns[1].coldPrefixPenalty, 0, "there was nothing to lose");
});
