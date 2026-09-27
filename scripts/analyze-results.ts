import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ClassificationResult } from "../src/classify.js";

type BenchmarkRow = ClassificationResult & {
  tags?: string[];
  textLength?: number;
};

function lengthBucket(length?: number): string | undefined {
  if (length === undefined) return undefined;
  if (length < 200) return "short";
  if (length < 1_000) return "medium";
  return "long";
}

export function summarizeResults(rows: readonly BenchmarkRow[]): string {
  const counts = new Map<string, number>();
  const add = (kind: string, value: string): void => {
    const key = `${kind},${value}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };

  for (const row of rows) {
    if (row.error !== undefined) add("error", "classification_failed");
    else {
      if (row.modelChoice !== undefined) add("model", row.modelChoice);
      if (row.reasoningEffort !== undefined) add("reasoning_effort", row.reasoningEffort);
      for (const tag of row.tags ?? []) add("tag", tag);
      const bucket = lengthBucket(row.textLength);
      if (bucket !== undefined) add("text_length", bucket);
      if (row.modelConfidence !== undefined && row.modelConfidence < 0.5) add("model_confidence", "below_0.5");
    }
  }

  return `kind,value,count\n${[...counts].map(([key, count]) => `${key},${count}`).sort().join("\n")}${counts.size ? "\n" : ""}`;
}

async function main(): Promise<void> {
  const [inputPath, ...extraArgs] = process.argv.slice(2);
  if (!inputPath || extraArgs.length) throw new Error("usage: analyze <results.jsonl>");
  const content = await readFile(inputPath, "utf8");
  const rows = content.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line) as ClassificationResult);
  process.stdout.write(summarizeResults(rows));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
