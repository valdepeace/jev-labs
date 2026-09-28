import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

/**
 * Una pregunta de programación extraída del dataset elegido (ver
 * pocs/jev-kev-laya/research-datasets.md). `source` identifica de qué dataset viene,
 * pa poder comparar comportamiento de Jev por origen si hace falta.
 */
export interface Question {
  id: string;
  text: string;
  source: string;
  tags?: string[];
}

function parseQuestion(line: string, lineNumber: number, path: string): Question {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch (error) {
    throw new Error(`${path}: line ${lineNumber} contains invalid JSON`, { cause: error });
  }
  if (!value || typeof value !== "object") throw new Error(`${path}: line ${lineNumber} must be an object`);
  const { id, text, source, tags } = value as Record<string, unknown>;
  if (![id, text, source].every((field) => typeof field === "string" && field.trim())) {
    throw new Error(`${path}: line ${lineNumber} requires non-empty id, text, and source`);
  }
  if (tags !== undefined && (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string"))) {
    throw new Error(`${path}: line ${lineNumber} tags must be an array of strings`);
  }
  return tags === undefined
    ? { id: id as string, text: text as string, source: source as string }
    : { id: id as string, text: text as string, source: source as string, tags };
}

/**
 * Lee data/questions.jsonl (una pregunta por línea, JSON). Ese fichero NO
 * existe todavía — hay que generarlo a partir de uno de los datasets de
 * pocs/jev-kev-laya/research-datasets.md (ver PROMPT.md, paso 1-2).
 */
export async function* loadQuestions(path = "data/questions.jsonl"): AsyncGenerator<Question> {
  const input = createReadStream(path, "utf-8");
  const rl = createInterface({ input });
  let lineNumber = 0;
  try {
    for await (const line of rl) {
      lineNumber++;
      if (!line.trim()) continue;
      yield parseQuestion(line, lineNumber, path);
    }
  } finally {
    input.destroy();
  }
}
