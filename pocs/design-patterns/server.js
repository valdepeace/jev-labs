import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { OpenRouter } from "@openrouter/sdk";

const root = dirname(fileURLToPath(import.meta.url));
const tiers = {
  local: "Private/local model when the task is simple and capabilities allow it.",
  cheap: "Low-cost capable model for routine coding and analysis.",
  strong: "Strong coding and reasoning model for multi-step work.",
  frontier: "Highest-capability model for exceptional complexity only.",
};

export function validateRequest(value) {
  if (!value || typeof value.task !== "string" || !value.task.trim() || value.task.length > 6_000) throw new Error("task must be a non-empty string of at most 6000 characters");
  return { task: value.task.trim() };
}

export function normalizeDecision(answers) {
  const answer = answers?.capability_tier;
  if (!answer || typeof answer.choice !== "string" || !(answer.choice in tiers)) throw new Error("Jev returned an invalid capability tier");
  return {
    choice: answer.choice,
    confidence: typeof answer.confidence === "number" ? answer.confidence : undefined,
    probabilities: answer.probabilities ?? undefined,
  };
}

function send(response, status, body, type = "application/json") {
  response.writeHead(status, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" });
  response.end(typeof body === "string" ? body : JSON.stringify(body));
}

async function body(request) {
  let content = "";
  for await (const chunk of request) {
    content += chunk;
    if (content.length > 8_000) throw new Error("request body is too large");
  }
  return JSON.parse(content);
}

async function serveFile(response, filename, type) {
  try {
    send(response, 200, await readFile(resolve(root, filename), "utf8"), type);
  } catch {
    send(response, 404, { error: "not found" });
  }
}

export function createLabServer(client = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })) {
  return createServer(async (request, response) => {
    if (request.method === "OPTIONS") return send(response, 204, "");
    if (request.method === "GET" && ["/", "/lab.html"].includes(request.url)) return serveFile(response, "lab.html", "text/html");
    if (request.method === "GET" && request.url === "/lab.js") return serveFile(response, "lab.js", "text/javascript");
    if (request.method !== "POST" || request.url !== "/api/decision") return send(response, 404, { error: "not found" });
    try {
      if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not configured on the server");
      const { task } = validateRequest(await body(request));
      const result = await client.alpha.decisions.create({
        decisionsRequest: {
          model: "~typesafe/jev-latest",
          state: task,
          questions: {
            capability_tier: { type: "choice", instructions: "Choose the minimum capability tier that can handle this task.", criteria: tiers },
          },
        },
      }, { timeoutMs: 15_000, retries: { strategy: "backoff", backoff: { initialInterval: 500, maxInterval: 1_000, exponent: 2, maxElapsedTime: 1_500 } }, retryCodes: ["503"] });
      return send(response, 200, { decision: normalizeDecision(result.answers), usage: result.usage });
    } catch (error) {
      return send(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  createLabServer().listen(8788, "127.0.0.1", () => console.log("Pattern lab: http://127.0.0.1:8788"));
}
