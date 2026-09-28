/**
 * Secuencias de modelos y workloads. Son los patrones que el estudio tiene que
 * cubrir, expresados como turnos: la diferencia entre un pool grande y un pool
 * revisitable no es el tamaño, es **si cada linaje vuelve a usarse antes de que
 * caduque**, así que lo que se barre son patrones de revisita, no números de pool.
 */
import { ANTHROPIC_STYLE, type Candidate, type SessionTurn } from "./cache-cost.js";

/**
 * Pool declarado: precios **relativos** al precio base de entrada, capacidades y
 * un proveedor por modelo. No son precios de proveedor verificados; son el
 * escenario, y por eso todos los resultados se reportan como múltiplos.
 */
export const POOL: Candidate[] = [
  { provider: "anthropic", model: "frontier-a", capability: 3, rates: { ...ANTHROPIC_STYLE, inputUsdPerMTok: 1 } },
  { provider: "anthropic", model: "balanced-a", capability: 2, rates: { ...ANTHROPIC_STYLE, inputUsdPerMTok: 0.4 } },
  { provider: "anthropic", model: "fast-a", capability: 1, rates: { ...ANTHROPIC_STYLE, inputUsdPerMTok: 0.1 } },
  { provider: "openai", model: "balanced-b", capability: 2, rates: { ...ANTHROPIC_STYLE, inputUsdPerMTok: 0.3 } },
  { provider: "openai", model: "fast-b", capability: 1, rates: { ...ANTHROPIC_STYLE, inputUsdPerMTok: 0.05 } },
  { provider: "google", model: "frontier-c", capability: 3, rates: { ...ANTHROPIC_STYLE, inputUsdPerMTok: 0.9 } },
  { provider: "google", model: "balanced-c", capability: 2, rates: { ...ANTHROPIC_STYLE, inputUsdPerMTok: 0.35 } },
  { provider: "google", model: "fast-c", capability: 1, rates: { ...ANTHROPIC_STYLE, inputUsdPerMTok: 0.08 } },
];

/** Escritura de caché gratuita: el caso OpenAI/Gemini, que cambia el resultado. */
export const FREE_WRITE_POOL: Candidate[] = POOL.map((candidate) => ({
  ...candidate,
  rates: { ...candidate.rates, cacheWriteMultiplier: 1 },
}));

/** Ritmo de turnos que corresponde al TTL de 5 minutos: uno cada 30 s. */
export const DEFAULT_SECONDS_PER_TURN = 30;

export interface NamedSequence {
  id: string;
  name: string;
  /** Etiqueta corta por turno, para el timeline del informe. */
  pattern: string;
  /** Modelos por turno, ciclando el patrón. */
  models: readonly string[];
}

/**
 * Los seis patrones de revisita. `A B A B` mantiene los dos linajes tibios si el
 * TTL aguanta; `A B C D` no revisita ninguno dentro de la ventana.
 */
export const SEQUENCES: NamedSequence[] = [
  { id: "all-a", name: "Siempre el mismo", pattern: "A A A A A A", models: ["balanced-a"] },
  { id: "ab", name: "Dos alternos", pattern: "A B A B A B", models: ["balanced-a", "balanced-b"] },
  { id: "abc", name: "Tres en ciclo", pattern: "A B C A B C", models: ["balanced-a", "balanced-b", "balanced-c"] },
  { id: "aabaa", name: "Repite antes de volver", pattern: "A A B A A", models: ["balanced-a", "balanced-a", "balanced-b"] },
  { id: "abcda", name: "Cuatro sin repetir", pattern: "A B C D A", models: ["frontier-a", "balanced-a", "balanced-b", "balanced-c", "fast-c"] },
  { id: "abbba", name: "Ráfaga y vuelta", pattern: "A B B B A", models: ["balanced-a", "balanced-b", "balanced-b", "balanced-b", "balanced-a"] },
];

export function sequenceTurns(sequence: NamedSequence, count: number, secondsPerTurn = DEFAULT_SECONDS_PER_TURN): SessionTurn[] {
  return Array.from({ length: count }, (_, index) => ({
    model: sequence.models[index % sequence.models.length],
    newInputTokens: 500,
    outputTokens: 400,
    secondsSincePrevious: secondsPerTurn,
  }));
}

export interface Workload {
  id: string;
  name: string;
  description: string;
  prefixTokens: number;
  turns: number;
  secondsPerTurn: number;
  /**
   * Dificultad exigida por turno, ciclada. Es un **supuesto declarado**, no una
   * medida: sin mezcla de dificultad, un router por turno elige siempre el mismo
   * modelo y el problema que estudiamos no aparece.
   */
  capabilityPattern: readonly number[];
  /** Cada cuántos turnos entra contenido volátil por delante del breakpoint. */
  volatileEvery?: number;
}

/** Mezcla realista de una sesión de código: mayoría de trabajo normal, picos y tareas triviales. */
const MIXED = [2, 2, 1, 3, 2, 2, 1, 2, 3, 2, 2, 1] as const;
/** Control: una sesión sin picos de dificultad, donde ningún router por turno cambiaría. */
const UNIFORM = [2] as const;

/** Los workloads pedidos: tres tamaños de repo, agente intensivo en tools y pausas. */
export const WORKLOADS: Workload[] = [
  { id: "small", name: "Repo pequeño", description: "10K de contexto, 20 turnos seguidos y dificultad uniforme: el control donde ningún router cambia de modelo.", prefixTokens: 10_000, turns: 20, secondsPerTurn: 30, capabilityPattern: UNIFORM },
  { id: "medium", name: "Repo medio", description: "40K de contexto, 30 turnos con picos de dificultad.", prefixTokens: 40_000, turns: 30, secondsPerTurn: 30, capabilityPattern: MIXED },
  { id: "large", name: "Repo grande", description: "100K de contexto, 40 turnos con picos de dificultad.", prefixTokens: 100_000, turns: 40, secondsPerTurn: 30, capabilityPattern: MIXED },
  { id: "tools", name: "Agente intensivo en tools", description: "60K de contexto, 30 turnos con picos, y contenido volátil por delante del breakpoint cada 5 turnos.", prefixTokens: 60_000, turns: 30, secondsPerTurn: 30, capabilityPattern: MIXED, volatileEvery: 5 },
  { id: "pauses", name: "Sesión con pausas", description: "50K de contexto, 20 turnos donde el usuario desaparece entre 30 s y 30 min.", prefixTokens: 50_000, turns: 20, secondsPerTurn: 30, capabilityPattern: MIXED },
  { id: "short-prompts", name: "Prompts cortos", description: "500 tokens de contexto: por debajo del mínimo cacheable de todos los proveedores.", prefixTokens: 500, turns: 20, secondsPerTurn: 30, capabilityPattern: MIXED },
];

/** Pausas declaradas para el workload con huecos, en segundos. */
export const PAUSE_SECONDS = [30, 120, 300, 600, 1_800];

export function workloadTurns(workload: Workload): SessionTurn[] {
  const capability = (index: number) => workload.capabilityPattern[index % workload.capabilityPattern.length];
  if (workload.id === "pauses") {
    return Array.from({ length: workload.turns }, (_, index) => ({
      newInputTokens: 500,
      outputTokens: 400,
      secondsSincePrevious: PAUSE_SECONDS[index % PAUSE_SECONDS.length],
      minCapability: capability(index),
    }));
  }
  return Array.from({ length: workload.turns }, (_, index) => ({
    newInputTokens: 500,
    outputTokens: 400,
    secondsSincePrevious: workload.secondsPerTurn,
    minCapability: capability(index),
    volatile: workload.volatileEvery !== undefined && index > 0 && index % workload.volatileEvery === 0,
  }));
}

/** Cociente de precios de entrada frente al modelo de referencia del pool. */
export const PRICE_FACTORS = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1] as const;

/** Tamaños de pool para el barrido: el acantilado depende de la ventana del TTL. */
export const POOL_SIZES = [1, 2, 4, 6, 8, 10, 12, 16] as const;

/** Prefijos del barrido de contexto: cuánto contexto hace falta para que la caché domine. */
export const PREFIX_SIZES = [500, 1_024, 4_096, 10_000, 40_000, 100_000, 150_000] as const;
