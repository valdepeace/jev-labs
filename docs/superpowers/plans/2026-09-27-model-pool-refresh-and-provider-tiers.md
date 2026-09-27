# Model Pool Refresh and Provider-Tier Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh `MODEL_POOL` to the current OpenRouter catalog (including Chinese providers), let both benchmark CLIs swap between that wide pool and a new caro/medio/barato-per-provider pool, put Laya into the comparison chart, and run both benchmarks once approved.

**Architecture:** `src/models.ts` stays the single source of truth for `{ modelId: description }` pairs; `src/provider-tiers.ts` is a thin index on top of it (`flattenTierPool`) so no model description is duplicated. `src/classify.ts` and `src/laya.ts` already take a `Question` and return a `ClassificationResult` — they gain one optional parameter (`modelPool`) so callers choose which pool to send as `criteria`, with no change to their return shape. `scripts/run-benchmark.ts` and `scripts/run-laya-benchmark.ts` gain a `--pool wide|tiers` flag that picks which pool to pass through. `scripts/report.ts` gains a pure SVG-chart function alongside its existing HTML tables.

**Tech Stack:** Node 24, TypeScript strict/NodeNext, `tsx --test`, Node standard library, `@openrouter/sdk`. No new dependencies.

**Spec:** This conversation's request (2026-09-27): update `src/models.ts` off outdated model ids, add Chinese-provider models, show Laya in the comparison chart, and add a second benchmark that compares the expensive/medium/cheap tier of the same provider (Anthropic, OpenAI, Google first; Chinese providers explicitly deferred).

## Global Constraints

- Do not add dependencies; use Node standard-library APIs and the existing `@openrouter/sdk`.
- Preserve `runBenchmark`'s exported signature and `ClassificationResult`/`Question` shapes; only add optional parameters, never change an existing required one.
- `MODEL_POOL` and `flattenTierPool()` must keep the `Record<string, string>` shape every consumer (`classify.ts`, `laya.ts`, `analyze-results.ts`, `report.ts`) already expects.
- Follow the existing code style: minimal comments, only where they explain a non-obvious constraint; Spanish comments where the file already uses Spanish (models.ts, provider-tiers.ts), English identifiers.
- Chinese-provider tier pools (a fourth phase) are explicitly out of scope for this plan — leave a one-line TODO pointing at this file, do not implement them.
- Any task that spends real money by calling Jev through OpenRouter must stop and get the user's explicit approval of the exact model pool and question count before running — never run a paid benchmark as an unattended step of a longer task list.

## Review Focus

- A typo'd or delisted OpenRouter model id in `MODEL_POOL` doesn't crash anything — Jev/Laya just silently return a nonsense `model_choice` — so the pool needs its own sanity test, not just "it compiles."
- `flattenTierPool` called with an unknown provider name must throw with that provider's name in the message, not silently return an empty or partial pool that then gets sent to Jev as `criteria: {}`.
- `classifyQuestion` and `classifyWithLaya`'s new `modelPool` parameter must default to `MODEL_POOL` so the two already-working call sites in `run-benchmark.ts`/`run-laya-benchmark.ts` (before Task 4 touches them) and every existing test keep working unmodified.
- `modelChart` must not divide by zero when the maximum bar count across both classifiers is 0 (e.g. a results file where every row is a classification error).
- `--pool` must reject any value other than `wide`/`tiers` before any network call, the same way `--limit` already rejects non-positive values — a silent fallback would let a mistyped flag burn paid Jev calls against the wrong pool.

---

### Task 1: Refresh `MODEL_POOL` to the current OpenRouter catalog, including Chinese providers

**Files:**
- Modify: `src/models.ts`
- Create: `src/models.test.ts`

**Interfaces:**
- Produces: `MODEL_POOL: Record<string, string>` (same export name/shape as before — only the contents change).

- [ ] **Step 1: Write the failing tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { MODEL_POOL } from "./models.js";

test("MODEL_POOL has a wide, deduplicated set of current model ids", () => {
  const ids = Object.keys(MODEL_POOL);
  assert.ok(ids.length >= 15, `expected at least 15 models, got ${ids.length}`);
  assert.equal(new Set(ids).size, ids.length, "duplicate model id in MODEL_POOL");
  for (const id of ids) {
    assert.match(id, /^[a-z0-9_.-]+\/[a-z0-9_.:-]+$/, `${id} is not a valid provider/model slug`);
  }
});

test("MODEL_POOL covers Anthropic, OpenAI, Google, Meta, and at least one Chinese provider", () => {
  const ids = Object.keys(MODEL_POOL);
  const hasPrefix = (prefix: string) => ids.some((id) => id.startsWith(`${prefix}/`));
  for (const provider of ["anthropic", "openai", "google", "meta-llama"]) {
    assert.ok(hasPrefix(provider), `missing a ${provider} model`);
  }
  const chineseProviders = ["deepseek", "qwen", "moonshotai", "z-ai", "minimax"];
  assert.ok(chineseProviders.some(hasPrefix), "missing at least one Chinese-provider model");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test src/models.test.ts`
Expected: FAIL with module-not-found for `src/models.test.ts` against the old pool, or an assertion failure once the file exists but `MODEL_POOL` still holds the old 12 ids (the old pool has no Chinese entry).

- [ ] **Step 3: Replace `MODEL_POOL`**

```ts
/**
 * Pool de modelos pa la pregunta `model_choice` de Jev, en formato
 * `{ [openRouterModelId]: descripción de capacidad }` — mismo shape que
 * `criteria` en el contrato System One.
 *
 * Actualizao el 2026-09-27 contra el catálogo real de OpenRouter
 * (`GET https://openrouter.ai/api/v1/models`) pa usar la generación
 * vigente de cada proveedor en vez de modelos ya descatalogaos, y pa
 * sumar familias chinas — ver
 * docs/superpowers/plans/2026-09-27-model-pool-refresh-and-provider-tiers.md.
 * El catálogo de OpenRouter cambia a menudo: revisa disponibilidad real
 * en tu cuenta antes de correr un benchmark grande.
 */
export const MODEL_POOL: Record<string, string> = {
  // Anthropic Claude.
  "anthropic/claude-opus-5.5": "Flagship Claude model for deep reasoning, coding, and long-horizon agents",
  "anthropic/claude-sonnet-5": "Balanced Claude model for coding, analysis, agent workflows, and cost control",
  "anthropic/claude-haiku-4.5": "Fast Claude model for responsive assistance, classification, and lightweight agents",

  // OpenAI GPT.
  "openai/gpt-6-astra": "Flagship GPT model for deep reasoning, coding, and complex tool-assisted tasks",
  "openai/gpt-6-sol": "Balanced GPT model for general reasoning, writing, and coding at moderate cost",
  "openai/gpt-6-luna": "Compact GPT model for low-latency assistance and high-volume workloads",

  // Google Gemini.
  "google/gemini-3.1-pro-preview": "Advanced Gemini model for complex reasoning, coding, and multimodal analysis",
  "google/gemini-3.8-flash": "Fast Gemini model balancing multimodal reasoning, tool use, and cost",
  "google/gemini-3.5-flash-lite": "Low-latency Gemini model for high-volume multimodal and agent workloads",

  // Meta Llama (open-weight) — still the current generation on OpenRouter.
  "meta-llama/llama-4-maverick": "Open multimodal Llama model for strong reasoning and fast responses",
  "meta-llama/llama-4-scout": "Open multimodal Llama model for long-context analysis and efficient agents",

  // Proveedores chinos (open-weight/hosted).
  "deepseek/deepseek-v4-pro": "Chinese open-weight model tuned for reasoning and coding at low cost",
  "qwen/qwen3.8-max-prime": "Alibaba's flagship Qwen model for advanced reasoning and agentic coding",
  "moonshotai/kimi-k3": "Large-scale Chinese open-weight model for long-context reasoning and coding",
  "z-ai/glm-5.3-prime": "Chinese GLM model tuned for agentic tool use and coding tasks",
  "minimax/minimax-m3": "Chinese MiniMax model balancing reasoning quality and cost",
};
```

- [ ] **Step 4: Run the focused test and full suite**

Run: `npx tsx --test src/models.test.ts; npm test; npx tsc --noEmit`
Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/models.ts src/models.test.ts
git commit -m "feat: refresh MODEL_POOL to current OpenRouter catalog and add Chinese providers"
```

### Task 2: Let `classifyQuestion` and `classifyWithLaya` take an explicit model pool

**Files:**
- Modify: `src/classify.ts`
- Modify: `src/laya.ts`
- Modify: `scripts/laya.test.ts`

**Interfaces:**
- Consumes: `MODEL_POOL` from Task 1 (unchanged shape).
- Produces: `classifyQuestion(client: OpenRouter, question: Question, modelPool?: Record<string, string>): Promise<ClassificationResult>` and `classifyWithLaya(question: Question, endpoint?: string, modelPool?: Record<string, string>): Promise<ClassificationResult>` — both default `modelPool` to `MODEL_POOL`, so every existing call site keeps compiling unmodified.

- [ ] **Step 1: Write the failing test**

Add to `scripts/laya.test.ts`:

```ts
test("classifyWithLaya sends a custom model pool as model_choice criteria", async () => {
  const originalFetch = globalThis.fetch;
  let sentBody: any;
  globalThis.fetch = async (_url, init) => {
    sentBody = JSON.parse(init!.body as string);
    return new Response(JSON.stringify({ answers: { reasoning_effort: { score: 0, confidence: 0.5 }, model_choice: { choice: "custom/model", confidence: 0.5 } } }));
  };
  try {
    await classifyWithLaya({ id: "one", text: "Fix a bug", source: "test" }, undefined, { "custom/model": "a test model" });
    assert.deepEqual(sentBody.questions.model_choice.criteria, { "custom/model": "a test model" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test scripts/laya.test.ts`
Expected: FAIL with a TypeScript error (`classifyWithLaya` does not accept a third argument) or, once compiled loosely, an assertion failure because `sentBody.questions.model_choice.criteria` is still `MODEL_POOL`.

- [ ] **Step 3: Add the parameter to both classifiers**

In `src/classify.ts`, change the signature and the `criteria` line:

```ts
export async function classifyQuestion(
  client: OpenRouter,
  question: Question,
  modelPool: Record<string, string> = MODEL_POOL,
): Promise<ClassificationResult> {
```

```ts
          model_choice: {
            type: "choice",
            instructions: "Which model should handle this request?",
            criteria: modelPool,
          },
```

In `src/laya.ts`, change the signature and body the same way:

```ts
export async function classifyWithLaya(
  question: Question,
  endpoint = process.env.LAYA_URL ?? "http://127.0.0.1:8021/v1/systemone",
  modelPool: Record<string, string> = MODEL_POOL,
): Promise<ClassificationResult> {
```

```ts
        questions: {
          reasoning_effort: { type: "score", instructions: "How much reasoning effort does this request need?", criteria: REASONING_LEVELS },
          model_choice: { type: "choice", instructions: "Which model should handle this request?", criteria: modelPool },
        },
```

Add `import { MODEL_POOL } from "./models.js";` to `src/laya.ts` if it isn't already the sole import from that module (it already imports `MODEL_POOL` today — just confirm the import stays and is now also the default value).

- [ ] **Step 4: Run the focused test and full suite**

Run: `npx tsx --test scripts/laya.test.ts; npm test; npx tsc --noEmit`
Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/classify.ts src/laya.ts scripts/laya.test.ts
git commit -m "feat: let classifyQuestion and classifyWithLaya take an explicit model pool"
```

### Task 3: Add provider expensive/medium/cheap tier pools

**Files:**
- Create: `src/provider-tiers.ts`
- Create: `src/provider-tiers.test.ts`

**Interfaces:**
- Consumes: `MODEL_POOL` from Task 1.
- Produces: `PROVIDER_TIER_POOLS: Record<string, Record<"expensive" | "medium" | "cheap", string>>` and `flattenTierPool(providers?: readonly string[]): Record<string, string>`, which later tasks import.

- [ ] **Step 1: Write the failing tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { flattenTierPool, PROVIDER_TIER_POOLS } from "./provider-tiers.js";
import { MODEL_POOL } from "./models.js";

test("PROVIDER_TIER_POOLS phase 1 covers anthropic, openai, and google only", () => {
  assert.deepEqual(Object.keys(PROVIDER_TIER_POOLS).sort(), ["anthropic", "google", "openai"]);
});

test("every tier model id exists in MODEL_POOL", () => {
  for (const tiers of Object.values(PROVIDER_TIER_POOLS)) {
    for (const modelId of Object.values(tiers)) assert.ok(modelId in MODEL_POOL, `${modelId} is missing from MODEL_POOL`);
  }
});

test("flattenTierPool returns the 9 phase-1 models by default", () => {
  const pool = flattenTierPool();
  assert.equal(Object.keys(pool).length, 9);
});

test("flattenTierPool rejects an unknown provider", () => {
  assert.throws(() => flattenTierPool(["mistral"]), /unknown provider tier pool: mistral/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test src/provider-tiers.test.ts`
Expected: FAIL with module-not-found for `src/provider-tiers.js`.

- [ ] **Step 3: Implement the tier pool and flattener**

```ts
/**
 * Subconjunto de MODEL_POOL organizao por proveedor y tier de precio
 * (expensive/medium/cheap), pa comparar si Jev distingue entre el modelo
 * más caro y el más barato del MISMO proveedor según la dificultad de la
 * pregunta. Fase 1: solo Anthropic, OpenAI y Google. Los proveedores
 * chinos (DeepSeek, Qwen, Moonshot, GLM, MiniMax) quedan pa una fase 2 —
 * ver docs/superpowers/plans/2026-09-27-model-pool-refresh-and-provider-tiers.md.
 */
import { MODEL_POOL } from "./models.js";

export type Tier = "expensive" | "medium" | "cheap";

export const PROVIDER_TIER_POOLS: Record<string, Record<Tier, string>> = {
  anthropic: {
    expensive: "anthropic/claude-opus-5.5",
    medium: "anthropic/claude-sonnet-5",
    cheap: "anthropic/claude-haiku-4.5",
  },
  openai: {
    expensive: "openai/gpt-6-astra",
    medium: "openai/gpt-6-sol",
    cheap: "openai/gpt-6-luna",
  },
  google: {
    expensive: "google/gemini-3.1-pro-preview",
    medium: "google/gemini-3.8-flash",
    cheap: "google/gemini-3.5-flash-lite",
  },
};

export function flattenTierPool(providers: readonly string[] = Object.keys(PROVIDER_TIER_POOLS)): Record<string, string> {
  const pool: Record<string, string> = {};
  for (const provider of providers) {
    const tiers = PROVIDER_TIER_POOLS[provider];
    if (!tiers) throw new Error(`unknown provider tier pool: ${provider}`);
    for (const modelId of Object.values(tiers)) {
      const description = MODEL_POOL[modelId];
      if (!description) throw new Error(`${modelId} is missing from MODEL_POOL`);
      pool[modelId] = description;
    }
  }
  return pool;
}
```

- [ ] **Step 4: Run the focused test and full suite**

Run: `npx tsx --test src/provider-tiers.test.ts; npm test; npx tsc --noEmit`
Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/provider-tiers.ts src/provider-tiers.test.ts
git commit -m "feat: add phase-1 provider expensive/medium/cheap tier pools"
```

### Task 4: Add a `--pool wide|tiers` flag to both benchmark CLIs

**Files:**
- Modify: `scripts/run-benchmark.ts`
- Modify: `scripts/run-benchmark.test.ts`
- Modify: `scripts/run-laya-benchmark.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `MODEL_POOL` (Task 1), `flattenTierPool` (Task 3), `classifyQuestion`/`classifyWithLaya`'s new `modelPool` parameter (Task 2).
- Produces: `parseArgs` in `run-benchmark.ts` now also returns `pool: "wide" | "tiers"`.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/run-benchmark.test.ts`:

```ts
test("parseArgs defaults to the wide pool and rejects an unknown pool name", () => {
  assert.equal(parseArgs([]).pool, "wide");
  assert.equal(parseArgs(["--pool", "tiers"]).pool, "tiers");
  assert.throws(() => parseArgs(["--pool", "bogus"]), /--pool must be 'wide' or 'tiers'/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test scripts/run-benchmark.test.ts`
Expected: FAIL — `parseArgs([]).pool` is `undefined` today.

- [ ] **Step 3: Implement the flag in `run-benchmark.ts`**

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { OpenRouter } from "@openrouter/sdk";
import { classifyQuestion, type ClassificationResult } from "../src/classify.js";
import { loadQuestions, type Question } from "../src/dataset.js";
import { MODEL_POOL } from "../src/models.js";
import { flattenTierPool } from "../src/provider-tiers.js";
```

```ts
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
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required");

  const { inputPath, outputPath, limit, pool } = parseArgs(process.argv.slice(2));
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
```

(`runBenchmark` itself, its `BenchmarkRow`/`BenchmarkSummary` types, and the rest of the file are unchanged.)

- [ ] **Step 4: Mirror the flag in `run-laya-benchmark.ts`**

```ts
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { classifyWithLaya } from "../src/laya.js";
import { loadQuestions } from "../src/dataset.js";
import { MODEL_POOL } from "../src/models.js";
import { flattenTierPool } from "../src/provider-tiers.js";
import { runBenchmark } from "./run-benchmark.js";

function parseArgs(args: readonly string[]): { inputPath: string; outputPath: string; limit: number; pool: "wide" | "tiers" } {
  const value = (flag: string, fallback: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] ?? (() => { throw new Error(`${flag} requires a value`); })() : fallback;
  const limit = Number(value("--limit", "300"));
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");
  const pool = value("--pool", "wide");
  if (pool !== "wide" && pool !== "tiers") throw new Error("--pool must be 'wide' or 'tiers'");
  return {
    inputPath: value("--input", "data/questions.jsonl"),
    outputPath: value("--output", `results/laya-${new Date().toISOString().replaceAll(":", "-")}.jsonl`),
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
```

- [ ] **Step 5: Add npm scripts**

In `package.json`, next to the existing `"classify"` and `"classify:laya"` entries, add:

```json
"classify:tiers": "tsx --env-file=.env scripts/run-benchmark.ts -- --pool tiers",
"classify:laya:tiers": "tsx scripts/run-laya-benchmark.ts --pool tiers",
```

- [ ] **Step 6: Run the focused test, a manual smoke check, and the full suite**

Run: `npx tsx --test scripts/run-benchmark.test.ts; npm test; npx tsc --noEmit`
Expected: all commands exit 0.

Run this manual smoke check (no network call, just confirms the flag is wired — `OPENROUTER_API_KEY` unset should fail *after* arg parsing, not before):
`npx tsx scripts/run-benchmark.ts --pool tiers --limit 1 2>&1 | head -1`
Expected: `OPENROUTER_API_KEY is required` (proves `--pool tiers` parsed fine and the pool was only built after the key check would have passed).

- [ ] **Step 7: Commit**

```bash
git add scripts/run-benchmark.ts scripts/run-benchmark.test.ts scripts/run-laya-benchmark.ts package.json
git commit -m "feat: add --pool wide|tiers flag to both benchmark CLIs"
```

### Task 5: Draw a Jev-vs-Laya model-choice chart in the report

**Files:**
- Modify: `scripts/report.ts`
- Modify: `scripts/report.test.ts`

**Interfaces:**
- Consumes: the existing `Row` type and `esc` helper already in `scripts/report.ts`.
- Produces: `modelChart(jev: readonly Row[], laya: readonly Row[]): string`, called from `renderReport`.

- [ ] **Step 1: Write the failing test**

Add to `scripts/report.test.ts`:

```ts
import { modelChart } from "./report.js";

test("modelChart draws one bar per classifier for every distinct model chosen", () => {
  const base = { source: "t", textLength: 1, latencyMs: 1, reasoningEffort: "low" };
  const svg = modelChart(
    [{ ...base, questionId: "a", modelChoice: "prov/a" }],
    [{ ...base, questionId: "a", modelChoice: "prov/b" }],
  );
  assert.equal((svg.match(/<rect/g) ?? []).length, 4); // 2 legend swatches + 1 bar for prov/a (Jev) + 1 bar for prov/b (Laya)
  assert.match(svg, /prov\/a/);
  assert.match(svg, /prov\/b/);
});

test("modelChart does not divide by zero when both inputs are empty", () => {
  assert.doesNotThrow(() => modelChart([], []));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test scripts/report.test.ts`
Expected: FAIL with `modelChart is not a function` (not exported yet).

- [ ] **Step 3: Implement `modelChart` and wire it into `renderReport`**

Add above `renderReport` in `scripts/report.ts`:

```ts
const JEV_COLOR = "#6366f1";
const LAYA_COLOR = "#f59e0b";

function countByModel(rows: readonly Row[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) if (!row.error && row.modelChoice) counts.set(row.modelChoice, (counts.get(row.modelChoice) ?? 0) + 1);
  return counts;
}

export function modelChart(jev: readonly Row[], laya: readonly Row[]): string {
  const jevCounts = countByModel(jev);
  const layaCounts = countByModel(laya);
  const models = [...new Set([...jevCounts.keys(), ...layaCounts.keys()])].sort();
  const max = Math.max(1, ...models.map((model) => Math.max(jevCounts.get(model) ?? 0, layaCounts.get(model) ?? 0)));
  const rowHeight = 32;
  const barMaxWidth = 240;
  const labelWidth = 190;
  const height = models.length * rowHeight + 30;
  const bar = (count: number, y: number, color: string) =>
    count === 0 ? "" : `<rect x="${labelWidth}" y="${y}" width="${(count / max) * barMaxWidth}" height="11" fill="${color}"/><text x="${labelWidth + (count / max) * barMaxWidth + 5}" y="${y + 10}" font-size="10">${count}</text>`;
  const rows = models
    .map((model, index) => {
      const y = 24 + index * rowHeight;
      return `<text x="0" y="${y + 9}" font-size="10">${esc(model)}</text>${bar(jevCounts.get(model) ?? 0, y, JEV_COLOR)}${bar(layaCounts.get(model) ?? 0, y + 13, LAYA_COLOR)}`;
    })
    .join("");
  return `<svg viewBox="0 0 460 ${height}" role="img" aria-label="Modelo elegido: Jev vs Laya"><rect x="${labelWidth}" y="2" width="10" height="10" fill="${JEV_COLOR}"/><text x="${labelWidth + 14}" y="11" font-size="10">Jev</text><rect x="${labelWidth + 60}" y="2" width="10" height="10" fill="${LAYA_COLOR}"/><text x="${labelWidth + 74}" y="11" font-size="10">Laya</text>${rows}</svg>`;
}
```

In `renderReport`, add the chart right after the summary `<div class="grid">...</div>` and before the two `table(...)` calls:

```ts
return `<!doctype html>...${card(...)}</div><section><h2>Modelo elegido por pregunta</h2>${modelChart(jev, laya)}</section>${table("Distribución Jev", jev)}${table("Distribución Laya", laya)}</html>`;
```

(Keep every other part of the existing template string exactly as-is — only insert the new `<section>` in that one spot.)

- [ ] **Step 4: Run the focused test and full suite**

Run: `npx tsx --test scripts/report.test.ts; npm test; npx tsc --noEmit`
Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/report.ts scripts/report.test.ts
git commit -m "feat: chart Jev vs Laya model choice in the HTML report"
```

### Task 6 (gated — requires explicit approval before spending): Re-run the wide-pool benchmark with the refreshed catalog

**Files:**
- Produces: `results/benchmark-*.jsonl`/`.summary.csv` (Jev), `results/laya-*.jsonl`/`.summary.csv` (Laya), `results/report.html`, `docs/analysis-2026-09-27-refreshed-pool.md`.

- [ ] **Step 1: Ask the user for approval**

State exactly what will run — 300 Jev calls (paid, same as the first run's cost) against the 16-model refreshed pool, plus 300 free Laya calls — and wait for explicit approval before Step 2. Do not proceed on an assumption that finishing Tasks 1–5 implies approval for this step.

- [ ] **Step 2: Run both benchmarks on the existing dataset**

```bash
npm run classify -- --limit 300
npx tsx scripts/run-laya-benchmark.ts --limit 300
```

Expected: two new `results/benchmark-*.jsonl` / `results/laya-*.jsonl` files, each with a `.summary.csv` reporting `processed: 300`.

- [ ] **Step 3: Regenerate the analysis CSVs and the comparison report**

```bash
npx tsx scripts/analyze-results.ts results/benchmark-<new-timestamp>.jsonl > results/jev-summary.csv
npx tsx scripts/analyze-results.ts results/laya-<new-timestamp>.jsonl > results/laya-summary.csv
npx tsx scripts/report.ts results/benchmark-<new-timestamp>.jsonl results/laya-<new-timestamp>.jsonl results/report.html
```

Expected: `results/report.html` now includes the `modelChart` section built from Task 5, comparing the refreshed 16-model pool.

- [ ] **Step 4: Write the analysis doc**

Create `docs/analysis-2026-09-27-refreshed-pool.md` following the structure of `docs/analysis-2026-09-27.md` (same sections: pool-width vs. confidence, model distribution per backend, cross-backend agreement, latency/reliability, reasoning-effort distribution). Compare the new distribution against the previous 12-model run: does adding 4 more models (Chinese providers, gpt-6, gemini-3.x) spread the choices out further, concentrate them differently, or leave `model_confidence` roughly where it was?

### Task 7 (gated — requires explicit approval before spending): Run the phase-1 provider-tier benchmark

**Files:**
- Produces: `results/benchmark-tiers-*.jsonl`/`.summary.csv` (Jev), `results/laya-tiers-*.jsonl`/`.summary.csv` (Laya), `docs/analysis-provider-tiers-2026-09-27.md`.

- [ ] **Step 1: Ask the user for approval**

State the exact scope — the 9-model phase-1 pool (Anthropic/OpenAI/Google, expensive/medium/cheap each), how many Jev calls (recommend starting with `--limit 100` rather than the full 300, since this is a second, exploratory paid run on top of Task 6's 300) — and wait for explicit approval before Step 2.

- [ ] **Step 2: Run both benchmarks with `--pool tiers`**

```bash
npm run classify -- --pool tiers --limit 100 --output results/benchmark-tiers-$(node -e "console.log(new Date().toISOString().replaceAll(':','-'))").jsonl
npx tsx scripts/run-laya-benchmark.ts --pool tiers --limit 100 --output results/laya-tiers-$(node -e "console.log(new Date().toISOString().replaceAll(':','-'))").jsonl
```

Expected: two new `results/*.jsonl` files under the `tiers-` prefix, `.summary.csv` reporting `processed: 100` each.

- [ ] **Step 3: Analyze and report**

```bash
npx tsx scripts/analyze-results.ts results/benchmark-tiers-<timestamp>.jsonl
npx tsx scripts/analyze-results.ts results/laya-tiers-<timestamp>.jsonl
npx tsx scripts/report.ts results/benchmark-tiers-<timestamp>.jsonl results/laya-tiers-<timestamp>.jsonl results/report-tiers.html
```

- [ ] **Step 4: Write the analysis doc**

Create `docs/analysis-provider-tiers-2026-09-27.md` answering, per provider (Anthropic, OpenAI, Google) and per backend (Jev, Laya): does `model_choice` ever pick the cheap tier for an easy/short question and the expensive tier for a hard/long one within the *same* provider, or does it always collapse on one tier regardless of question difficulty? Explicitly note that Chinese-provider tiers are deferred to a future plan (link back to this plan's Global Constraints).

---

## Self-Review

**Spec coverage:** latest-model refresh → Task 1; Chinese providers → Task 1; Laya in the chart → Task 5; provider expensive/medium/cheap comparison for Anthropic/OpenAI/Google → Tasks 3, 4, 7; Chinese providers explicitly deferred, not silently dropped → noted in Global Constraints and Task 7 Step 4.

**Placeholder scan:** every step has runnable code or an exact command; Tasks 6–7 are the only steps without a fixed "expected diff" because they run against live data, but each still has a concrete command, a concrete expected file, and an explicit approval gate — no "TBD"/"handle edge cases" language.

**Type consistency:** `modelPool: Record<string, string>` is the same shape end to end (`MODEL_POOL`, `flattenTierPool`'s return, `classifyQuestion`'s and `classifyWithLaya`'s new parameter); `parseArgs`'s `pool: "wide" | "tiers"` union is reused identically in both CLIs; `Row`/`ClassificationResult` are untouched.

**Review Focus:** all five points map to a concrete test — pool sanity (Task 1), unknown-provider throw (Task 3), default-parameter backward compatibility (Task 2, exercised implicitly by the untouched `run-benchmark.test.ts`/`run-laya-benchmark.ts` tests still passing), zero-division guard (Task 5's second test), and the `--pool` value guard (Task 4).
