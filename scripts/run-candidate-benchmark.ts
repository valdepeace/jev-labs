import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { OpenRouter } from "@openrouter/sdk";
import { classifyQuestion, type ClassificationResult } from "../src/classify.js";
import { loadQuestions, type Question } from "../src/dataset.js";
import { MODEL_POOL } from "../src/models.js";
import { flattenTierPool } from "../src/provider-tiers.js";
import { outFile, resolveOutDir, runName } from "./paths.js";
import { runBenchmark } from "./run-benchmark.js";

const ROUTER_MODEL = "typesafe/jev-router";
const REASONING = ["low", "medium", "high"];

async function classifyWithRouter(apiKey: string, question: Question): Promise<ClassificationResult> {
  const start = performance.now();
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ROUTER_MODEL,
        messages: [{
          role: "user",
          content: `Classify this programming request. Choose exactly one model ID from the supplied pool and one reasoning effort (low, medium, high). Return only a JSON object with keys model_choice and reasoning_effort.\nPool: ${JSON.stringify(MODEL_POOL)}\nRequest:\n${question.text}`,
        }],
      }),
    });
    if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${(await response.text()).slice(0, 500)}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Jev Router returned no text content");
    const json = content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1);
    const answer = JSON.parse(json) as { model_choice?: unknown; reasoning_effort?: unknown };
    if (typeof answer.model_choice !== "string" || !(answer.model_choice in MODEL_POOL)) throw new Error("Jev Router returned an invalid model_choice");
    if (typeof answer.reasoning_effort !== "string" || !REASONING.includes(answer.reasoning_effort)) throw new Error("Jev Router returned an invalid reasoning_effort");
    return { questionId: question.id, modelChoice: answer.model_choice, reasoningEffort: answer.reasoning_effort, latencyMs: performance.now() - start };
  } catch (error) {
    return { questionId: question.id, latencyMs: performance.now() - start, error: String((error as Error).message ?? error) };
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outDirIndex = args.indexOf("--out-dir");
  const positional = outDirIndex === -1 ? args : args.filter((_, index) => index !== outDirIndex && index !== outDirIndex + 1);
  const [candidate, rawLimit = "30", poolName = "wide", retryPath] = positional;
  if (candidate !== "kev" && candidate !== "router") throw new Error("usage: run-candidate-benchmark <kev|router> [limit] [wide|tiers] [retry-failures.jsonl] [--out-dir <dir>]");
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 300) throw new Error("limit must be an integer from 1 to 300");
  if (poolName !== "wide" && poolName !== "tiers") throw new Error("pool must be 'wide' or 'tiers'");
  if (candidate === "router" && poolName !== "wide") throw new Error("Jev Router uses chat prompts, not the structured tier pool");
  if (retryPath && candidate !== "kev") throw new Error("retry-failures only supports the structured Kev benchmark");
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required");

  const client = new OpenRouter({ apiKey });
  const outDir = resolveOutDir(args);
  const model = candidate === "kev" ? "jaredpalmer/kev-4b" : ROUTER_MODEL;
  const previousRows = retryPath
    ? (await readFile(retryPath, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as ClassificationResult)
    : [];
  const failedIds = new Set(previousRows.filter((row) => row.error).map((row) => row.questionId));
  if (retryPath && !failedIds.size) throw new Error("retry file contains no failed rows");
  const questions = retryPath
    ? (async function* () { for await (const question of loadQuestions()) if (failedIds.has(question.id)) yield question; })()
    : loadQuestions();
  const runLimit = retryPath ? failedIds.size : limit;
  const outputPath = outFile(outDir, `${runName(`${candidate}-${poolName}${retryPath ? "-retry" : ""}`)}.jsonl`);
  const modelPool = poolName === "tiers" ? flattenTierPool() : MODEL_POOL;
  const summary = await runBenchmark({
    questions,
    limit: runLimit,
    outputPath,
    classify: candidate === "kev"
      ? (question) => classifyQuestion(client, question, modelPool, model)
      : (question) => classifyWithRouter(apiKey, question),
  });
  console.log(JSON.stringify({ candidate, model, pool: poolName, outputPath, limit: runLimit, ...summary }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
