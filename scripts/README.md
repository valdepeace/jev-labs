# scripts/

| Script | Qué hace |
| --- | --- |
| `paths.ts` | Resuelve el directorio de resultados: `--out-dir`, `RESULTS_DIR` o `results/`. Ningún runner lleva rutas hardcodeadas. |
| `prepare-wildchat.ts` | Toma páginas de WildChat-1M, filtra prompts de programación seguros en inglés/español y escribe solo los campos permitidos en `data/questions.jsonl`. Por defecto: máximo 300 prompts y 200 páginas de 100 filas. |
| `run-benchmark.ts` | Runner base: recorre las preguntas, llama a `classifyQuestion` (`src/classify.ts`) por cada una y escribe JSONL + `.summary.csv`. Exporta `runBenchmark` y `parseArgs`. |
| `run-laya-benchmark.ts` | Igual, contra el endpoint local de Laya. |
| `run-candidate-benchmark.ts` | Corridas puntuales de candidatos Kev 4B / Jev Router, incluidos reintentos de fallos. |
| `analyze-results.ts` | Agregados CSV desde los JSONL. |
| `report.ts` | Informe comparativo HTML (SVG a mano, sin librerías). Exporta `renderReport`, `renderRouterReport`, `buildComparisonHtml` y `buildRouterHtml`; `site.ts` los reutiliza. |
| `pocs.ts` | Registro de POCs del sitio: slug, pregunta, fecha y qué páginas/artefactos publica cada una. **Añadir una POC aquí es lo que la publica.** |
| `site.ts` | Genera `dist/site/` (hub + una carpeta por POC) desde `site/` y los JSONL versionados. |
| `audit-secrets.ts` | Escanea el árbol versionado buscando claves de OpenRouter. Falla si encuentra alguna. |

Los runners escriben por defecto en `results/` (scratch, ignorado). Para
publicar una corrida, apunta la salida a la POC: `--out-dir pocs/<slug>/results`
(o el script de `package.json`, que ya lo hace).
