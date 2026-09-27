import assert from "node:assert/strict";
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadQuestions } from "./dataset.js";

async function withJsonl(contents: string, run: (path: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "jev-dataset-"));
  const path = join(directory, "questions.jsonl");
  try {
    await writeFile(path, contents, "utf-8");
    await run(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("loadQuestions yields a valid question", async () => {
  await withJsonl('{"id":"q1","text":"Fix this Go race","source":"fixture","tags":["go"]}\n', async (path) => {
    const questions = [];
    for await (const question of loadQuestions(path)) questions.push(question);
    assert.deepEqual(questions, [{ id: "q1", text: "Fix this Go race", source: "fixture", tags: ["go"] }]);
  });
});

test("loadQuestions reports the line for an invalid question", async () => {
  await withJsonl('{"id":"q1","text":"missing source"}\n', async (path) => {
    await assert.rejects(async () => {
      for await (const _question of loadQuestions(path)) { }
    }, (error: unknown) => error instanceof Error && error.message.includes(`${path}: line 1`) && error.message.includes("source"));
  });
});

test("loadQuestions closes its stream when the consumer stops early", async () => {
  await withJsonl('{"id":"q1","text":"first","source":"fixture"}\n{"id":"q2","text":"second","source":"fixture"}\n', async (path) => {
    const questions = loadQuestions(path);
    assert.equal((await questions.next()).value?.id, "q1");
    await questions.return(undefined);
    await rename(path, `${path}.moved`);
  });
});

test("loadQuestions skips blank lines and preserves source line numbers", async () => {
  await withJsonl('\n  \n{"id":"q1","text":"valid","source":"fixture"}\n', async (path) => {
    const questions = [];
    for await (const question of loadQuestions(path)) questions.push(question);
    assert.equal(questions.length, 1);
    assert.equal(questions[0]?.id, "q1");
  });
});

test("loadQuestions contextualizes malformed JSON with path and line", async () => {
  await withJsonl('\nnot json\n', async (path) => {
    await assert.rejects(async () => {
      for await (const _question of loadQuestions(path)) { }
    }, (error: unknown) => error instanceof Error && error.message.includes(`${path}: line 2 contains invalid JSON`));
  });
});

for (const field of ["id", "text", "source"] as const) {
  test(`loadQuestions rejects whitespace-only ${field}`, async () => {
    const question = { id: "q1", text: "valid", source: "fixture", [field]: " \t " };
    await withJsonl(`${JSON.stringify(question)}\n`, async (path) => {
      await assert.rejects(async () => {
        for await (const _question of loadQuestions(path)) { }
      }, (error: unknown) => error instanceof Error && error.message.includes(`${path}: line 1`) && error.message.includes(field));
    });
  });
}

test("loadQuestions rejects non-string tags with path and line", async () => {
  await withJsonl('{"id":"q1","text":"valid","source":"fixture","tags":[1]}\n', async (path) => {
    await assert.rejects(async () => {
      for await (const _question of loadQuestions(path)) { }
    }, (error: unknown) => error instanceof Error && error.message.includes(`${path}: line 1`) && error.message.includes("tags"));
  });
});
