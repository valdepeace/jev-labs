/**
 * Pool de modelos pa la pregunta `model_choice` de Jev, en formato
 * `{ [openRouterModelId]: descripción de capacidad }` — mismo shape que
 * `criteria` en el contrato System One.
 *
 * STUB: arranca del pool de 3 usao en las POCs anteriores (Anthropic
 * opus/sonnet/haiku) y de la tabla `modelFamilyDescriptions` de
 * `crush/internal/router/decide.go` (que a su vez viene de models.dev),
 * ampliao a más familias. Revisa disponibilidad real en tu cuenta de
 * OpenRouter antes de correr nada — algún id puede haber cambiao de
 * versión o quedar descatalogao.
 *
 * TODO (ver PROMPT.md): completar/podar esta lista antes de la corrida
 * real. El objetivo es tener 10-15+ modelos, no solo 3.
 */
export const MODEL_POOL: Record<string, string> = {
  // Anthropic Claude.
  "anthropic/claude-opus-4": "Flagship Claude model for deep reasoning, coding, and long-horizon agents",
  "anthropic/claude-sonnet-4": "Balanced Claude model for coding, analysis, agent workflows, and cost control",
  "anthropic/claude-haiku-4": "Fast Claude model for responsive assistance, classification, and lightweight agents",

  // OpenAI GPT.
  "openai/gpt-5": "GPT model for general reasoning, writing, coding, and tool-assisted tasks",
  "openai/gpt-5-mini": "Compact GPT model for low-latency assistance and high-volume workloads",
  "openai/gpt-4o": "GPT model for general reasoning, writing, coding, and tool-assisted tasks",
  "openai/gpt-4o-mini": "Compact GPT model for low-latency assistance and high-volume workloads",

  // Google Gemini.
  "google/gemini-2.5-pro": "Advanced Gemini model for complex reasoning, coding, and multimodal analysis",
  "google/gemini-2.5-flash": "Fast Gemini model balancing multimodal reasoning, tool use, and cost",
  "google/gemini-2.5-flash-lite": "Low-latency Gemini model for high-volume multimodal and agent workloads",

  // Meta Llama (open-weight).
  "meta-llama/llama-4-maverick": "Open multimodal Llama model for strong reasoning and fast responses",
  "meta-llama/llama-4-scout": "Open multimodal Llama model for long-context analysis and efficient agents",

  // TODO: valorar sumar más familias pa que el pool sea representativo
  // (ej. Mistral, DeepSeek, Qwen) si están disponibles en tu cuenta de
  // OpenRouter y tienen sentido pa tareas de programación.
};
