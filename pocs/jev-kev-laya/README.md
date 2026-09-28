# POC: comparativa Jev, Kev y Laya

Esta carpeta documenta la comparación de tres motores de decisión tipada sobre la misma muestra local de preguntas de programación. No es un ranking de capacidad para programar ni una evaluación de los modelos que estos motores recomiendan.

El motivo, las hipótesis y los límites están en [WHY.md](./WHY.md). La implementación y los resultados permanecen en el proyecto raíz; esta carpeta no añade una segunda implementación.

## Qué se compara

| Motor | Integración usada | Contrato observado |
| --- | --- | --- |
| Jev | `~typesafe/jev-latest` mediante OpenRouter | `Choice` para `model_choice` y `Score` para `reasoning_effort`. |
| Kev 4B | `jaredpalmer/kev-4b` mediante OpenRouter | Exactamente las mismas preguntas estructuradas que Jev. |
| Laya | endpoint local `POST /v1/systemone`, modelo `typed-decisions` | Payload compatible: mismo estado, `Choice` y `Score`. |

Las tres rutas devuelven una recomendación; ninguna ejecuta el modelo recomendado. Las medidas válidas son disponibilidad, latencia observada, distribución de elección, distribución de esfuerzo, confianza reportada y acuerdo entre motores. El acuerdo **no** es exactitud: no existe una etiqueta de verdad que diga qué modelo debía resolver cada prompt.

`typesafe/jev-router` aparece en resultados locales solo como piloto generativo separado: usa Chat Completions y se le pidió JSON en texto. No tiene el mismo contrato estructurado, por lo que no se incluye como cuarto competidor.

## Dataset: no fue Kaggle

La muestra efectiva es **WildChat-1M**, obtenida desde [Hugging Face / allenai/WildChat-1M](https://huggingface.co/datasets/allenai/WildChat-1M), no desde Kaggle.

El preparador local [`scripts/prepare-wildchat.ts`](../../scripts/prepare-wildchat.ts) consulta el endpoint de filas de Hugging Face y conserva el primer mensaje de usuario que cumple estas condiciones:

- idioma English o Spanish;
- no `toxic` y no `redacted`;
- coincidencia con el filtro determinista de programación;
- máximo solicitado de 300 entradas, guardadas con `source: "wildchat-1m"`.

El JSONL de trabajo contiene texto de prompts, ID y tags, pero no país, IP hash, cabeceras ni el resto de metadata de WildChat. [WildChat paper](https://arxiv.org/abs/2405.01470) es la referencia académica del origen de los logs.

La muestra publicada de esta POC está en [`questions.jsonl`](./questions.jsonl) (300 preguntas) y es la que los informes del sitio incrustan. El resto de WildChat-1M no se incluye. Atribución obligatoria: *Contains information from WildChat-1M (allenai/WildChat-1M), which is made available under the ODC Attribution License.*

Kaggle solo se estudió como mirror de **LMSYS-Chat-1M**; no fue el dataset seleccionado ni consumido. Véase [Kaggle LMSYS mirror](https://www.kaggle.com/datasets/gmhost/lmsys-chat-1m) y el [dataset LMSYS original](https://huggingface.co/datasets/lmsys/lmsys-chat-1m). La decisión y sus motivos locales están en [research-datasets.md](./research-datasets.md).

## Evidencia local disponible

Los artefactos publicados de esta POC están en [`results/`](./results/). La carpeta `results/` de la raíz es solo espacio de trabajo (ignorado). Compara únicamente dentro del mismo pool y muestra:

| Corrida | Artefacto | Nota |
| --- | --- | --- |
| Jev, pool general | `results/benchmark-2026-09-27T14-44-37.993Z.jsonl` | 300/300 según su CSV resumen. |
| Laya, pool general | `results/laya-2026-09-27T14-44-37.980Z.jsonl` | 298/300 según su CSV resumen; conservar los dos fallos. |
| Kev, pool general | `results/kev-wide-2026-09-27T16-59-09.765Z.jsonl` | 296/300 según su CSV resumen; tiene una corrida de reintento separada. |
| Jev y Laya, tiers | `results/benchmark-tiers-2026-09-27T17-20-00Z.jsonl`, `results/laya-tiers-2026-09-27T17-20-00Z.jsonl` | Pool controlado, 100 preguntas; no mezclar con pool general. |

Los nombres de la tabla son rutas dentro de [`results/`](./results/).

Los análisis Jev/Laya ya publicados son [análisis inicial](./analysis/analysis-2026-09-27.md), [pool refrescado](./analysis/analysis-2026-09-27-refreshed-pool.md) y [tiers por proveedor](./analysis/analysis-provider-tiers-2026-09-27.md). No añaden aún una conclusión conjunta Jev/Kev/Laya: hacerlo requiere reconciliar explícitamente los reintentos de Kev y calcular los denominadores por ID compartido.

## Fuentes consultadas

| Tipo | Fuente | Uso |
| --- | --- | --- |
| Oficial | [TypeSafe AI: Introduction](https://docs.typesafe.ai/introduction) | Contrato de Jev: estado + preguntas tipadas, probabilidades, `Choice`/`Score`/`Noul`. |
| Proyecto de Kev | [jaredpalmer/kev](https://github.com/jaredpalmer/kev) | Contexto del modelo Kev 4B y su propuesta de motores de decisión Jev-like. |
| Proyecto de Laya | [LeonaDavinci/laya-system-one](https://github.com/LeonaDavinci/laya-system-one) | API compatible `POST /v1/systemone`, checkpoints y límites publicados por el proyecto. |
| Dataset primario | [allenai/WildChat-1M](https://huggingface.co/datasets/allenai/WildChat-1M) | Procedencia y campos del dataset consumido. |
| Paper | [WildChat: 1M ChatGPT Interaction Logs in the Wild](https://arxiv.org/abs/2405.01470) | Contexto metodológico del dataset. |
| Fuente local | [`scripts/run-benchmark.ts`](../../scripts/run-benchmark.ts), [`scripts/run-laya-benchmark.ts`](../../scripts/run-laya-benchmark.ts), [`scripts/run-candidate-benchmark.ts`](../../scripts/run-candidate-benchmark.ts) | Cómo se ejecutó cada variante y cómo se registran fallos/JSONL. |

Las características, costes y benchmarks declarados por proyectos externos no se tratan como resultados de esta POC. Los valores de este experimento son exclusivamente los JSONL y CSV locales indicados arriba.
