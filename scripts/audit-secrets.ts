/**
 * Falla si el árbol versionado contiene una clave de OpenRouter o una
 * asignación con valor. Paso previo obligatorio a publicar: el repo es público
 * y la clave no puede colarse ni en un fichero nuevo ni en un `git add` a
 * ciegas.
 *
 * Solo mira ficheros trackeados (`git ls-files`): los `.env` están ignorados y
 * no se publican, pero un `.env` renombrado o pegado en un README sí se caza.
 */
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

const PATTERNS: readonly { label: string; regex: RegExp }[] = [
  // Formato real de OpenRouter: `sk-or-v1-` + hex. Sin el guion el patrón no
  // casa y la auditoría daría un falso "todo limpio".
  { label: "OpenRouter key", regex: /sk-or-v1-[0-9a-f]{16,}/i },
  // Asignación con valor literal largo; `<placeholder>`, `$VAR` y los ejemplos
  // truncados tipo `sk-or-...` no cuentan.
  { label: "OPENROUTER_API_KEY assignment", regex: /OPENROUTER_API_KEY\s*=\s*[^<\s$]\S{15,}/ },
];

export interface Finding {
  path: string;
  line: number;
  label: string;
}

function isProbablyBinary(content: string): boolean {
  return content.includes("\u0000");
}

export function scanText(path: string, content: string): Finding[] {
  if (isProbablyBinary(content)) return [];
  const findings: Finding[] = [];
  content.split(/\r?\n/).forEach((line, index) => {
    for (const { label, regex } of PATTERNS) {
      if (regex.test(line)) findings.push({ path, line: index + 1, label });
    }
  });
  return findings;
}

export async function scanTrackedFiles(root = "."): Promise<Finding[]> {
  const { stdout } = await run("git", ["-C", root, "ls-files"], { maxBuffer: 32 * 1024 * 1024 });
  const paths = stdout.split(/\r?\n/).filter(Boolean);
  const findings: Finding[] = [];
  for (const path of paths) {
    const absolute = path.startsWith("/") ? path : `${root}/${path}`;
    let content: string;
    try {
      content = await readFile(absolute, "utf8");
    } catch {
      continue; // submodule, enlace roto o fichero que git lista y no existe
    }
    findings.push(...scanText(path, content));
  }
  return findings;
}

async function main(): Promise<void> {
  const findings = await scanTrackedFiles();
  if (!findings.length) {
    console.log("audit: no secrets in tracked files");
    return;
  }
  for (const { path, line, label } of findings) console.error(`${path}:${line}: ${label}`);
  console.error(`audit: ${findings.length} possible secret(s) in tracked files`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
