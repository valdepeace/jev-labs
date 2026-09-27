import { MODEL_POOL } from "./models.js";
import type { ClassificationResult } from "./classify.js";
import type { Question } from "./dataset.js";

const REASONING_LEVELS = ["low", "medium", "high"];

export async function classifyWithLaya(question: Question, endpoint = process.env.LAYA_URL ?? "http://127.0.0.1:8021/v1/systemone"): Promise<ClassificationResult> {
  const start = performance.now();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "typed-decisions",
        state: question.text,
        questions: {
          reasoning_effort: { type: "score", instructions: "How much reasoning effort does this request need?", criteria: REASONING_LEVELS },
          model_choice: { type: "choice", instructions: "Which model should handle this request?", criteria: MODEL_POOL },
        },
      }),
    });
    if (!response.ok) throw new Error(`Laya request failed: ${response.status}`);
    const { answers } = await response.json() as { answers: Record<string, { score?: number; choice?: string; confidence?: number }> };
    const score = answers.reasoning_effort?.score;
    if (score === undefined || !answers.model_choice?.choice) throw new Error("Laya response is missing decisions");
    const index = Math.min(REASONING_LEVELS.length - 1, Math.max(0, Math.round(score)));
    return {
      questionId: question.id,
      reasoningEffort: REASONING_LEVELS[index],
      reasoningConfidence: answers.reasoning_effort.confidence,
      modelChoice: answers.model_choice.choice,
      modelConfidence: answers.model_choice.confidence,
      latencyMs: performance.now() - start,
    };
  } catch (error) {
    return { questionId: question.id, latencyMs: performance.now() - start, error: String((error as Error).message ?? error) };
  }
}
