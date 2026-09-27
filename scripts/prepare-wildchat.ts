import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Question } from "../src/dataset.js";

const ENDPOINT = "https://datasets-server.huggingface.co/rows?dataset=allenai%2FWildChat-1M&config=default&split=train";
const PROGRAMMING = /\b(api|app|bug|cache|code|coding|compile|css|database|debug|deploy|docker|error|exception|function|git|html|java(?:script)?|kubernetes|linux|node(?:\.js)?|package|program|python|query|react|rust|server|sql|typescript|web|yaml)\b/i;
const TAGS: Record<string, RegExp> = {
  python: /\bpython\b/i, javascript: /\b(javascript|typescript|node(?:\.js)?|react|angular|vue)\b/i,
  "c-family": /\b(c\+\+|c#|java)\b/i, go: /\b(golang|go routine|goroutine)\b/i,
  rust: /\brust\b/i, sql: /\b(sql|postgres|mysql|sqlite)\b/i,
  debug: /\b(bug|debug|error|exception|fix|not working|traceback)\b/i,
  design: /\b(architect|design|scalab|microservice|system design)\b/i,
};

type WildChatRow = { conversation_hash: string; language: string; toxic: boolean; redacted: boolean; conversation: { role: string; content: string }[] };
type Page = { rows: { row: WildChatRow }[]; num_rows_total: number };

async function getPage(url: string, fetchPage: typeof fetch): Promise<Page> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetchPage(url);
    if (response.ok) return response.json() as Promise<Page>;
    if ((response.status !== 429 && response.status < 500) || attempt === 2) throw new Error(`WildChat request failed: ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1_000));
  }
  throw new Error("WildChat request failed");
}

export function toQuestion(row: WildChatRow): Question | undefined {
  const text = row.conversation.find((message) => message.role === "user")?.content?.trim();
  if (!text || !["English", "Spanish"].includes(row.language) || row.toxic || row.redacted || !PROGRAMMING.test(text)) return undefined;
  const tags = Object.entries(TAGS).filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag);
  return { id: `wildchat-${row.conversation_hash}`, text, source: "wildchat-1m", tags };
}

export async function prepareWildChat({ limit, pages, outputPath, fetchPage = fetch }: { limit: number; pages: number; outputPath: string; fetchPage?: typeof fetch }): Promise<number> {
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(pages) || pages < 1) throw new Error("limit and pages must be positive integers");
  const questions = new Map<string, Question>();
  for (let page = 0; page < pages && questions.size < limit; page += 2) {
    const payloads = await Promise.all(Array.from({ length: Math.min(2, pages - page) }, async (_, index) => {
      const offset = Math.floor((837_989 - 100) * (page + index) / Math.max(1, pages - 1));
      return getPage(`${ENDPOINT}&offset=${offset}&length=100`, fetchPage);
    }));
    for (const payload of payloads) for (const { row } of payload.rows) {
      const question = toQuestion(row);
      if (question) questions.set(question.id, question);
      if (questions.size === limit) break;
    }
  }
  const destination = resolve(outputPath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${[...questions.values()].map(JSON.stringify).join("\n")}\n`);
  return questions.size;
}

function parseArgs(args: readonly string[]): { limit: number; pages: number; outputPath: string } {
  const value = (flag: string, fallback: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] ?? (() => { throw new Error(`${flag} requires a value`); })() : fallback;
  return { limit: Number(value("--limit", "300")), pages: Number(value("--pages", "200")), outputPath: value("--output", "data/questions.jsonl") };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { limit, pages, outputPath } = parseArgs(process.argv.slice(2));
  prepareWildChat({ limit, pages, outputPath }).then((count) => console.log(JSON.stringify({ outputPath, count }))).catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
