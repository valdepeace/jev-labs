# poc-jev-agent-coder

POC pa probar el clasificador **Jev** (System One, vía OpenRouter) contra un
listado grande de preguntas *reales* de programadores, con un pool de
modelos mucho más ancho que las POCs anteriores (10-15+ en vez de 3), pa ver
cómo se comporta `model_choice` según el tipo de pregunta.

**Estado: terminá.** 300 preguntas reales de WildChat-1M clasificás contra
Jev (y contra Laya en local, pa comparar), analizás y con conclusiones
escritas en `docs/analysis-2026-09-27.md`. `PROMPT.md` se deja como
histórico del encargo original.

## Por qué existe esta carpeta

Viene de dos trabajos previos:

- **`E:\workspace\personal\jev\poc\jev-triage-ts`** — la POC hermana en la
  que se probó Jev pa triage de tickets de soporte y para decidir
  FAQ-enlatada-vs-LLM (`src/support-router.ts`). Mismo stack (Node + TS +
  `@openrouter/sdk`), mismo contrato System One
  (`client.alpha.decisions.create({ model, state, questions })`). Esta POC
  reutiliza ese cliente y ese patrón, pero cambia el dominio: en vez de
  tickets de soporte, preguntas de programación; y en vez de decidir
  "FAQ o LLM", decide "qué modelo y qué reasoning effort".
- **`E:\workspace\personal\crush\internal\router`** — la implementación en
  Go de exactamente esta idea, en producción dentro de Crush (el router de
  reasoning-effort/modelo pre-llamada). `decide.go` tiene la tabla de
  descripciones de familias de modelo (sacada de models.dev) que sirve de
  punto de partida pa las `criteria` de `model_choice` aquí. El
  `docs/superpowers/plans/2026-09-26-router-summary.md` de ese repo
  documenta por qué se acabó necesitando un floor de confianza mínima pa
  `model_choice` — relevante si aquí se observa el mismo problema al
  ampliar el pool de modelos.

## Estructura

```
poc-jev-agent-coder/
├── PROMPT.md                    # encargo original (histórico)
├── README.md                    # este fichero
├── package.json / tsconfig.json # stack: Node + TS + @openrouter/sdk (igual que jev-triage-ts)
├── .env.example                 # OPENROUTER_API_KEY
├── src/
│   ├── models.ts                 # pool de 12 modelos + descripciones
│   ├── classify.ts                # cliente Jev: reasoning_effort + model_choice
│   ├── laya.ts                    # mismo contrato contra Laya local, pa comparar
│   └── dataset.ts                 # interfaz Question + loader de data/questions.jsonl
├── data/
│   ├── README.md                  # formato de questions.jsonl
│   └── questions.jsonl            # 300 preguntas reales filtrás de WildChat-1M (no versionao)
├── scripts/
│   ├── prepare-wildchat.ts        # descarga/filtra WildChat-1M → questions.jsonl
│   ├── run-benchmark.ts           # corre classifyQuestion sobre el dataset
│   ├── run-laya-benchmark.ts      # ídem contra Laya local
│   ├── analyze-results.ts         # agregación offline (CSV) de un results/*.jsonl
│   └── report.ts                  # informe HTML comparativo Jev vs Laya
└── docs/
    ├── research-datasets.md       # candidatos investigaos (Kaggle + HuggingFace)
    └── analysis-2026-09-27.md     # resultados y conclusiones de la corrida final
```

## Setup

```bash
npm install
cp .env.example .env   # rellena OPENROUTER_API_KEY
npm run prepare        # genera data/questions.jsonl desde WildChat-1M
npm run classify        # corre el benchmark contra Jev (results/benchmark-*.jsonl)
npm run analyze -- results/benchmark-<timestamp>.jsonl   # agregación offline
```

Resultados y conclusiones de la corrida ya hecha (300 preguntas): ver
`docs/analysis-2026-09-27.md`.

## Referencias

- Contrato System One / Jev: `jev/poc/jev-triage-ts/docs/jev-api-profundizacion.md`
  y `jev/poc/jev-triage-ts/jev-api-openapi.yaml`.
- `crush/internal/router/decide.go` — `BuildQuestions`, `modelFamilyDescriptions`.
- `crush/internal/router/backends.go` — por qué no se hardcodean presets de
  servidores locales de terceros (Kev/Laya/rizzo-flow) como si fueran
  producto — mismo criterio aplica aquí si se listan modelos "no
  reconocibles" por el usuario medio.
