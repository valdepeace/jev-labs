# Por qué existe esta POC

Jev, Kev y Laya prometen responder decisiones estructuradas sin generar texto libre, pero no comparten implementación, despliegue ni necesariamente calibración. Compararlos sobre los mismos prompts permite comprobar si producen señales útiles para routing antes de elegir uno para integrarlo.

La pregunta no es “qué motor es mejor” en abstracto. Es:

> Para una misma petición de programación y un mismo conjunto de candidatos, ¿qué decisión emite cada motor, con qué confianza, latencia y disponibilidad?

## Hipótesis de trabajo

- Una elección de modelo sólo es utilizable si pasa una política externa; una probabilidad alta no prueba que la ruta sea correcta.
- Un pool amplio puede reducir confianza o concentrar elecciones; hay que medir ambas cosas por motor.
- Laya local, Jev y Kev no deben suponerse intercambiables por compartir los nombres `choice` y `score`.
- Un desacuerdo entre motores es una señal de incertidumbre o diferencias de sesgo; no establece cuál tiene razón.

## Diseño mínimo

Se reutilizan la misma muestra local de WildChat filtrada a programación, las mismas preguntas `model_choice` y `reasoning_effort`, y el mismo pool en cada variante comparable. Cada ejecución guarda un JSONL por pregunta y conserva los errores; no se descartan para mejorar métricas.

La comparación separa pool general y pool de tiers. También separa el piloto de Jev Router, porque pedir JSON a un modelo generativo no equivale a una respuesta tipada.

## Qué no demuestra

No mide calidad de las respuestas que produciría el modelo seleccionado, éxito de herramientas, coste de una tarea completa, robustez multi-turno ni calibración estadística contra etiquetas de verdad. Tampoco autoriza usar alguno como router de producción.

Antes de cualquier adopción: emparejar por ID los resultados comparables, definir la métrica de outcome, calibrar por backend y ejecutar primero en shadow mode con receipts. La recomendación sigue estando separada de policy, resolución de proveedor y ejecución.
