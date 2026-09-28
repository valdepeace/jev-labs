/**
 * Escenarios del informe: la comparación de estrategias, los patrones de
 * revisita y los barridos que responden a las preguntas del estudio.
 *
 * El artefacto es un único JSONL versionado del que se renderiza el informe, así
 * que cada cifra publicada se puede recalcular.
 */
import { ANTHROPIC_STYLE, FREE_WRITE_STYLE, breakEvenTurns, simulateSession, type Policy, type Rates, type SessionResult } from "./cache-cost.js";
import { cacheAware, cheapest, fixed, loadBalanced, quality, warmOrSwitch } from "./policies.js";
import {
  DEFAULT_SECONDS_PER_TURN, FREE_WRITE_POOL, POOL, POOL_SIZES, PRICE_FACTORS, PREFIX_SIZES, SEQUENCES,
  WORKLOADS, sequenceTurns, workloadTurns, type Workload,
} from "./sequences.js";

/** Referencia del pool para fijar la estrategia A: el modelo más barato que cubre el pico. */
const REFERENCE_MODEL = "balanced-a";

function run(workload: Workload, policy: Policy, pool = POOL, turns = workloadTurns(workload)): SessionResult {
  return simulateSession({ prefixTokens: workload.prefixTokens, pool, turns, defaultSecondsPerTurn: workload.secondsPerTurn }, { policy });
}

function baselineModelFor(workload: Workload): string {
  const peak = Math.max(...workload.capabilityPattern);
  const candidates = POOL.filter((candidate) => candidate.capability >= peak);
  return [...candidates].sort((left, right) => left.rates.inputUsdPerMTok - right.rates.inputUsdPerMTok || left.model.localeCompare(right.model))[0].model;
}

export interface StrategyRun {
  policy: string;
  policyName: string;
  workload: string;
  total: number;
  /** Múltiplo frente a la estrategia A (modelo fijo) en el mismo workload. */
  multipleOfFixed: number;
  cacheHitRatio: number;
  switches: number;
  coldPrefixPenalty: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface StrategyComparison {
  workload: string;
  workloadName: string;
  description: string;
  prefixTokens: number;
  turns: number;
  runs: StrategyRun[];
}

const POLICIES: readonly { id: string; name: string; make: () => Policy }[] = [
  { id: "cheapest", name: "B · El más barato por petición", make: () => cheapest },
  { id: "quality", name: "C · Calidad con margen de seguridad", make: () => quality() },
  { id: "cacheAware", name: "D · Router consciente de la caché", make: () => cacheAware() },
  { id: "warmOrSwitch", name: "E · Regla de dos líneas", make: () => warmOrSwitch },
];

/**
 * Las cinco estrategias sobre cada workload: el experimento clave del estudio.
 *
 * La estrategia A usa el modelo más barato que cubre la dificultad **máxima** del
 * workload: es la única forma honesta de fijar un modelo en una sesión que exige
 * capacidades distintas, porque un modelo fijo tiene que servir para el peor turno.
 */
export function strategyComparisons(): StrategyComparison[] {
  return WORKLOADS.map((workload) => {
    const turns = workloadTurns(workload);
    const baselineModel = baselineModelFor(workload);
    const fixedRun = run(workload, fixed(baselineModel), POOL, turns);
    const all = [{ id: "fixed", name: `A · Modelo fijo (${baselineModel})`, make: () => fixed(baselineModel) }, ...POLICIES];
    return {
      workload: workload.id,
      workloadName: workload.name,
      description: workload.description,
      prefixTokens: workload.prefixTokens,
      turns: workload.turns,
      runs: all.map(({ id, name, make }) => {
        const result = id === "fixed" ? fixedRun : run(workload, make(), POOL, turns);
        return {
          policy: id,
          policyName: name,
          workload: workload.id,
          total: result.total,
          multipleOfFixed: fixedRun.total > 0 ? result.total / fixedRun.total : 0,
          cacheHitRatio: result.cacheHitRatio,
          switches: result.switches,
          coldPrefixPenalty: result.coldPrefixPenalty,
          cacheReadTokens: result.cacheReadTokens,
          cacheWriteTokens: result.cacheWriteTokens,
        };
      }),
    };
  });
}

export interface SequenceRow {
  id: string;
  name: string;
  pattern: string;
  total: number;
  multipleOfSingle: number;
  cacheHitRatio: number;
  switches: number;
  cacheExpirations: number;
  coldPrefixPenalty: number;
}

/** Los seis patrones de revisita, tal cual, sin router: cuánto cuesta cada uno. */
export function sequenceRows(): SequenceRow[] {
  const workload = WORKLOADS.find((item) => item.id === "medium")!;
  const turns = workload.turns;
  const single = simulateSession({
    prefixTokens: workload.prefixTokens,
    pool: POOL,
    turns: sequenceTurns(SEQUENCES[0], turns, workload.secondsPerTurn),
    defaultSecondsPerTurn: workload.secondsPerTurn,
  });
  return SEQUENCES.map((sequence) => {
    const result = simulateSession({
      prefixTokens: workload.prefixTokens,
      pool: POOL,
      turns: sequenceTurns(sequence, turns, workload.secondsPerTurn),
      defaultSecondsPerTurn: workload.secondsPerTurn,
    });
    return {
      id: sequence.id,
      name: sequence.name,
      pattern: sequence.pattern,
      total: result.total,
      multipleOfSingle: result.total / single.total,
      cacheHitRatio: result.cacheHitRatio,
      switches: result.switches,
      cacheExpirations: result.cacheExpirations,
      coldPrefixPenalty: result.coldPrefixPenalty,
    };
  });
}

export interface BreakEvenRow {
  style: "anthropic" | "freeWrite";
  factor: number;
  /** Turnos necesarios, `0` si el propio turno del cambio ya compensa, `null` si no compensa nunca. */
  turns: number | null;
}

function breakEvenFor(style: "anthropic" | "freeWrite", from: Rates): BreakEvenRow[] {
  return PRICE_FACTORS.map((factor) => {
    const needed = breakEvenTurns({
      prefixTokens: 50_000,
      from,
      to: { ...from, inputUsdPerMTok: factor },
      newInputTokens: 500,
      outputTokens: 400,
    });
    return { style, factor, turns: Number.isFinite(needed) ? needed : null };
  });
}

/**
 * Amortización frente al cociente de precios, con los ratios documentados y con
 * escritura gratuita: la respuesta cambia según quién cobre la escritura.
 */
export function breakEvenRows(): BreakEvenRow[] {
  return [...breakEvenFor("anthropic", ANTHROPIC_STYLE), ...breakEvenFor("freeWrite", { ...ANTHROPIC_STYLE, cacheWriteMultiplier: FREE_WRITE_STYLE.cacheWriteMultiplier })];
}

export interface PoolRow {
  poolSize: number;
  /** Segundos entre dos visitas al mismo linaje, con este tamaño y ritmo. */
  revisitSeconds: number;
  multipleOfSingle: number;
  cacheHitRatio: number;
}

/**
 * Coste frente al tamaño del pool: el acantilado depende de si el linaje se
 * revisita dentro de la ventana del TTL, no del tamaño en sí.
 */
export function poolRows(): PoolRow[] {
  const workload = WORKLOADS.find((item) => item.id === "medium")!;
  const baseline = simulateSession({
    prefixTokens: workload.prefixTokens,
    pool: POOL,
    turns: Array.from({ length: workload.turns }, () => ({ model: REFERENCE_MODEL, newInputTokens: 500, outputTokens: 400, secondsSincePrevious: workload.secondsPerTurn })),
    defaultSecondsPerTurn: workload.secondsPerTurn,
  }).total;
  return POOL_SIZES.map((size) => {
    const models = Array.from({ length: size }, (_, index) => POOL[index % POOL.length]);
    const turns = Array.from({ length: workload.turns }, (_, index) => ({
      model: models[index % models.length].model,
      newInputTokens: 500,
      outputTokens: 400,
      secondsSincePrevious: workload.secondsPerTurn,
    }));
    const result = simulateSession({ prefixTokens: workload.prefixTokens, pool: POOL, turns, defaultSecondsPerTurn: workload.secondsPerTurn });
    return {
      poolSize: size,
      revisitSeconds: size * workload.secondsPerTurn,
      multipleOfSingle: result.total / baseline,
      cacheHitRatio: result.cacheHitRatio,
    };
  });
}

export interface PrefixRow {
  prefixTokens: number;
  cacheable: boolean;
  multipleOfSingle: number;
  coldPrefixPenalty: number;
}

/**
 * Cuánto contexto hace falta para que la caché domine: por debajo del mínimo
 * cacheable del proveedor, alternar modelos sale igual de caro que quedarse.
 */
export function prefixRows(): PrefixRow[] {
  const workload = WORKLOADS.find((item) => item.id === "medium")!;
  const turns = 12;
  return PREFIX_SIZES.map((prefixTokens) => {
    const sticky = simulateSession({
      prefixTokens,
      pool: POOL,
      turns: Array.from({ length: turns }, () => ({ model: REFERENCE_MODEL, newInputTokens: 500, outputTokens: 400, secondsSincePrevious: workload.secondsPerTurn })),
      defaultSecondsPerTurn: workload.secondsPerTurn,
    });
    const alternating = simulateSession({
      prefixTokens,
      pool: POOL,
      turns: Array.from({ length: turns }, (_, index) => ({
        model: index % 2 === 0 ? REFERENCE_MODEL : "balanced-b",
        newInputTokens: 500,
        outputTokens: 400,
        secondsSincePrevious: workload.secondsPerTurn,
      })),
      defaultSecondsPerTurn: workload.secondsPerTurn,
    });
    return {
      prefixTokens,
      cacheable: prefixTokens >= ANTHROPIC_STYLE.cacheMinTokens,
      multipleOfSingle: alternating.total / sticky.total,
      coldPrefixPenalty: alternating.coldPrefixPenalty,
    };
  });
}

export interface PaceRow {
  secondsPerTurn: number;
  cacheHitRatio: number;
  multipleOfSingle: number;
}

/** Impacto del TTL y de la frecuencia del usuario: el mismo patrón a distintos ritmos. */
export function paceRows(): PaceRow[] {
  const workload = WORKLOADS.find((item) => item.id === "medium")!;
  const turns = 20;
  const paces = [10, 30, 60, 150, 300, 600, 1_800];
  const baseline = simulateSession({
    prefixTokens: workload.prefixTokens,
    pool: POOL,
    turns: Array.from({ length: turns }, () => ({ model: REFERENCE_MODEL, newInputTokens: 500, outputTokens: 400, secondsSincePrevious: 30 })),
    defaultSecondsPerTurn: 30,
  }).total;
  return paces.map((secondsPerTurn) => {
    const result = simulateSession({
      prefixTokens: workload.prefixTokens,
      pool: POOL,
      turns: Array.from({ length: turns }, (_, index) => ({
        model: index % 2 === 0 ? REFERENCE_MODEL : "balanced-b",
        newInputTokens: 500,
        outputTokens: 400,
        secondsSincePrevious: secondsPerTurn,
      })),
      defaultSecondsPerTurn: secondsPerTurn,
    });
    return { secondsPerTurn, cacheHitRatio: result.cacheHitRatio, multipleOfSingle: result.total / baseline };
  });
}

export interface TimelineRow {
  model: string;
  warm: boolean;
  cost: number;
  cumulative: number;
  ttlRemainingAtEnd: number;
}

export interface Timeline {
  id: string;
  label: string;
  workload: string;
  prefixTokens: number;
  rows: TimelineRow[];
}

/** Pool de la brecha con el nivel medio a un precio dado frente al pico (1.0). */
function gapPool(cheapPrice: number): Candidate[] {
  // El nivel de capacidad 2 cuesta lo mismo que el pico: cambiar por dificultad no
  // da ninguna ventaja de precio, asi que lo unico en juego es la cache. El nivel
  // trivial es el que se abarata para abrir la brecha.
  return [
    { provider: "anthropic", model: "peak", capability: 3, rates: { ...ANTHROPIC_STYLE, inputUsdPerMTok: 1 } },
    { provider: "anthropic", model: "mid", capability: 2, rates: { ...ANTHROPIC_STYLE, inputUsdPerMTok: 1 } },
    { provider: "anthropic", model: "cheap", capability: 1, rates: { ...ANTHROPIC_STYLE, inputUsdPerMTok: cheapPrice } },
  ];
}

/** Sesiones representativas para el timeline y el ciclo de vida de la caché. */
export function timelines(): Timeline[] {
  const workload = WORKLOADS.find((item) => item.id === "medium")!;
  const turns = workloadTurns(workload);
  const chosen: readonly [string, string, Policy, readonly Candidate[]][] = [
    ["fixed", "A · Modelo fijo", fixed(REFERENCE_MODEL), POOL],
    ["cheapest", "B · El más barato", cheapest, POOL],
    ["cacheAware", "D · Consciente de la caché", cacheAware(), POOL],
    // Mismo precio en los dos niveles: lo único que diferencia a B de D es la caché.
    ["cheapest-same-price", "B · Mismo precio, cambio por turno", cheapest, gapPool(1)],
    ["cacheAware-same-price", "D · Mismo precio, consciente de la caché", cacheAware(), gapPool(1)],
  ];
  return chosen.map(([id, label, policy, pool]) => {
    const result = simulateSession({ prefixTokens: workload.prefixTokens, pool, turns, defaultSecondsPerTurn: workload.secondsPerTurn }, { policy });
    return {
      id,
      label,
      workload: workload.id,
      prefixTokens: workload.prefixTokens,
      rows: result.turns.map((turn) => ({
        model: turn.model,
        warm: turn.warm,
        cost: turn.cost,
        cumulative: turn.cumulative,
        ttlRemainingAtEnd: turn.ttlRemainingAtEnd,
      })),
    };
  });
}

export interface PriceGapRow {
  /** Precio del nivel trivial frente al pico (1.0). El nivel medio siempre cuesta 1.0. */
  midPrice: number;
  cheapest: number;
  loadBalanced: number;
  cacheAware: number;
  rule: number;
  hitCheapest: number;
  hitLoadBalanced: number;
  hitCacheAware: number;
  winner: string;
}

/**
 * El resultado central del estudio: **decide el ancho de la brecha de precios**.
 *
 * Con el nivel de capacidad 2 al mismo precio que el pico, un router por turno
 * cambia de modelo para ahorrar casi nada y paga la reescritura del prefijo. En
 * cuanto la brecha se abre, el ahorro por token domina y gana el mas barato.
 */
export function priceGapRows(): PriceGapRow[] {
  const workload = WORKLOADS.find((item) => item.id === "medium")!;
  const turns = workloadTurns(workload);
  return [1, 0.95, 0.9, 0.85, 0.8, 0.7, 0.6, 0.5, 0.3, 0.2, 0.1].map((midPrice) => {
    const pool = gapPool(midPrice);
    const baseline = run(workload, fixed("peak"), pool, turns).total;
    const cheapestRun = run(workload, cheapest, pool, turns);
    const balancedRun = run(workload, loadBalanced, pool, turns);
    const awareRun = run(workload, cacheAware(), pool, turns);
    const ruleRun = run(workload, warmOrSwitch, pool, turns);
    const cheapestMultiple = cheapestRun.total / baseline;
    const cacheAwareMultiple = awareRun.total / baseline;
    const ruleMultiple = ruleRun.total / baseline;
    const best = Math.min(cheapestMultiple, cacheAwareMultiple, ruleMultiple);
    return {
      midPrice,
      cheapest: cheapestMultiple,
      loadBalanced: balancedRun.total / baseline,
      cacheAware: cacheAwareMultiple,
      rule: ruleMultiple,
      hitCheapest: cheapestRun.cacheHitRatio,
      hitLoadBalanced: balancedRun.cacheHitRatio,
      hitCacheAware: awareRun.cacheHitRatio,
      winner: best === cacheAwareMultiple ? "cacheAware" : best === ruleMultiple ? "rule" : "cheapest",
    };
  });
}

export interface SimulationArtifact {
  generatedBy: string;
  assumptions: {
    baselineModel: string;
    secondsPerTurn: number;
    newInputTokens: number;
    outputTokens: number;
    anthropic: Rates;
    freeWrite: Rates;
  };
  strategies: StrategyComparison[];
  sequences: SequenceRow[];
  breakEven: BreakEvenRow[];
  pools: PoolRow[];
  prefixes: PrefixRow[];
  paces: PaceRow[];
  priceGaps: PriceGapRow[];
  timelines: Timeline[];
}

export function buildSimulation(): SimulationArtifact {
  return {
    generatedBy: "npm run cache-affinity",
    assumptions: {
      baselineModel: REFERENCE_MODEL,
      secondsPerTurn: DEFAULT_SECONDS_PER_TURN,
      newInputTokens: 500,
      outputTokens: 400,
      anthropic: ANTHROPIC_STYLE,
      freeWrite: FREE_WRITE_STYLE,
    },
    strategies: strategyComparisons(),
    sequences: sequenceRows(),
    breakEven: breakEvenRows(),
    pools: poolRows(),
    prefixes: prefixRows(),
    paces: paceRows(),
    priceGaps: priceGapRows(),
    timelines: timelines(),
  };
}
