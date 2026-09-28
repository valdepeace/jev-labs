/**
 * Modelo de coste de caché de prompt por turno, para comparar estrategias de
 * routing en sesiones de agente de código.
 *
 * Todo se expresa en múltiplos del precio base de entrada, que es el dato que
 * documenta cada proveedor, en vez de fijar precios por modelo que envejecen mal.
 *
 *   prefijo_t = P0 + Σ_{i<t} U_i              # system + tools + historial
 *   turno t:  lee min(caché_dominio, prefijo_t)    a precio de lectura
 *             escribe (prefijo_t − leído)          a precio de escritura
 *             paga U_t a entrada completa, O_t a salida
 *   después:  caché_dominio = prefijo_{t+1}    # dominio = proveedor:modelo:hash
 *
 * Decisiones de modelado que cambian el resultado, todas declaradas:
 *  - El TTL corre en **reloj**, no en turnos: un turno lento o una pausa del
 *    usuario matan la caché igual que un cambio de modelo.
 *  - Por debajo de `cacheMinTokens` no hay caché, así que en prompts cortos el
 *    routing por turno no pierde nada.
 *  - Un turno `volatile` (un diff, una salida de tests, un timestamp por delante
 *    del breakpoint) invalida **todas** las entradas, también las del modelo fijo.
 *
 * Puro y sin red: se puede testear y publicar sin credenciales.
 */
import { cacheKey, createEntry, isWarm, ttlRemainingSeconds, type CacheEntry, type CacheDomain } from "./ledger.js";

/** Multiplicadores respecto al precio base de entrada del modelo. */
export interface Rates {
  /** Precio base de entrada, en USD por millón de tokens. Solo da escala. */
  inputUsdPerMTok: number;
  /** Multiplicador de salida (los modelos de código suelen estar entre 4x y 5x). */
  outputMultiplier: number;
  /** Multiplicador de escritura de caché. Documentado: 1.25x en Anthropic 5 min. */
  cacheWriteMultiplier: number;
  /** Multiplicador de lectura de caché. Documentado: 0.1x. */
  cacheReadMultiplier: number;
  /** Prefijo mínimo cacheable del proveedor. Por debajo, no se cachea nada. */
  cacheMinTokens: number;
  /** Vida de una entrada de caché, en segundos. */
  cacheTtlSeconds: number;
}

/**
 * Anthropic, TTL de 5 minutos: escritura 1.25x, lectura 0.1x. El mínimo cacheable
 * real varía por modelo (512–4.096 tokens según la familia); se usa 1.024 como
 * valor representativo y declarado.
 */
export const ANTHROPIC_STYLE: Rates = {
  inputUsdPerMTok: 1, outputMultiplier: 4, cacheWriteMultiplier: 1.25, cacheReadMultiplier: 0.1,
  cacheMinTokens: 1_024, cacheTtlSeconds: 300,
};

/** Proveedores cuya escritura de caché es gratis (misma entrada, lectura 0.1x). */
export const FREE_WRITE_STYLE: Rates = {
  inputUsdPerMTok: 1, outputMultiplier: 4, cacheWriteMultiplier: 1, cacheReadMultiplier: 0.1,
  cacheMinTokens: 1_024, cacheTtlSeconds: 300,
};

/** Un modelo disponible para el router, con su capacidad y sus tarifas. */
export interface Candidate {
  provider: string;
  model: string;
  /** Nivel de capacidad: solo se elige si cubre el mínimo que exige el turno. */
  capability: number;
  rates: Rates;
}

export interface SessionTurn {
  /** Modelo explícito. Se ignora si la sesión corre con una política. */
  model?: string;
  /** Tokens de entrada nuevos de este turno (el delta, no el prefijo). */
  newInputTokens: number;
  outputTokens: number;
  /** Segundos transcurridos desde el turno anterior. Por defecto, el ritmo de la sesión. */
  secondsSincePrevious?: number;
  /** Contenido volátil por delante del breakpoint: invalida todas las entradas. */
  volatile?: boolean;
  /** Capacidad mínima que exige el turno. Por defecto, 0 (cualquier modelo vale). */
  minCapability?: number;
}

export interface SessionConfig {
  /** Prefijo estable del primer turno: system prompt + definiciones de herramientas. */
  prefixTokens: number;
  /** Huella del prefijo, para el dominio de caché. */
  contextHash?: string;
  pool: readonly Candidate[];
  /** Ritmo por defecto entre turnos, en segundos. */
  defaultSecondsPerTurn?: number;
  turns: readonly SessionTurn[];
}

/** Contexto que ve una política en cada turno. */
export interface PolicyContext {
  turnIndex: number;
  nowSeconds: number;
  prefixTokens: number;
  pool: readonly Candidate[];
  ledger: ReadonlyMap<string, CacheEntry>;
  turn: SessionTurn;
  currentModel?: string;
  /** Segundos por turno de la sesión, para estimar el valor de renovar una caché. */
  secondsPerTurn: number;
}

export type Policy = (context: PolicyContext) => string;

export interface TurnCost {
  index: number;
  model: string;
  provider: string;
  domainKey: string;
  /** true si este turno estrena modelo respecto al anterior. */
  switched: boolean;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  cumulative: number;
  /** Caché del dominio al entrar en el turno. */
  warm: boolean;
  /** Había una entrada para el dominio pero ya había caducado. */
  expired: boolean;
  ttlRemainingAtStart: number;
  ttlRemainingAtEnd: number;
  /**
   * Sobrecoste de no poder leer el prefijo: escribir a precio de escritura lo que
   * habría costado leer a precio de lectura. Es el `switchingPenalty` que pedía
   * el prompt, generalizado: lo pagan igual un cambio de modelo, una caducidad
   * del TTL y una contaminación del prefijo. 0 en el primer turno (no había nada
   * que perder) y 0 si el prefijo no llega al mínimo cacheable.
   */
  coldPrefixPenalty: number;
  atSeconds: number;
  volatile: boolean;
}

export interface SessionResult {
  turns: TurnCost[];
  total: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  switches: number;
  /** Entradas distintas de caché vivas al final (una por dominio usado). */
  cacheEntries: number;
  /** Turnos que encontraron caché viva. */
  cacheHitTurns: number;
  /** Turnos con caché viva sobre el total: la tasa de acierto del modelo. */
  cacheHitRatio: number;
  /** Turnos que encontraron una entrada caducada. */
  cacheExpirations: number;
  /** Turnos que contaminaron el prefijo. */
  volatileTurns: number;
  /** Suma del sobrecoste de no poder leer el prefijo en toda la sesión. */
  coldPrefixPenalty: number;
}

const DEFAULT_SECONDS_PER_TURN = 30;

/** Precio de un turno con sus cuatro sumandos. */
export function priceTurn(input: { rates: Rates; readTokens: number; writeTokens: number; inputTokens: number; outputTokens: number }): number {
  const { rates, readTokens, writeTokens, inputTokens, outputTokens } = input;
  return (
    readTokens * rates.cacheReadMultiplier +
    writeTokens * rates.cacheWriteMultiplier +
    inputTokens +
    outputTokens * rates.outputMultiplier
  ) * rates.inputUsdPerMTok / 1e6;
}

function candidateFor(config: SessionConfig, model: string): Candidate {
  const found = config.pool.find((candidate) => candidate.model === model);
  if (!found) throw new Error(`model is not in the pool: ${model}`);
  return found;
}

function domainFor(config: SessionConfig, candidate: Candidate): CacheDomain {
  return { provider: candidate.provider, model: candidate.model, contextHash: config.contextHash ?? "prefix" };
}

/**
 * Coste proyectado de atender este turno con `candidate`, dado el ledger. Es la
 * función que necesitan las políticas para decidir sin ver el futuro.
 */
export function projectTurnCost(input: {
  candidate: Candidate;
  ledger: ReadonlyMap<string, CacheEntry>;
  domain: CacheDomain;
  nowSeconds: number;
  prefixTokens: number;
  newInputTokens: number;
  outputTokens: number;
}): { cost: number; readTokens: number; writeTokens: number; warm: boolean } {
  const { candidate, ledger, domain, nowSeconds, prefixTokens, newInputTokens, outputTokens } = input;
  const entry = ledger.get(cacheKey(domain));
  const warm = entry !== undefined && isWarm(entry, nowSeconds);
  const readTokens = warm ? Math.min(entry.cachedTokens, prefixTokens) : 0;
  const writeTokens = prefixTokens - readTokens;
  return {
    cost: priceTurn({ rates: candidate.rates, readTokens, writeTokens, inputTokens: newInputTokens, outputTokens }),
    readTokens,
    writeTokens,
    warm,
  };
}

export interface SimulateOptions {
  /** Si se da, la política elige el modelo de cada turno. */
  policy?: Policy;
}

/**
 * Simula la sesión y devuelve el coste por turno. El prefijo crece con lo ya
 * enviado, así que mantenerse en un modelo no sale gratis: solo sale barato.
 */
export function simulateSession(config: SessionConfig, options: SimulateOptions = {}): SessionResult {
  if (config.prefixTokens < 0) throw new Error("prefixTokens must be >= 0");
  if (config.pool.length === 0) throw new Error("pool must not be empty");

  const secondsPerTurn = config.defaultSecondsPerTurn ?? DEFAULT_SECONDS_PER_TURN;
  const ledger = new Map<string, CacheEntry>();
  const turns: TurnCost[] = [];
  let prefix = config.prefixTokens;
  let now = 0;
  let cumulative = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let switches = 0;
  let cacheHitTurns = 0;
  let cacheExpirations = 0;
  let volatileTurns = 0;
  let coldPrefixPenaltyTotal = 0;
  let currentModel: string | undefined;

  config.turns.forEach((turn, index) => {
    now += turn.secondsSincePrevious ?? secondsPerTurn;
    if (turn.volatile) {
      ledger.clear();
      volatileTurns++;
    }

    const model = options.policy
      ? options.policy({ turnIndex: index, nowSeconds: now, prefixTokens: prefix, pool: config.pool, ledger, turn, currentModel, secondsPerTurn })
      : turn.model;
    if (!model) throw new Error(`turn ${index} has no model and no policy is set`);

    const candidate = candidateFor(config, model);
    const domain = domainFor(config, candidate);
    const key = cacheKey(domain);
    const entry = ledger.get(key);
    const warm = entry !== undefined && isWarm(entry, now);
    const expired = entry !== undefined && !warm;
    const ttlRemainingAtStart = entry === undefined ? 0 : ttlRemainingSeconds(entry, now);
    const read = warm ? Math.min(entry.cachedTokens, prefix) : 0;
    const write = prefix - read;

    const cost = priceTurn({ rates: candidate.rates, readTokens: read, writeTokens: write, inputTokens: turn.newInputTokens, outputTokens: turn.outputTokens });
    cumulative += cost;
    cacheReadTokens += read;
    cacheWriteTokens += write;
    if (warm) cacheHitTurns++;
    if (expired) cacheExpirations++;

    const switched = currentModel !== undefined && currentModel !== candidate.model;
    if (switched) switches++;
    const cacheable = prefix >= candidate.rates.cacheMinTokens;
    // El primer turno no tenía nada que perder: no se le cobra penalización.
    const coldPrefixPenalty = index > 0 && cacheable
      ? write * (candidate.rates.cacheWriteMultiplier - candidate.rates.cacheReadMultiplier) * candidate.rates.inputUsdPerMTok / 1e6
      : 0;
    coldPrefixPenaltyTotal += coldPrefixPenalty;

    const refreshedTokens = prefix + turn.newInputTokens;
    ledger.set(key, warm
      ? { ...entry, cachedTokens: refreshedTokens, lastUsedAt: now }
      : createEntry({ domain, cachedTokens: refreshedTokens, rates: candidate.rates, nowSeconds: now }));
    const after = ledger.get(key)!;

    turns.push({
      index,
      model: candidate.model,
      provider: candidate.provider,
      domainKey: key,
      switched,
      cacheReadTokens: read,
      cacheWriteTokens: write,
      inputTokens: turn.newInputTokens,
      outputTokens: turn.outputTokens,
      cost,
      cumulative,
      warm,
      expired,
      ttlRemainingAtStart,
      ttlRemainingAtEnd: ttlRemainingSeconds(after, now),
      coldPrefixPenalty,
      atSeconds: now,
    });
    prefix = refreshedTokens;
    currentModel = candidate.model;
  });

  return {
    turns,
    total: cumulative,
    cacheReadTokens,
    cacheWriteTokens,
    switches,
    cacheEntries: ledger.size,
    cacheHitTurns,
    cacheHitRatio: turns.length ? cacheHitTurns / turns.length : 0,
    cacheExpirations,
    volatileTurns,
    coldPrefixPenalty: coldPrefixPenaltyTotal,
  };
}

/** Coste de un turno en régimen tibio, sin cambio de modelo. */
function warmTurnCost(rates: Rates, prefix: number, newInputTokens: number, outputTokens: number): number {
  return priceTurn({ rates, readTokens: prefix, writeTokens: 0, inputTokens: newInputTokens, outputTokens });
}

/**
 * Turnos que hay que quedarse en el modelo nuevo para que el cambio amortice,
 * contando desde el turno del cambio. `0` si el propio turno del cambio ya sale
 * más barato que haberse quedado en el modelo viejo; `Infinity` si el modelo
 * nuevo no es más barato por turno y la escritura nunca se recupera.
 *
 * Aproximación de prefijo largo: T ≈ (w·f − r) / (r·(1 − f)), con `w` y `r` los
 * multiplicadores de escritura y lectura y `f` el cociente de precios. El
 * redondeo a turnos se hace sobre el modelo, no sobre la fórmula.
 */
export function breakEvenTurns(input: {
  prefixTokens: number;
  from: Rates;
  to: Rates;
  newInputTokens: number;
  outputTokens: number;
}): number {
  const { prefixTokens, from, to, newInputTokens, outputTokens } = input;
  const stayWarm = warmTurnCost(from, prefixTokens, newInputTokens, outputTokens);
  const switchTurn = priceTurn({ rates: to, readTokens: 0, writeTokens: prefixTokens, inputTokens: newInputTokens, outputTokens });
  if (switchTurn <= stayWarm) return 0;

  const savingPerTurn = stayWarm - warmTurnCost(to, prefixTokens, newInputTokens, outputTokens);
  if (savingPerTurn <= 0) return Infinity;

  // El turno del cambio ya se ha pagado: cuenta como el primero.
  return Math.ceil((switchTurn - stayWarm) / savingPerTurn);
}
