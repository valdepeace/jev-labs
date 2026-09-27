import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { OpenRouter } from "@openrouter/sdk";
import { classifyQuestion, type ClassificationResult } from "../src/classify.js";
import { loadQuestions, type Question } from "../src/dataset.js";
import { MODEL_POOL } from "../src/models.js";
import { flattenTierPool } from "../src/provider-tiers.js";

type BenchmarkRow = ClassificationResult & {
  source: string;
  tags?: string[];
  textLength: number;
};

type Classify = (question: Question) => Promise<ClassificationResult>;

export type BenchmarkSummary = {
  processed: number;
  succeeded: number;
  failed: number;
};

export async function runBenchmark({
  questions,
  limit,
  outputPath,
  classify,
}: {
  questions: AsyncIterable<Question> | Iterable<Question>;
  limit: number;
  outputPath: string;
  classify: Classify;
}): Promise<BenchmarkSummary> {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("limit must be a positive integer");

  const rows: BenchmarkRow[] = [];
  for await (const question of questions) {
    if (rows.length === limit) break;
    const result = await classify(question);
    rows.push({ ...result, source: question.source, tags: question.tags, textLength: question.text.length });
  }

  const summary = {
    processed: rows.length,
    succeeded: rows.filter((row) => !row.error).length,
    failed: rows.filter((row) => row.error).length,
  };
  const resolvedOutput = resolve(outputPath);
  await mkdir(dirname(resolvedOutput), { recursive: true });
  await writeFile(resolvedOutput, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  await writeFile(
    resolvedOutput.replace(/\.jsonl$/, ".summary.csv"),
    `processed,succeeded,failed\n${summary.processed},${summary.succeeded},${summary.failed}\n`,
  );
  return summary;
}

export function parseArgs(args: readonly string[]): { inputPath: string; outputPath: string; limit: number; pool: "wide" | "tiers" } {
  const option = (flag: string, fallback: string): string => {
    const index = args.indexOf(flag);
    if (index === -1) return fallback;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    return value;
  };
  const limit = Number(option("--limit", "30"));
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");
  const pool = option("--pool", "wide");
  if (pool !== "wide" && pool !== "tiers") throw new Error("--pool must be 'wide' or 'tiers'");
  return {
    inputPath: option("--input", "data/questions.jsonl"),
    outputPath: option("--output", `results/benchmark-${new Date().toISOString().replaceAll(":", "-")}.jsonl`),
    limit,
    pool,
  };
}

async function main(): Promise<void> {
  const { inputPath, outputPath, limit, pool } = parseArgs(process.argv.slice(2));
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required");

  const client = new OpenRouter({ apiKey });
  const modelPool = pool === "tiers" ? flattenTierPool() : MODEL_POOL;
  const summary = await runBenchmark({
    questions: loadQuestions(inputPath),
    limit,
    outputPath,
    classify: (question) => classifyQuestion(client, question, modelPool),
  });
  console.log(JSON.stringify({ outputPath, pool, ...summary }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
