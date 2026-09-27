# Jev benchmark minimum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a bounded Jev classification sample and produce trustworthy machine-readable results plus a small aggregate report.

**Architecture:** `src/dataset.ts` is the trust boundary for JSONL questions. `scripts/run-benchmark.ts` runs classifications sequentially and writes one JSONL result per question; it already exists in the uncommitted tree. `scripts/analyze-results.ts` will read those results and emit a compact CSV histogram without making API calls.

**Tech Stack:** Node 24, TypeScript strict/NodeNext, `tsx --test`, Node standard library, `@openrouter/sdk`.

**Spec:** `PROMPT.md`

## Global Constraints

- Work directly in this repository; do not create worktrees or commits.
- Preserve the existing uncommitted `scripts/run-benchmark.ts`, its test, `package-lock.json`, and package scripts unless a task explicitly changes them.
- Do not add dependencies; use Node standard-library APIs.
- Do not call Jev, download datasets, or read `.env` during automated tests.
- Keep benchmark execution sequential and require a positive integer `--limit`; the normal default remains 30.
- Use TDD: write a failing behavior test, observe it fail, then write the smallest implementation.

## Review Focus

- A malformed JSON line must identify the input file and its line number instead of yielding a vague parse failure.
- A JSON object missing `id`, `text`, or `source` must not reach the paid classifier.
- `--limit 0`, a decimal, or an omitted flag value must stop before any API call.
- Result-analysis must count failed classifications separately and must not invent a model or confidence for them.
- The analysis command must work from a non-empty JSONL result file without requiring `OPENROUTER_API_KEY`.

---

### Task 1: Validate the question JSONL boundary

**Files:**
- Modify: `src/dataset.ts`
- Create: `src/dataset.test.ts`

**Interfaces:**
- Produces: `loadQuestions(path?: string): AsyncGenerator<Question>`.
- Contract: each non-blank JSONL line is an object with non-empty string `id`, `text`, and `source`; `tags`, when present, is an array of strings.

- [ ] **Step 1: Write the failing tests**

```ts
test("loadQuestions yields a valid question", async () => {
  await withJsonl('{"id":"q1","text":"Fix this Go race","source":"fixture","tags":["go"]}\n', async (path) => {
    const questions = await Array.fromAsync(loadQuestions(path));
    assert.deepEqual(questions, [{ id: "q1", text: "Fix this Go race", source: "fixture", tags: ["go"] }]);
  });
});

test("loadQuestions reports the line for an invalid question", async () => {
  await withJsonl('{"id":"q1","text":"missing source"}\n', async (path) => {
    await assert.rejects(Array.fromAsync(loadQuestions(path)), /line 1.*source/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test src/dataset.test.ts`

Expected: the invalid-question test fails because `loadQuestions` currently yields the malformed object.

- [ ] **Step 3: Implement the smallest validator**

```ts
function parseQuestion(line: string, lineNumber: number, path: string): Question {
  const value: unknown = JSON.parse(line);
  if (!value || typeof value !== "object") throw new Error(`${path}: line ${lineNumber} must be an object`);
  const { id, text, source, tags } = value as Record<string, unknown>;
  if (![id, text, source].every((field) => typeof field === "string" && field.trim())) {
    throw new Error(`${path}: line ${lineNumber} requires non-empty id, text, and source`);
  }
  if (tags !== undefined && (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string"))) {
    throw new Error(`${path}: line ${lineNumber} tags must be an array of strings`);
  }
  return tags === undefined ? { id, text, source } : { id, text, source, tags };
}
```

Increment a local `lineNumber` for every line read and yield `parseQuestion(line, lineNumber, path)` for non-blank lines.

- [ ] **Step 4: Run the focused test and full suite**

Run: `npx tsx --test src/dataset.test.ts; npm test; npx tsc --noEmit`

Expected: all commands exit 0.

### Task 2: Make benchmark CLI input errors explicit

**Files:**
- Modify: `scripts/run-benchmark.ts`
- Modify: `scripts/run-benchmark.test.ts`

**Interfaces:**
- Produces: `parseArgs(args: readonly string[]): { inputPath: string; outputPath: string; limit: number }` exported for tests.
- Contract: `--input`, `--output`, and `--limit` require a following non-flag value; `--limit` is a positive integer.

- [ ] **Step 1: Write the failing tests**

```ts
test("parseArgs rejects a missing option value", () => {
  assert.throws(() => parseArgs(["--input"]), /--input requires a value/);
});

test("parseArgs rejects a non-positive or fractional limit", () => {
  assert.throws(() => parseArgs(["--limit", "0"]), /positive integer/);
  assert.throws(() => parseArgs(["--limit", "1.5"]), /positive integer/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test scripts/run-benchmark.test.ts`

Expected: the missing-value test fails because the current parser silently uses its fallback.

- [ ] **Step 3: Implement the smallest parser change**

Replace the current `value` helper with a helper that returns the fallback only when the flag is absent and throws when the flag is final or followed by another flag:

```ts
const option = (flag: string, fallback: string): string => {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
};
```

- [ ] **Step 4: Run the focused test and full suite**

Run: `npx tsx --test scripts/run-benchmark.test.ts; npm test; npx tsc --noEmit`

Expected: all commands exit 0.

### Task 3: Add offline result aggregation

**Files:**
- Create: `scripts/analyze-results.ts`
- Create: `scripts/analyze-results.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `summarizeResults(rows: readonly ClassificationResult[]): string`.
- Contract: return CSV with exact header `kind,value,count`; successful rows contribute one `model` and one `reasoning_effort` row; rows with `error` contribute one `error` row whose value is `classification_failed`.
- CLI: `npm run analyze -- results/benchmark.jsonl` writes the CSV to stdout and has no OpenRouter dependency.

- [ ] **Step 1: Write the failing test**

```ts
test("summarizeResults groups successful and failed classifications", () => {
  assert.equal(
    summarizeResults([
      { questionId: "a", modelChoice: "openai/gpt-5-mini", reasoningEffort: "low", latencyMs: 1 },
      { questionId: "b", modelChoice: "openai/gpt-5-mini", reasoningEffort: "high", latencyMs: 2 },
      { questionId: "c", latencyMs: 3, error: "rate limited" },
    ]),
    "kind,value,count\nerror,classification_failed,1\nmodel,openai/gpt-5-mini,2\nreasoning_effort,high,1\nreasoning_effort,low,1\n",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test scripts/analyze-results.test.ts`

Expected: FAIL with module-not-found for `scripts/analyze-results.js`.

- [ ] **Step 3: Implement the smallest aggregator and CLI**

Use a `Map<string, number>` keyed by `${kind},${value}`. Skip `modelChoice` and `reasoningEffort` for error rows. Sort CSV rows lexicographically before joining them. Read the one positional JSONL path with `readFile`, parse non-blank lines as `ClassificationResult`, and print `summarizeResults(rows)`.

Add this script:

```json
"analyze": "tsx scripts/analyze-results.ts"
```

- [ ] **Step 4: Run the focused test, CLI smoke test, and full suite**

Run: `npx tsx --test scripts/analyze-results.test.ts; npm test; npx tsc --noEmit`

Expected: all commands exit 0.

### Task 4: Execute one paid smoke sample only after explicit approval

**Files:**
- Create: `data/questions.jsonl`
- Create: `results/benchmark-*.jsonl` and `results/benchmark-*.summary.csv` through the runner

**Interfaces:**
- Consumes: a valid `data/questions.jsonl`, `.env` with `OPENROUTER_API_KEY`, and the runner from the existing uncommitted tree.
- Produces: up to 3 classifications plus their CSV summary.

- [ ] **Step 1: Create exactly three manually reviewed real developer prompts**

Write JSONL records with IDs `manual-001`, `manual-002`, and `manual-003`; set `source` to `manual-smoke`; use one debugging, one architecture, and one language/API prompt.

- [ ] **Step 2: Validate the input without calling Jev**

Run: `npx tsx -e "import { loadQuestions } from './src/dataset.ts'; console.log((await Array.fromAsync(loadQuestions())).length)"`

Expected: `3`.

- [ ] **Step 3: Ask the user for approval of the three paid calls**

Do not run the benchmark until the user explicitly authorizes this exact smoke sample.

- [ ] **Step 4: Run the approved smoke sample**

Run: `npm run classify -- --limit 3`

Expected: one `results/benchmark-*.jsonl` and its `.summary.csv`; stdout reports `processed:3`.

- [ ] **Step 5: Analyze the produced results offline**

Run: `npm run analyze -- results/<the-created-jsonl-file>`

Expected: CSV contains the header `kind,value,count` and no API call occurs.
