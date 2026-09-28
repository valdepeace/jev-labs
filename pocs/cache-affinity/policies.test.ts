import assert from "node:assert/strict";
import test from "node:test";

import { ANTHROPIC_STYLE, simulateSession, type Candidate, type SessionTurn } from "./cache-cost.js";
import { cacheAware, cheapest, fixed, quality, warmOrSwitch, loadBalanced } from "./policies.js";

/** Pool declarado: precios relativos, capacidades y un proveedor por modelo. */
const POOL: Candidate[] = [
  { provider: "anthropic", model: "frontier-a", capability: 3, rates: { ...ANTHROPIC_STYLE, inputUsdPerMTok: 1 } },
  { provider: "anthropic", model: "balanced-a", capability: 2, rates: { ...ANTHROPIC_STYLE, inputUsdPerMTok: 0.4 } },
  { provider: "anthropic", model: "fast-a", capability: 1, rates: { ...ANTHROPIC_STYLE, inputUsdPerMTok: 0.1 } },
  { provider: "openai", model: "balanced-b", capability: 2, rates: { ...ANTHROPIC_STYLE, inputUsdPerMTok: 0.3 } },
  { provider: "google", model: "fast-c", capability: 1, rates: { ...ANTHROPIC_STYLE, inputUsdPerMTok: 0.08 } },
];

const turns = (count: number, minCapability = 2): SessionTurn[] =>
  Array.from({ length: count }, () => ({ newInputTokens: 500, outputTokens: 400, minCapability }));

const session = (policy: Parameters<typeof simulateSession>[1]) => simulateSession(
  { prefixTokens: 50_000, pool: POOL, turns: turns(12) },
  policy,
);

test("fixed never changes model and warms a single cache entry", () => {
  const result = session({ policy: fixed("balanced-a") });
  assert.equal(result.switches, 0);
  assert.deepEqual([...new Set(result.turns.map((turn) => turn.model))], ["balanced-a"]);
  assert.equal(result.cacheHitTurns, 11, "all but the first");
  assert.equal(result.cacheEntries, 1);
});

test("cheapest ignores capabilities when they are not required, and thrashs the cache", () => {
  const relaxed = simulateSession({ prefixTokens: 50_000, pool: POOL, turns: turns(12, 0) }, { policy: cheapest });
  assert.deepEqual([...new Set(relaxed.turns.map((turn) => turn.model))], ["fast-c"], "the cheapest by list price, always");
  assert.equal(relaxed.cacheHitTurns, 11, "never switches, so its cache stays warm");
});

test("quality ignores the cache, and its safety margin decides how much it over-provisions", () => {
  // Con margen 1 sobre una dificultad 2, el listón sube a capacidad 3: solo queda
  // el frontier, que es mas caro que el equilibrado que B elegiria.
  const withMargin = session({ policy: quality() });
  assert.deepEqual([...new Set(withMargin.turns.map((turn) => turn.model))], ["frontier-a"]);

  // Sin margen, el liston es la dificultad exigida y gana el equilibrado mas barato.
  const noMargin = session({ policy: quality({ safetyMargin: 0 }) });
  assert.deepEqual([...new Set(noMargin.turns.map((turn) => turn.model))], ["balanced-b"]);

  // Y en ningun caso mira la cache: no cambia de modelo por afinidad.
  assert.equal(noMargin.switches, 0);
});

test("cache-aware keeps a warm model instead of jumping to a marginally cheaper cold one", () => {
  // El turno exige capacidad 2 → balanced-a (0.4) y balanced-b (0.3). Solo el 0.3
  // es más barato por token; a 50K de prefijo, el salto no compensa.
  const result = session({ policy: cacheAware() });
  const switched = result.turns.filter((turn) => turn.switched).length;
  assert.equal(switched, 0, "starting on balanced-a, staying warm beats switching to balanced-b");
  assert.equal(result.cacheHitTurns, 11);
});

test("cache-aware does switch to the cheaper model when nothing warm is at stake", () => {
  // La caché de balanced-a caduca entre turnos (pausa de 20 minutos > ttl 300 s),
  // así que el crédito por preservación desaparece y gana el más barato.
  const pauses = Array.from({ length: 6 }, () => ({ newInputTokens: 500, outputTokens: 400, minCapability: 2, secondsSincePrevious: 1_200 }));
  const result = simulateSession({ prefixTokens: 50_000, pool: POOL, turns: pauses }, { policy: cacheAware() });
  assert.ok(result.turns.some((turn) => turn.model === "balanced-b"), "with a cold cache the cheaper model wins");
  assert.equal(result.cacheHitTurns, 0, "20-minute pauses outlive a 5-minute ttl");
});

test("the two-line rule captures the same benefit as the heuristic on a steady workload", () => {
  const steady = simulateSession({ prefixTokens: 50_000, pool: POOL, turns: turns(12) }, { policy: fixed("balanced-a") });
  const rule = session({ policy: warmOrSwitch });
  const heuristic = session({ policy: cacheAware() });
  assert.ok(rule.total <= steady.total * 1.01, `the rule should not be worse than staying fixed (${rule.total} vs ${steady.total})`);
  assert.ok(heuristic.total <= rule.total * 1.01, `the heuristic should not be worse than the rule (${heuristic.total} vs ${rule.total})`);
});

test("switching to a cold domain is charged as a cold-prefix penalty, and short prompts are not", () => {
  const long = simulateSession({
    prefixTokens: 50_000,
    pool: POOL,
    turns: [{ model: "balanced-a", newInputTokens: 500, outputTokens: 400 }, { model: "balanced-b", newInputTokens: 500, outputTokens: 400 }],
  });
  assert.equal(long.turns[0].coldPrefixPenalty, 0, "the first turn had nothing to lose");
  assert.ok(long.turns[1].coldPrefixPenalty > 0, "a 50K prefix costs something to rewrite");
  assert.equal(long.coldPrefixPenalty, long.turns[1].coldPrefixPenalty);

  const short = simulateSession({
    prefixTokens: 500,
    pool: POOL,
    turns: [{ model: "balanced-a", newInputTokens: 100, outputTokens: 400 }, { model: "balanced-b", newInputTokens: 100, outputTokens: 400 }],
  });
  assert.equal(short.turns[1].coldPrefixPenalty, 0, "below the cache minimum there is nothing to lose");
  assert.equal(short.cacheHitTurns, 0);
});

test("a volatile turn forces one full rewrite, and the contaminated prefix re-caches", () => {
  const result = simulateSession({
    prefixTokens: 50_000,
    pool: POOL,
    turns: [
      { model: "balanced-a", newInputTokens: 500, outputTokens: 400 },
      { model: "balanced-a", newInputTokens: 500, outputTokens: 400, volatile: true },
      { model: "balanced-a", newInputTokens: 500, outputTokens: 400 },
    ],
  });
  assert.equal(result.volatileTurns, 1);
  assert.equal(result.turns[0].warm, false, "first turn writes");
  assert.equal(result.turns[1].warm, false, "the contamination killed its own entry");
  assert.equal(result.turns[2].warm, true, "the rewritten prefix is cacheable again: the cost is one rewrite, not permanent loss");
  assert.equal(result.cacheExpirations, 0);
  // El precio del evento es una reescritura completa del prefijo.
  assert.ok(result.turns[1].cost > result.turns[0].cost, "the volatile turn pays the full prefix again");
  assert.ok(result.turns[1].coldPrefixPenalty > 0, "the invalidation costs the same as a model switch would");
});
