# data/

Vacía a propósito (`.gitignore` excluye `*.jsonl` y `raw/`).

## Formato esperado: `questions.jsonl`

JSON Lines, una pregunta por línea, shape `Question` de `src/dataset.ts`:

```jsonl
{"id":"lmsys-000123","text":"How do I fix a race condition in this Go goroutine?","source":"lmsys-chat-1m","tags":["go","concurrency"]}
{"id":"wildchat-000456","text":"Why does my React useEffect run twice in dev mode?","source":"wildchat-1m","tags":["react","javascript"]}
```

- `id` — único, prefijao con el dataset de origen pa trazabilidad.
- `text` — el prompt/pregunta tal cual la escribió la persona (el turno de
  usuario, no la respuesta del modelo).
- `source` — de qué dataset viene (ver `docs/research-datasets.md`).
- `tags` — opcional, si el filtrado inicial ya clasificó lenguaje/tema.

## Cómo se genera

Pendiente — ver `PROMPT.md`, pasos 1-2. Va un script en `scripts/` que
descargue/filtre el dataset elegido y vuelque aquí.
