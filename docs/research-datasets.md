# Candidatos de dataset (investigación inicial)

Búsqueda hecha el 2026-09-27 (WebSearch). Objetivo: preguntas REALES de
programadores hechas a un asistente de IA mientras desarrollan — no bancos
de ejercicios/exámenes sintéticos.

## Buenos candidatos (conversaciones reales humano↔LLM)

### LMSYS-Chat-1M

- 1M conversaciones reales con 25 LLMs distintos, recogidas abril-agosto
  2023 desde Chatbot Arena (chat single-model + comparaciones side-by-side).
  Cubre 150+ idiomas y, según el paper, es "content-rich... software
  errors and solutions, software design, and programming".
- **Mirror en Kaggle:** https://www.kaggle.com/datasets/gmhost/lmsys-chat-1m
- Original: https://huggingface.co/datasets/lmsys/lmsys-chat-1m
- Paper: https://arxiv.org/abs/2309.11998

### WildChat-1M

- 1M conversaciones reales usuario↔ChatGPT (2.5M turnos), recogidas
  ofreciendo acceso gratuito a ChatGPT a cambio de opt-in pa loggear la
  transcripción. Incluye metadata (idioma, país, headers).
- Solo en HuggingFace, sin mirror confirmao en Kaggle:
  https://huggingface.co/datasets/allenai/WildChat-1M
- Paper: https://arxiv.org/abs/2405.01470

Ambos son multi-dominio — hay que filtrar los turnos que sean realmente
preguntas de programación (por idioma detectao del código, keywords, o
usando el propio Jev/un LLM barato como filtro previo, con cuidao de no
sesgar la muestra hacia lo que Jev ya "entiende bien").

## Candidatos descartaos (no son lo que buscamos)

Encontraos en la primera pasada de búsqueda, pero son bancos de ejercicios
o preguntas de entrevista generadas/curadas, NO prompts reales de
desarrolladores a una IA:

- "Coding Questions Dataset" (Kaggle) — preguntas tipo LeetCode con
  input/output/tests.
- "Python Programming Questions Dataset" (Kaggle) — preguntas + solución en
  Python, generadas pa entrenar/evaluar modelos de código.
- "Software Engineering Interview Questions Dataset" (Kaggle) — 250
  preguntas de entrevista FAANG-style.
- "Coding Questions with Solutions" (Kaggle) — niveles
  introductorio/entrevista/competición.

## Pendiente de investigar

- StackExchange Data Dump (Stack Overflow) filtrao por preguntas
  etiquetadas con herramientas de IA (`github-copilot`, `chatgpt`, etc.) —
  son preguntas de developers, pero sobre la herramienta, no
  necesariamente "prompts que le hacen a la IA".
- Logs públicos de `aider` o extensiones tipo Continue/Cursor si algún
  repo de GitHub los ha compartido anonimizaos (no confirmao que exista
  ninguno con volumen grande y licencia clara).
- Revisar si OpenRouter o algún proveedor tiene su propio dataset de
  prompts de programación público (además de LMSYS/WildChat, que ya
  incluyen tráfico de varios proveedores).

## Fuente elegida

**WildChat-1M**. A 2026-09-27 su ficha de Hugging Face expone 838k filas,
licencia ODC-By y el campo `conversation`; LMSYS exige aceptar un acuerdo de
acceso y prohíbe redistribuir el dataset. Para evitar ese paso manual y la
restricción de transferencia, esta POC parte de WildChat.

El filtrado se hará sobre el primer turno de usuario de conversaciones
`English` o `Spanish`, excluyendo filas `toxic` o `redacted`; después se
muestreará hasta 300 prompts por categorías detectables sin LLM (lenguaje,
debug, diseño y pregunta general). El archivo final contendrá sólo
`id`, `text`, `source` y `tags`, nunca IP, país ni headers.
