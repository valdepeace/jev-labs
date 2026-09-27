# scripts/

Scripts disponibles:

1. **`prepare-wildchat.ts`** — toma páginas repartidas por WildChat-1M,
   filtra prompts de programación seguros en inglés/español y escribe sólo
   los campos permitidos en `data/questions.jsonl`. Por defecto: máximo 300
   prompts y 200 páginas de 100 filas; no descarga el dataset completo.
2. **`run-benchmark.ts`** — recorre `data/questions.jsonl` (o una muestra), llama a
   `classifyQuestion` (`src/classify.ts`) por cada una, y vuelca resultados
   a CSV/JSON pa análisis. `jev/poc/jev-triage-ts/src/run-benchmark.ts`
   tiene un patrón parecido (progreso en vivo, medición de latencia) que
   sirve de referencia, aunque ahí compara providers en vez de preguntas.
