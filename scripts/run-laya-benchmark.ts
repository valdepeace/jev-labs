import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { classifyWithLaya } from "../src/laya.js";
import { loadQuestions } from "../src/dataset.js";
import { runBenchmark } from "./run-benchmark.js";

function parseArgs(args: readonly string[]): { inputPath: string; outputPath: string; limit: number } {
  const value = (flag: string, fallback: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] ?? (() => { throw new Error(`${flag} requires a value`); })() : fallback;
  const limit = Number(value("--limit", "300"));
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");
  return { inputPath: value("--input", "data/questions.jsonl"), outputPath: value("--output", `results/laya-${new Date().toISOString().replaceAll(":", "-")}.jsonl`), limit };
}

async function main(): Promise<void> {
  const { inputPath, outputPath, limit } = parseArgs(process.argv.slice(2));
  const summary = await runBenchmark({ questions: loadQuestions(inputPath), limit, outputPath, classify: classifyWithLaya });
  console.log(JSON.stringify({ outputPath, ...summary }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
