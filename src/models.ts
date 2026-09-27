/**
 * Pool de modelos pa la pregunta `model_choice` de Jev, en formato
 * `{ [openRouterModelId]: descripción de capacidad }` — mismo shape que
 * `criteria` en el contrato System One.
 *
 * Actualizao el 2026-09-27 contra el catálogo real de OpenRouter
 * (`GET https://openrouter.ai/api/v1/models`) pa usar la generación
 * vigente de cada proveedor en vez de modelos ya descatalogaos, y pa
 * sumar familias chinas — ver
 * docs/superpowers/plans/2026-09-27-model-pool-refresh-and-provider-tiers.md.
 * El catálogo de OpenRouter cambia a menudo: revisa disponibilidad real
 * en tu cuenta antes de correr un benchmark grande.
 */
export const MODEL_POOL: Record<string, string> = {
  // Anthropic Claude.
  "anthropic/claude-opus-5.5": "Flagship Claude model for deep reasoning, coding, and long-horizon agents",
  "anthropic/claude-sonnet-5": "Balanced Claude model for coding, analysis, agent workflows, and cost control",
  "anthropic/claude-haiku-4.5": "Fast Claude model for responsive assistance, classification, and lightweight agents",

  // OpenAI GPT.
  "openai/gpt-6-astra": "Flagship GPT model for deep reasoning, coding, and complex tool-assisted tasks",
  "openai/gpt-6-sol": "Balanced GPT model for general reasoning, writing, and coding at moderate cost",
  "openai/gpt-6-luna": "Compact GPT model for low-latency assistance and high-volume workloads",

  // Google Gemini.
  "google/gemini-3.1-pro-preview": "Advanced Gemini model for complex reasoning, coding, and multimodal analysis",
  "google/gemini-3.8-flash": "Fast Gemini model balancing multimodal reasoning, tool use, and cost",
  "google/gemini-3.5-flash-lite": "Low-latency Gemini model for high-volume multimodal and agent workloads",

  // Meta Llama (open-weight) — still the current generation on OpenRouter.
  "meta-llama/llama-4-maverick": "Open multimodal Llama model for strong reasoning and fast responses",
  "meta-llama/llama-4-scout": "Open multimodal Llama model for long-context analysis and efficient agents",

  // Proveedores chinos (open-weight/hosted).
  "deepseek/deepseek-v4-pro": "Chinese open-weight model tuned for reasoning and coding at low cost",
  "qwen/qwen3.8-max-prime": "Alibaba's flagship Qwen model for advanced reasoning and agentic coding",
  "moonshotai/kimi-k3": "Large-scale Chinese open-weight model for long-context reasoning and coding",
  "z-ai/glm-5.3-prime": "Chinese GLM model tuned for agentic tool use and coding tasks",
  "minimax/minimax-m3": "Chinese MiniMax model balancing reasoning quality and cost",
};
