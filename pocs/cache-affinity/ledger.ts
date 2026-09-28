/**
 * Estado de caché del router, explícito y exportable.
 *
 * El prompt original pedía un `ModelCacheState` con `cacheHitProbability` y
 * `cache_ttl_remaining`. Ese dato **no es observable**: ningún proveedor lo
 * expone antes de la petición; lo que devuelve es `cached_tokens` después. Así
 * que el router solo puede llevar su propio registro: qué dominio calentó,
 * cuándo lo usó por última vez y cuánto asume que dura. Esto es ese registro.
 *
 * Un dominio de caché es `proveedor:modelo:hashDelPrefijo`. Separar el hash
 * importa: si el prefijo se contamina por delante del breakpoint, la entrada
 * deja de valer aunque el modelo no haya cambiado.
 */
import type { Rates } from "./cache-cost.js";

export interface CacheDomain {
  provider: string;
  model: string;
  /** Huella del prefijo estable que se cacheó. */
  contextHash: string;
}

export interface CacheEntry {
  domain: CacheDomain;
  /** Tokens del prefijo que quedaron escritos en este dominio. 0 si no es cacheable. */
  cachedTokens: number;
  /** `false` cuando el prefijo no llega al mínimo cacheable del proveedor. */
  cacheable: boolean;
  createdAt: number;
  /** Última lectura o escritura. Es lo que renueva el TTL. */
  lastUsedAt: number;
  ttlSeconds: number;
  rates: Rates;
}

export function cacheKey(domain: CacheDomain): string {
  return `${domain.provider}:${domain.model}:${domain.contextHash}`;
}

/** `true` mientras la entrada esté viva. El borde del TTL es exclusivo. */
export function isWarm(entry: CacheEntry, nowSeconds: number): boolean {
  return entry.cacheable && nowSeconds - entry.lastUsedAt < entry.ttlSeconds;
}

export function ttlRemainingSeconds(entry: CacheEntry, nowSeconds: number): number {
  return Math.max(0, entry.ttlSeconds - (nowSeconds - entry.lastUsedAt));
}

/**
 * Coste de reescribir el prefijo entero desde cero. Es el `switchingCost` que el
 * prompt pedía como término explícito: el sobrecoste de un dominio frío.
 */
export function recreationCost(entry: CacheEntry): number {
  return entry.cachedTokens * entry.rates.cacheWriteMultiplier * entry.rates.inputUsdPerMTok / 1e6;
}

export function createEntry(input: {
  domain: CacheDomain;
  cachedTokens: number;
  rates: Rates;
  nowSeconds: number;
}): CacheEntry {
  const cacheable = input.cachedTokens >= input.rates.cacheMinTokens;
  return {
    domain: input.domain,
    cachedTokens: cacheable ? input.cachedTokens : 0,
    cacheable,
    createdAt: input.nowSeconds,
    lastUsedAt: input.nowSeconds,
    ttlSeconds: input.rates.cacheTtlSeconds,
    rates: input.rates,
  };
}
