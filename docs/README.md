# docs/

Documentación **transversal** del lab. Lo específico de cada experimento vive
en su propia carpeta.

## Qué vive aquí

- Este `README.md`: el mapa de dónde va cada cosa.

## Qué NO vive aquí

| Contenido | Dónde va |
| --- | --- |
| Pregunta, alcance y fuentes de un experimento | `pocs/<slug>/README.md` |
| Motivos, hipótesis y límites de una POC | `pocs/<slug>/WHY.md` |
| Notas de diseño y planificación de una POC | `pocs/<slug>/plans/` |
| Análisis con fecha de una POC | `pocs/<slug>/analysis/` |
| Artefactos publicados de una corrida | `pocs/<slug>/results/` |
| Clientes, runners y contrato compartido | `src/` y `scripts/` |
| Fuentes a mano del sitio publicado | `site/` |

`results/` de la raíz es espacio de trabajo (ignorado por git). Para publicar
una corrida, copia los artefactos elegidos a `pocs/<slug>/results/`.

## Cómo añadir una POC

Ver la checklist en [`AGENTS.md`](../AGENTS.md).
