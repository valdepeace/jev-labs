/**
 * Escenarios del informe. El valor por defecto es una sesión de agente de código
 * verosímil: 50k de prefijo estable (system prompt + herramientas), 500 tokens
 * nuevos y 400 de salida por turno, 10 turnos.
 *
 * El TTL se expresa en turnos porque es la unidad de la simulación: el TTL de 5
 * minutos de Anthropic equivale a 10 turnos si cada turno tarda ~30 segundos, y
 * ese es el supuesto que hay que hacer explícito para juzgar cualquier resultado.
 */
import { ANTHROPIC_STYLE, FREE_WRITE_STYLE, breakEvenTurns, simulateSession, type Rates, type SessionResult, type SessionTurn } from "./cache-cost.js";

export const DEFAULT_TURNS = 10;
export const DEFAULT_PREFIX_TOKENS = 50_000;
export const DEFAULT_NEW_INPUT_TOKENS = 500;
export const DEFAULT_OUTPUT_TOKENS = 400;
/** TTL de 5 minutos a ~30 s por turno. */
export const DEFAULT_TTL_TURNS = 10;

export interface ScenarioReport {
  /** Identificador estable: el informe lo usa en vez del nombre visible. */
  id: string;
  name: string;
  description: string;
  ttlTurns: number;
  poolSize: number;
  result: SessionResult;
}

export const PRESETS: Record<string, Rates> = { anthropic: ANTHROPIC_STYLE, freeWrite: FREE_WRITE_STYLE };

function turns(models: readonly string[], count: number): SessionTurn[] {
  return Array.from({ length: count }, (_, index) => ({
    model: models[index % models.length],
    newInputTokens: DEFAULT_NEW_INPUT_TOKENS,
    outputTokens: DEFAULT_OUTPUT_TOKENS,
  }));
}

function ratesFor(models: readonly string[]): Record<string, Rates> {
  return Object.fromEntries(models.map((model) => [model, ANTHROPIC_STYLE]));
}

function run(id: string, name: string, description: string, models: readonly string[], turnsCount: number, ttlTurns: number): ScenarioReport {
  const result = simulateSession({ prefixTokens: DEFAULT_PREFIX_TOKENS, rates: ratesFor(models), cacheTtlTurns: ttlTurns, turns: turns(models, turnsCount) });
  return { id, name, description, ttlTurns, poolSize: models.length, result };
}

/** Los cuatro escenarios que ilustran el problema. */
export function scenarioReports(): ScenarioReport[] {
  const single = ["model/a"];
  const pair = ["model/a", "model/b"];
  const pool = Array.from({ length: 16 }, (_, index) => `model/m${index}`);
  // Mismo modelo servido por otro endpoint: mismos precios, otra entrada de caché.
  const twoEndpoints = ["model/a@endpoint1", "model/a@endpoint2"];

  return [
    run("sticky", "Modelo fijo", "Una sola entrada de caché: se calienta en el primer turno y se mantiene.", single, DEFAULT_TURNS, DEFAULT_TTL_TURNS),
    run("pair", "Dos modelos alternos", "Cambio cada turno, pero cada linaje se revisita dentro del TTL: ambas cachés siguen tibias.", pair, DEFAULT_TURNS, DEFAULT_TTL_TURNS),
    run("pool16", "Ciclo por el pool de 16", "Cambio cada turno por un pool más grande que la ventana del TTL: ninguna visita encuentra caché.", pool, DEFAULT_TURNS, DEFAULT_TTL_TURNS),
    run("two-endpoints", "Mismo modelo, otro endpoint", "Mismos precios, otra entrada de caché: no hay ahorro que compense la reescritura.", twoEndpoints, DEFAULT_TURNS, DEFAULT_TTL_TURNS),
  ];
}

export interface BreakEvenRow {
  factor: number;
  /** Turnos necesarios, `0` si el propio turno del cambio ya compensa, `null` si no compensa nunca. */
  turns: number | null;
}

/**
 * Amortización frente al cociente de precios, con los ratios documentados. Un
 * cambio que nunca amortiza se serializa como `null` porque `Infinity` no
 * sobrevive al JSON y el informe se renderiza desde el JSONL.
 */
export function breakEvenRows(factors: readonly number[] = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]): BreakEvenRow[] {
  return factors.map((factor) => {
    const needed = breakEvenTurns({
      prefixTokens: DEFAULT_PREFIX_TOKENS,
      from: ANTHROPIC_STYLE,
      to: { ...ANTHROPIC_STYLE, inputUsdPerMTok: factor },
      newInputTokens: DEFAULT_NEW_INPUT_TOKENS,
      outputTokens: DEFAULT_OUTPUT_TOKENS,
    });
    return { factor, turns: Number.isFinite(needed) ? needed : null };
  });
}

export interface PoolRow {
  poolSize: number;
  cacheReadTokens: number;
  multiple: number;
}

/**
 * Coste total frente al tamaño del pool, que es lo que decide si el linaje se
 * revisita a tiempo: por encima del TTL en turnos, no se calienta nada.
 */
export function poolRows(sizes: readonly number[] = [1, 2, 4, 8, 10, 12, 16]): PoolRow[] {
  const baseline = simulateSession({
    prefixTokens: DEFAULT_PREFIX_TOKENS,
    rates: ratesFor(["model/m0"]),
    cacheTtlTurns: DEFAULT_TTL_TURNS,
    turns: turns(["model/m0"], DEFAULT_TURNS),
  }).total;

  return sizes.map((size) => {
    const models = Array.from({ length: size }, (_, index) => `model/m${index}`);
    const result = simulateSession({ prefixTokens: DEFAULT_PREFIX_TOKENS, rates: ratesFor(models), cacheTtlTurns: DEFAULT_TTL_TURNS, turns: turns(models, DEFAULT_TURNS) });
    return { poolSize: size, cacheReadTokens: result.cacheReadTokens, multiple: result.total / baseline };
  });
}

export interface SimulationArtifact {
  generatedBy: string;
  prefixTokens: number;
  newInputTokens: number;
  outputTokens: number;
  defaultTtlTurns: number;
  presets: Record<string, Rates>;
  scenarios: ScenarioReport[];
  breakEven: BreakEvenRow[];
  pools: PoolRow[];
}

/** Todo lo que el informe necesita, en un objeto serializable. */
export function buildSimulation(): SimulationArtifact {
  return {
    generatedBy: "npm run cache-affinity",
    prefixTokens: DEFAULT_PREFIX_TOKENS,
    newInputTokens: DEFAULT_NEW_INPUT_TOKENS,
    outputTokens: DEFAULT_OUTPUT_TOKENS,
    defaultTtlTurns: DEFAULT_TTL_TURNS,
    presets: PRESETS,
    scenarios: scenarioReports(),
    breakEven: breakEvenRows(),
    pools: poolRows(),
  };
}
