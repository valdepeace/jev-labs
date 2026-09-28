import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { OpenRouter } from "@openrouter/sdk";
import { classifyQuestion, type ClassificationResult } from "../src/classify.js";
import { loadQuestions, type Question } from "../src/dataset.js";
import { MODEL_POOL } from "../src/models.js";
import { flattenTierPool } from "../src/provider-tiers.js";
import { outFile, resolveOutDir, runName } from "./paths.js";

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
  inputTokens: number;
  outputTokens: number;
  cost: number;
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
  const resolvedOutput = resolve(outputPath);
  await mkdir(dirname(resolvedOutput), { recursive: true });
  await writeFile(resolvedOutput, "");
  for await (const question of questions) {
    if (rows.length === limit) break;
    const result = await classify(question);
    const row = { ...result, source: question.source, tags: question.tags, textLength: question.text.length };
    rows.push(row);
    await appendFile(resolvedOutput, `${JSON.stringify(row)}\n`);
    if (rows.length % 25 === 0) console.log(JSON.stringify({ processed: rows.length, limit }));
  }

  const summary = {
    processed: rows.length,
    succeeded: rows.filter((row) => !row.error).length,
    failed: rows.filter((row) => row.error).length,
    inputTokens: rows.reduce((total, row) => total + (row.usage?.inputTokens ?? 0), 0),
    outputTokens: rows.reduce((total, row) => total + (row.usage?.outputTokens ?? 0), 0),
    cost: rows.reduce((total, row) => total + (row.usage?.cost ?? 0), 0),
  };
  await writeFile(
    resolvedOutput.replace(/\.jsonl$/, ".summary.csv"),
    `processed,succeeded,failed\n${summary.processed},${summary.succeeded},${summary.failed}\n`,
  );
  return summary;
}

export function parseArgs(args: readonly string[]): { inputPath: string; outputPath: string; outDir: string; limit: number; pool: "wide" | "tiers" } {
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
  const outDir = resolveOutDir(args);
  return {
    inputPath: option("--input", "data/questions.jsonl"),
    outputPath: option("--output", outFile(outDir, `${runName("benchmark")}.jsonl`)),
    outDir,
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
