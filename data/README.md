# data/

Directorio de trabajo para la muestra de preguntas. `.gitignore` excluye
`*.jsonl` y `raw/`: **el dataset no se publica**.

## Formato esperado: `questions.jsonl`

JSON Lines, una pregunta por línea, shape `Question` de `src/dataset.ts`:

```jsonl
{"id":"lmsys-000123","text":"How do I fix a race condition in this Go goroutine?","source":"lmsys-chat-1m","tags":["go","concurrency"]}
{"id":"wildchat-000456","text":"Why does my React useEffect run twice in dev mode?","source":"wildchat-1m","tags":["react","javascript"]}
```

- `id` — único, prefijao con el dataset de origen pa trazabilidad.
- `text` — el prompt/pregunta tal cual la escribió la persona (el turno de
  usuario, no la respuesta del modelo).
- `source` — de qué dataset viene (ver `pocs/jev-kev-laya/research-datasets.md`).
- `tags` — opcional, si el filtrado inicial ya clasificó lenguaje/tema.

## Cómo se genera

```bash
npm run prepare
```

`scripts/prepare-wildchat.ts` consulta el endpoint de filas de
`allenai/WildChat-1M` en Hugging Face, filtra idioma (English/Spanish), descarta
filas `toxic` o `redacted`, aplica el filtro determinista de programación y
guarda hasta 300 entradas con `source: "wildchat-1m"`.

## Atribución

Contains information from WildChat-1M (allenai/WildChat-1M), which is made
available under the ODC Attribution License.
