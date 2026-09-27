/**
 * Cliente pa preguntarle a Jev (System One, vía OpenRouter) reasoning
 * effort + model_choice pa una pregunta de programación dada.
 *
 * Mismo contrato que `jev-triage-ts/src/providers.ts` y
 * `support-router.ts` (`client.alpha.decisions.create`), y misma forma de
 * preguntas que `crush/internal/router/decide.go` (`BuildQuestions`):
 * `reasoning_effort` es `score` sobre low/medium/high, `model_choice` es
 * `choice` sobre el pool de MODEL_POOL.
 *
 * STUB: falta enchufar esto al loop sobre el dataset (ver PROMPT.md).
 */
import { OpenRouter } from "@openrouter/sdk";
import { MODEL_POOL } from "./models.js";
import type { Question } from "./dataset.js";

const JEV_MODEL = "~typesafe/jev-latest";
const REASONING_LEVELS = ["low", "medium", "high"];

export interface ClassificationResult {
  questionId: string;
  reasoningEffort?: string;
  reasoningConfidence?: number;
  modelChoice?: string;
  modelConfidence?: number;
  latencyMs: number;
  error?: string;
}

export async function classifyQuestion(
  client: OpenRouter,
  question: Question,
  modelPool: Record<string, string> = MODEL_POOL,
): Promise<ClassificationResult> {
  const start = performance.now();
  try {
    const result = await client.alpha.decisions.create({
      decisionsRequest: {
        model: JEV_MODEL,
        state: question.text,
        questions: {
          reasoning_effort: {
            type: "score",
            instructions: "How much reasoning effort does this request need?",
            criteria: REASONING_LEVELS,
          },
          model_choice: {
            type: "choice",
            instructions: "Which model should handle this request?",
            criteria: modelPool,
          },
        },
      },
    });

    const answers = result.answers as Record<string, any>;
    // El score viene ya en la escala 0..(REASONING_LEVELS.length - 1), no
    // normalizao 0..1 — mismo contrato que MapDecision en
    // crush/internal/router/decide.go. Clamp por si el backend no acota.
    const idx = Math.min(REASONING_LEVELS.length - 1, Math.max(0, Math.round(answers.reasoning_effort.score)));
    return {
      questionId: question.id,
      reasoningEffort: REASONING_LEVELS[idx],
      reasoningConfidence: answers.reasoning_effort.confidence,
      modelChoice: answers.model_choice.choice,
      modelConfidence: answers.model_choice.confidence,
      latencyMs: performance.now() - start,
    };
  } catch (error) {
    return {
      questionId: question.id,
      latencyMs: performance.now() - start,
      error: String((error as Error).message ?? error),
    };
  }
}
