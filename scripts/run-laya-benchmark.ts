import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { classifyWithLaya } from "../src/laya.js";
import { loadQuestions } from "../src/dataset.js";
import { MODEL_POOL } from "../src/models.js";
import { flattenTierPool } from "../src/provider-tiers.js";
import { outFile, resolveOutDir, runName } from "./paths.js";
import { runBenchmark } from "./run-benchmark.js";

function parseArgs(args: readonly string[]): { inputPath: string; outputPath: string; outDir: string; limit: number; pool: "wide" | "tiers" } {
  const value = (flag: string, fallback: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] ?? (() => { throw new Error(`${flag} requires a value`); })() : fallback;
  const limit = Number(value("--limit", "300"));
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");
  const pool = value("--pool", "wide");
  if (pool !== "wide" && pool !== "tiers") throw new Error("--pool must be 'wide' or 'tiers'");
  const outDir = resolveOutDir(args);
  return {
    inputPath: value("--input", "data/questions.jsonl"),
    outputPath: value("--output", outFile(outDir, `${runName("laya")}.jsonl`)),
    outDir,
    limit,
    pool,
  };
}

async function main(): Promise<void> {
  const { inputPath, outputPath, limit, pool } = parseArgs(process.argv.slice(2));
  const modelPool = pool === "tiers" ? flattenTierPool() : MODEL_POOL;
  const summary = await runBenchmark({
    questions: loadQuestions(inputPath),
    limit,
    outputPath,
    classify: (question) => classifyWithLaya(question, undefined, modelPool),
  });
  console.log(JSON.stringify({ outputPath, pool, ...summary }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
