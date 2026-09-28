# POC: afinidad de caché en el router de modelos

**Pregunta:** ¿cuánto cuesta cambiar de modelo a mitad de sesión, y a partir de qué
diferencia de precio amortiza?

**Respuesta corta:** con 50.000 tokens de prefijo estable y los ratios documentados del
proveedor, un router que cambia de modelo cada turno cuesta **5,16×** lo que una sesión
que se queda en un modelo. Y el acantilado no lo dispara el cambio, sino que el pool
llegue a ser tan grande como la ventana del TTL: con turnos de ~30 s y TTL de 5 minutos,
**a partir de 10 modelos el pool deja de reutilizar caché por completo**.

El informe con tablas y gráficos está en el sitio: `cache-affinity/report.html`.

## Por qué

La caché de prompt está indexada **por modelo**, no por conversación. Cada modelo tiene su
propio linaje, así que entrar en un modelo frío obliga a reescribir el prefijo entero a
precio de escritura. En un agente de código el prefijo (system prompt + definiciones de
herramientas + historial) domina la petición, y el ahorro que persigue el router —token
marginal más barato— es uno o dos órdenes de magnitud menor que la pérdida.

## Resultados

| Escenario | Coste | vs fijo |
| --- | ---: | ---: |
| Modelo fijo | $0,1308 | 1,00× |
| Dos modelos alternos | $0,1934 | 1,48× |
| Ciclo por el pool de 16 | $0,6741 | **5,16×** |
| Mismo modelo, otro endpoint | $0,1934 | 1,48× |

Amortización del cambio frente al cociente de precios (ratios de Anthropic: escritura
1,25×, lectura 0,1×):

| Modelo nuevo | Turnos que hay que quedarse |
| --- | ---: |
| mismo precio | nunca |
| 10% más barato (0,9×) | 72 |
| 20% más barato (0,8×) | 32 |
| la mitad (0,5×) | 8 |
| un quinto (0,2×) | 2 |
| un décimo (0,1×) | 0 (el turno frío ya gana) |

## Reproducir

```powershell
npm run cache-affinity   # regenera results/simulation.jsonl
npm run site             # renderiza el informe en dist/site/cache-affinity/
npm test                 # cubre la aritmetica del modelo
```

Sin credenciales y sin red: el modelo es determinista y el informe se renderiza desde el
JSONL versionado, así que cada cifra se puede recalcular.

## Qué no mide

La tasa de acierto real del proveedor, el coste de las llamadas al clasificador, ni la
calidad de la decisión de routing. Cambiar de modelo puede seguir siendo correcto por
otras razones; lo que este informe da es **el suelo de coste que ese cambio tiene que
superar para pagarse a sí mismo**.

## Ficheros

| Fichero | Qué es |
| --- | --- |
| `cache-cost.ts` | El modelo: caché por modelo, TTL, prefijo creciente, amortización. |
| `cache-cost.test.ts` | La aritmética, incluida la aproximación de prefijo largo. |
| `scenarios.ts` | Escenarios, barrido de precios y barrido de tamaño de pool. |
| `run-simulation.ts` | Escribe `results/simulation.jsonl`. |
| `charts.ts` | Primitivas SVG (barras y series de líneas), sin dependencias. |
| `report.ts` | El informe HTML. |
| `charts.ts` + `report.test.ts` | Que el informe no imprima `NaN` ni `Infinity`, y que el artefacto no esté obsoleto. |
| `plans/` | El diseño acordado antes de implementar. |
