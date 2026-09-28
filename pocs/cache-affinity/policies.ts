/**
 * Las cinco estrategias comparadas. Todas son funciones puras
 * `(PolicyContext) => model`, así que la misma sesión se puede reEjecutar con
 * cada una y comparar peras con peras.
 *
 * A y B y C son los routers "tradicionales" (no miran el ledger). D es el router
 * consciente del estado de caché. E existe para poner a prueba a D: si una regla
 * de dos líneas captura casi todo el beneficio, la heurística no se justifica.
 */
import { cacheKey, isWarm } from "./ledger.js";
import { priceTurn, projectTurnCost, type Candidate, type Policy, type PolicyContext } from "./cache-cost.js";

/** A · Estrategia fija: un solo modelo toda la sesión. Baseline. */
export function fixed(model: string): Policy {
  return () => model;
}

function eligible(context: PolicyContext): Candidate[] {
  const required = context.turn.minCapability ?? 0;
  const allowed = context.pool.filter((candidate) => candidate.capability >= required);
  // Fail-open: si el pool no cubre la capacidad exigida, se considera todo el pool
  // en vez de dejar la sesión sin candidatos.
  return allowed.length ? allowed : [...context.pool];
}

/** El más barato por precio de lista, sin mirar el ledger. */
function cheapestByListPrice(candidates: readonly Candidate[]): Candidate {
  return [...candidates].sort((left, right) => left.rates.inputUsdPerMTok - right.rates.inputUsdPerMTok || left.model.localeCompare(right.model))[0];
}

/**
 * B · El más barato que cubre la capacidad exigida. Asume que cada petición es
 * independiente: ignora por completo el estado de caché.
 */
export const cheapest: Policy = (context) => cheapestByListPrice(eligible(context)).model;

/**
 * C · Router de calidad y precio: entre los que cubren la capacidad exigida **con
 * margen de seguridad**, el de menor coste proyectado ignorando la caché. El
 * margen es lo que lo distingue de B: no se fía de la clasificación de dificultad
 * por turno y sobreaprovisiona capacidad, con lo que paga más modelos.
 */
export function quality(options: { safetyMargin?: number } = {}): Policy {
  const safetyMargin = options.safetyMargin ?? 1;
  return (context) => {
    const { turn, prefixTokens } = context;
    const required = (turn.minCapability ?? 0) + safetyMargin;
    const allowed = context.pool.filter((candidate) => candidate.capability >= required);
    const candidates = allowed.length ? allowed : eligible(context);
    return [...candidates].sort((left, right) => {
      const cost = (candidate: Candidate) => priceTurn({
        rates: candidate.rates,
        readTokens: 0,
        writeTokens: prefixTokens,
        inputTokens: turn.newInputTokens,
        outputTokens: turn.outputTokens,
      });
      return cost(left) - cost(right) || left.capability - right.capability || left.model.localeCompare(right.model);
    })[0].model;
  };
}

/**
 * E · Regla simple de dos líneas: quédate en el modelo actual mientras su caché
 * siga viva; si se ha enfriado, cambia al más barato elegible.
 *
 * No hay pesos, ni puntuaciones, ni horizonte. Es el rival a batir de D.
 */
export const warmOrSwitch: Policy = (context) => {
  const { currentModel, pool, ledger, nowSeconds } = context;
  if (currentModel) {
    const candidate = pool.find((item) => item.model === currentModel);
    const entry = candidate && ledger.get(cacheKey({ provider: candidate.provider, model: candidate.model, contextHash: contextHashOf(context) }));
    if (candidate && entry && isWarm(entry, nowSeconds) && candidate.capability >= (context.turn.minCapability ?? 0)) {
      return candidate.model;
    }
  }
  return cheapestByListPrice(eligible(context)).model;
};

function contextHashOf(context: PolicyContext): string {
  // El hash vive en el dominio de cada entrada; todas las entradas de una sesión
  // comparten el mismo prefijo, así que basta con leerlo de una entrada viva.
  const first = context.ledger.values().next();
  return first.done ? "prefix" : first.value.domain.contextHash;
}

/**
 * D · Router consciente de la caché.
 *
 * Para cada candidato elegible calcula el coste **proyectado de este turno** con
 * el ledger (tibio o frío) y le resta el **crédito por preservación**: quedarse
 * en el modelo actual renueva su caché y evita reescribirla en el siguiente
 * turno, así que vale lo que costaría volver a crearla repartido entre los
 * turnos que se espera seguir en él.
 *
 * Es deliberadamente simple: un paso de horizonte, sin pesos libres. Si el
 * crédito no supera la diferencia de precio, se cambia.
 */
export function cacheAware(options: {
  /** Turnos que se espera seguir en el modelo elegido si se cambia. */
  expectedFutureTurns?: number;
  /** Probabilidad declarada de volver al modelo que se abandona dentro de su TTL. */
  reuseProbability?: number;
} = {}): Policy {
  const horizon = options.expectedFutureTurns ?? 3;
  const reuseProbability = options.reuseProbability ?? 0.5;
  return (context) => {
    const { turn, prefixTokens, ledger, nowSeconds } = context;
    const required = turn.minCapability ?? 0;
    const hash = contextHashOf(context);
    const current = context.currentModel === undefined ? undefined : context.pool.find((item) => item.model === context.currentModel);
    const currentEntry = current ? ledger.get(cacheKey({ provider: current.provider, model: current.model, contextHash: hash })) : undefined;
    const currentWarm = currentEntry !== undefined && isWarm(currentEntry, nowSeconds);

    const ranked = eligible(context).map((candidate) => {
      const domain = { provider: candidate.provider, model: candidate.model, contextHash: hash };
      const projected = projectTurnCost({
        candidate, ledger, domain, nowSeconds, prefixTokens,
        newInputTokens: turn.newInputTokens, outputTokens: turn.outputTokens,
      });
      const leaving = current !== undefined && candidate.model !== current.model;
      // Coste esperado de abandonar una cache tibia: si volvemos dentro de su TTL
      // habra que reescribirla, ponderado por la probabilidad declarada de volver.
      const abandonPenalty = leaving && currentWarm && currentEntry && current
        ? reuseProbability * currentEntry.cachedTokens * (current.rates.cacheWriteMultiplier - current.rates.cacheReadMultiplier) * current.rates.inputUsdPerMTok / 1e6
        : 0;
      // Compromiso con horizonte: si nos quedamos en este modelo, los siguientes
      // turnos se leen a su precio de lectura.
      const committedFutureCost = (horizon - 1) * priceTurn({
        rates: candidate.rates, readTokens: prefixTokens, writeTokens: turn.newInputTokens,
        inputTokens: 0, outputTokens: turn.outputTokens,
      });
      const capabilityPenalty = Math.max(0, required - candidate.capability) * 1e9;
      return { candidate, score: projected.cost + abandonPenalty + committedFutureCost + capabilityPenalty };
    });

    return ranked.sort((left, right) => left.score - right.score || left.candidate.model.localeCompare(right.candidate.model))[0].candidate.model;
  };
}

/**
 * B' · El mas barato con reparto de carga entre candidatos equivalentes.
 *
 * Es el router inestable que usan de verdad los gateways: rota entre los
 * candidatos elegibles para repartir tasa de uso, sin mirar si alguno tiene la
 * cache caliente. Su asignacion de modelo a dificultad no es estable, y por eso
 * destruye cache aunque no tenga ningun incentivo de precio.
 */
export const loadBalanced: Policy = (context) => {
  const pool = eligible(context);
  return pool[context.turnIndex % pool.length].model;
};

export const POLICIES = {
  fixed: (model: string) => fixed(model),
  cheapest,
  loadBalanced,
  quality,
  cacheAware,
  warmOrSwitch,
};
