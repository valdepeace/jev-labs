/**
 * Modelo de coste de caché de prompt por turno, para comparar sesiones de agente
 * de código en las que el router puede cambiar de modelo entre turnos.
 *
 * Todo se expresa en múltiplos del precio base de entrada, que es el dato que
 * documenta cada proveedor, en vez de fijar precios por modelo que envejecen mal.
 *
 *   prefijo_t = P0 + Σ_{i<t} U_i          # system + tools + historial enviado
 *   turno t:  lee min(caché[m], prefijo_t)   a precio de lectura
 *             escribe (prefijo_t − leído)    a precio de escritura
 *             paga U_t a entrada completa, O_t a salida
 *   después:  caché[m] = prefijo_{t+1}    # por modelo: cada modelo tiene su linaje
 *
 * Puro y sin red: se puede testear y publicar sin credenciales.
 */

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
}

/** Anthropic, TTL de 5 minutos: escritura 1.25x, lectura 0.1x. */
export const ANTHROPIC_STYLE: Rates = { inputUsdPerMTok: 1, outputMultiplier: 4, cacheWriteMultiplier: 1.25, cacheReadMultiplier: 0.1 };

/** Proveedores cuya escritura de caché es gratis (misma entrada, lectura 0.1x). */
export const FREE_WRITE_STYLE: Rates = { inputUsdPerMTok: 1, outputMultiplier: 4, cacheWriteMultiplier: 1, cacheReadMultiplier: 0.1 };

export interface SessionTurn {
  model: string;
  /** Tokens de entrada nuevos de este turno (el delta, no el prefijo). */
  newInputTokens: number;
  outputTokens: number;
}

export interface SessionConfig {
  /** Prefijo estable del primer turno: system prompt + definiciones de herramientas. */
  prefixTokens: number;
  rates: Record<string, Rates>;
  /** Turnos de inactividad tras los que la entrada de caché de un modelo caduca. */
  cacheTtlTurns: number;
  turns: readonly SessionTurn[];
}

export interface TurnCost {
  index: number;
  model: string;
  /** true si este turno estrena modelo respecto al anterior. */
  switched: boolean;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  cumulative: number;
}

export interface SessionResult {
  turns: TurnCost[];
  total: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  switches: number;
  /** Entradas distintas de caché vivas al final (una por modelo usado). */
  cacheEntries: number;
}

interface CacheEntry {
  tokens: number;
  lastUsedTurn: number;
}

function ratesFor(config: SessionConfig, model: string): Rates {
  const rates = config.rates[model];
  if (!rates) throw new Error(`no rates for model: ${model}`);
  return rates;
}

function turnCost(rates: Rates, read: number, write: number, input: number, output: number): number {
  return (read * rates.cacheReadMultiplier + write * rates.cacheWriteMultiplier + input + output * rates.outputMultiplier) * rates.inputUsdPerMTok / 1e6;
}

/**
 * Simula la sesión y devuelve el coste por turno. El prefijo crece con lo ya
 * enviado, así que mantenerse en un modelo no sale gratis: solo sale barato.
 */
export function simulateSession(config: SessionConfig): SessionResult {
  if (config.prefixTokens < 0) throw new Error("prefixTokens must be >= 0");
  if (config.cacheTtlTurns < 1) throw new Error("cacheTtlTurns must be >= 1");

  const cache = new Map<string, CacheEntry>();
  const turns: TurnCost[] = [];
  let prefix = config.prefixTokens;
  let cumulative = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let switches = 0;

  config.turns.forEach((turn, index) => {
    const rates = ratesFor(config, turn.model);
    const entry = cache.get(turn.model);
    const fresh = entry !== undefined && index - entry.lastUsedTurn < config.cacheTtlTurns;
    const read = fresh ? Math.min(entry.tokens, prefix) : 0;
    const write = prefix - read;

    const cost = turnCost(rates, read, write, turn.newInputTokens, turn.outputTokens);
    cumulative += cost;
    cacheReadTokens += read;
    cacheWriteTokens += write;
    cache.set(turn.model, { tokens: prefix + turn.newInputTokens, lastUsedTurn: index });

    const previous = turns[index - 1];
    const switched = previous !== undefined && previous.model !== turn.model;
    if (switched) switches++;

    turns.push({
      index,
      model: turn.model,
      switched,
      cacheReadTokens: read,
      cacheWriteTokens: write,
      inputTokens: turn.newInputTokens,
      outputTokens: turn.outputTokens,
      cost,
      cumulative,
    });
    prefix += turn.newInputTokens;
  });

  return { turns, total: cumulative, cacheReadTokens, cacheWriteTokens, switches, cacheEntries: cache.size };
}

/** Coste de un turno en régimen tibio, sin cambio de modelo. */
function warmTurnCost(rates: Rates, prefix: number, newInputTokens: number, outputTokens: number): number {
  return turnCost(rates, prefix, 0, newInputTokens, outputTokens);
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
  const switchTurn = turnCost(to, 0, prefixTokens, newInputTokens, outputTokens);
  if (switchTurn <= stayWarm) return 0;

  const savingPerTurn = stayWarm - warmTurnCost(to, prefixTokens, newInputTokens, outputTokens);
  if (savingPerTurn <= 0) return Infinity;

  // El turno del cambio ya se ha pagado: cuenta como el primero.
  return Math.ceil((switchTurn - stayWarm) / savingPerTurn);
}
