/**
 * Escribe el artefacto de la simulación. El informe se renderiza desde ese
 * fichero versionado, no recalculando: así cada cifra publicada se puede
 * recalcular desde el JSONL, igual que en el resto de POCs del lab.
 *
 *   npm run cache-affinity
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSimulation } from "./scenarios.js";

export const SIMULATION_PATH = "pocs/cache-affinity/results/simulation.jsonl";

async function main(): Promise<void> {
  const target = resolve(process.argv[2] ?? SIMULATION_PATH);
  const artifact = buildSimulation();
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(artifact)}\n`);
  const cold = artifact.scenarios.find((scenario) => scenario.id === "pool16");
  const sticky = artifact.scenarios.find((scenario) => scenario.id === "sticky");
  console.log(JSON.stringify({
    outputPath: target,
    scenarios: artifact.scenarios.length,
    poolMultiple: cold && sticky ? Number((cold.result.total / sticky.result.total).toFixed(2)) : null,
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
