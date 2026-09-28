import { join } from "node:path";

/** Directorio de resultados por defecto: `results/` en la raíz (scratch, ignorado). */
export const DEFAULT_OUT_DIR = "results";

/**
 * Lee el directorio de resultados de `--out-dir <dir>`, si no de `RESULTS_DIR`
 * y si no del scratch de la raíz. Los runners no llevan rutas hardcodeadas: el
 * workflow de publicación pasa `--out-dir pocs/<slug>/results`.
 */
export function resolveOutDir(args: readonly string[] = process.argv.slice(2), env: Record<string, string | undefined> = process.env): string {
  const index = args.indexOf("--out-dir");
  let fromFlag: string | undefined;
  if (index !== -1) {
    fromFlag = args[index + 1];
    if (!fromFlag || fromFlag.startsWith("--")) throw new Error("--out-dir requires a value");
  }
  return fromFlag ?? env.RESULTS_DIR ?? DEFAULT_OUT_DIR;
}

/** Nombre con marca de tiempo, p. ej. `benchmark-2026-09-27T14-44-37.993Z`. */
export function runName(prefix: string, now: Date = new Date()): string {
  return `${prefix}-${now.toISOString().replaceAll(":", "-")}`;
}

/** Ruta de salida dentro del directorio de resultados. */
export function outFile(outDir: string, name: string): string {
  return join(outDir, name);
}
