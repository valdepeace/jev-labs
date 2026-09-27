/**
 * Subconjunto de MODEL_POOL organizao por proveedor y tier de precio
 * (expensive/medium/cheap), pa comparar si Jev distingue entre el modelo
 * más caro y el más barato del MISMO proveedor según la dificultad de la
 * pregunta. Fase 1: solo Anthropic, OpenAI y Google. Los proveedores
 * chinos (DeepSeek, Qwen, Moonshot, GLM, MiniMax) quedan pa una fase 2 —
 * ver docs/superpowers/plans/2026-09-27-model-pool-refresh-and-provider-tiers.md.
 */
import { MODEL_POOL } from "./models.js";

export type Tier = "expensive" | "medium" | "cheap";

export const PROVIDER_TIER_POOLS: Record<string, Record<Tier, string>> = {
  anthropic: {
    expensive: "anthropic/claude-opus-5.5",
    medium: "anthropic/claude-sonnet-5",
    cheap: "anthropic/claude-haiku-4.5",
  },
  openai: {
    expensive: "openai/gpt-6-astra",
    medium: "openai/gpt-6-sol",
    cheap: "openai/gpt-6-luna",
  },
  google: {
    expensive: "google/gemini-3.1-pro-preview",
    medium: "google/gemini-3.8-flash",
    cheap: "google/gemini-3.5-flash-lite",
  },
};

export function flattenTierPool(providers: readonly string[] = Object.keys(PROVIDER_TIER_POOLS)): Record<string, string> {
  const pool: Record<string, string> = {};
  for (const provider of providers) {
    const tiers = PROVIDER_TIER_POOLS[provider];
    if (!tiers) throw new Error(`unknown provider tier pool: ${provider}`);
    for (const modelId of Object.values(tiers)) {
      const description = MODEL_POOL[modelId];
      if (!description) throw new Error(`${modelId} is missing from MODEL_POOL`);
      pool[modelId] = description;
    }
  }
  return pool;
}
