# Análisis: seis routers frente al estado de caché (2026-09-28)

**Workloads:** seis sesiones de código de 20 a 40 turnos, de 10K a 150K tokens de prefijo
estable, con picos de dificultad declarados. Un workload de control con dificultad uniforme y
otro con contenido volátil cada cinco turnos.
**Pool:** ocho modelos de tres proveedores, con precios **relativos** al precio base de entrada
y capacidades 1–3. Las cifras son múltiplos, no tarifas.
**Ratios:** escritura `1,25×`, lectura `0,1×` (Anthropic, TTL de 5 minutos), mínimo cacheable
`1.024` tokens.
**Artefacto:** `../results/simulation.jsonl`, regenerable con `npm run cache-affinity`.

## 1. El resultado principal va contra la hipótesis de partida

La hipótesis era que elegir siempre el modelo más barato por petición sale caro, porque
desperdicia cachés calentadas. Con un baseline honesto —el modelo fijo tiene que cubrir la
dificultad **máxima** de la sesión, que es la única forma de fijar un modelo en una sesión con
picos— ocurre lo contrario en casi todos los workloads:

| Estrategia | Repo 10K | Repo 40K | Repo 100K | Tools | Pausas | Cortos |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Modelo fijo (cubre el pico) | 1,00× | 1,00× | 1,00× | 1,00× | 1,00× | 1,00× |
| El más barato por petición | 1,00× | 0,63× | **0,60×** | 0,93× | **0,46×** | 0,55× |
| Lo mismo repartiendo carga | **3,99×** | 2,04× | 2,05× | 1,81× | 0,83× | 1,12× |
| Calidad con margen | 3,00× | 0,97× | 0,94× | 1,16× | 0,95× | 0,94× |
| Consciente de la caché | 1,00× | 1,02× | 1,02× | **0,94×** | **0,44×** | 0,55× |
| Regla de dos líneas | 1,00× | 1,02× | 1,02× | **0,94×** | **0,44×** | 0,94× |

El ahorro por token (elegir un modelo entre 5 y 20 veces más barato) supera la penalización de
reescribir el prefijo. El router consciente de la caché gana donde el ahorro por token **no
existe**: contra un router inestable (2,05× → 1,02×) y dentro de una banda de precios estrecha.

## 2. El router inestable es el único perdedor claro

Repartir carga entre candidatos equivalentes sin mirar la caché llega a **3,99×** sin ganar un
céntimo por token: los candidatos cuestan lo mismo, así que el sobrecoste es puro desperdicio.
Es también el patrón más común en producción, porque el reparto se decide por salud o por tasa
de uso. Un router determinista no sufre esto **aunque no sepa nada de caché**.

## 3. La caché no es lo que más pesa: el TTL sí

Mismo patrón (dos modelos alternos), prefijo de 40K, TTL de 5 minutos, variando el ritmo:

| Ritmo entre turnos | Acierto de caché | Coste |
| --- | ---: | ---: |
| 10 s | 90% | 1,15× |
| 30 s | 90% | 1,15× |
| 60 s | 90% | 1,15× |
| **150 s** | **0%** | **5,72×** |
| 300 s – 30 min | 0% | 5,72× |

No hay degradación gradual: la tasa de acierto es plana mientras las visitas caigan dentro de
la ventana y cae a cero en cuanto una llega tarde. Es el salto más brusco de todo el estudio y
lo sufre igual un modelo fijo, porque **el TTL corre en reloj, no en turnos**.

## 4. El tamaño del pool engaña; lo que importa es el tiempo de revisita

| Patrón | Coste | Acierto |
| --- | ---: | ---: |
| `A A A A A A` | 1,00× | 97% |
| `A B B B A` | 1,08× | 93% |
| `A B A B A B` | 1,09× | 93% |
| `A A B A A` | 1,12× | 93% |
| `A B C A B C` | 1,31× | 90% |
| `A B C D A` | **2,10×** | 83% |

Con dos linajes alternos cada caché sobrevive al turno del otro y el sobrecoste es del 9%. Un
pool de 16 con turnos de 30 s revisita cada 8 minutos y no reutiliza nada.

## 5. Las condiciones del cruce

Barrido con el nivel intermedio **al mismo precio** que el pico, para que lo único en juego sea
la caché:

| Precio del nivel trivial | El más barato | Reparto de carga | Consciente de la caché |
| --- | ---: | ---: | ---: |
| 1,00× | 1,49× | 1,50× | **1,19×** |
| 0,50× | 1,28× | 1,31× | **1,19×** |
| 0,30× | 1,20× | 1,24× | **1,19×** |
| 0,20× | **1,16×** | 1,20× | 1,19× |
| 0,10× | **1,12×** | 1,16× | 1,19× |

El cruce está entre 0,20× y 0,30×. El router consciente de la caché gana 9 de 11 tramos y su
ventaja se agota cuando el ahorro por token supera la penalización.

## 6. Una regla de dos líneas casi siempre basta

«Quédate mientras tu caché esté viva, si no cambia al más barato» da el mismo coste, los
mismos cambios de modelo y el mismo acierto que la heurística de horizonte en **5 de 6
workloads**. Se separan en «prompts cortos», donde el prefijo está en el mínimo cacheable: la
regla se vuelve pegajosa en cuanto la caché pasa a ser viable y pierde **41,9%**. Ahí sí
conviene valorar cada turno.

Conclusión para el diseño: **no hay evidencia aquí que justifique pesos configurables**. Una
condición binaria captura casi todo, y el único caso donde falla tiene una explicación clara.

## 7. Lo que se midió mal en la primera versión

Queda escrito porque es la parte útil del método:

1. **El baseline hacía trampa.** La estrategia de modelo fijo ignoraba la capacidad exigida por
   el turno, así que se comparaba un router que respeta la restricción contra uno que no. Al
   corregirlo, el titular pasó de «5,16× peor» a «el más barato gana».
2. **El escenario no contenía el problema.** Con dificultad uniforme ninguna estrategia cambia
   de modelo, la caché queda intacta y no hay nada que medir. El problema que estudiamos
   **solo existe si la mezcla de tareas es heterogénea**.
3. **La heurística estaba sesgada.** Solo penalizaba abandonar una caché, nunca valoraba el
   ahorro futuro de cambiar: un espantapájaros. Se reescribió como compromiso con horizonte.
4. **La afirmación «D y E empatan en todos los workloads» era falsa.** Empatan en 5 de 6. La
   detección además se rompió al añadir el router inestable a la tabla, que cambia de modelo a
   propósito.
5. **El barrido de precios no aislaba nada** en su primera forma: el nivel trivial estaba
   siempre 5× más barato, así que «ganaba el más barato» por construcción.

## 8. Lo que este análisis no puede decir

La **calidad** de la respuesta no está medida ni se puede medir con estos datos: no hay
etiqueta de verdad de qué modelo debía resolver cada prompt. Que un router cueste 0,46× no
significa que sea mejor, y cambiar de modelo también cambia la respuesta. La **tasa de acierto
real** del proveedor no es observable antes de la petición: el router solo puede llevar su
propio registro, que es lo que modela `ledger.ts`. No se miden **latencia ni TTFT**, ni el
**almacenamiento** de la caché explícita de Gemini, ni el **TTL de una hora** de Anthropic.

## Siguiente paso posible

Validar el modelo con una sesión real multi-turno: pide extender `src/classify.ts` con
`cached_tokens` y `cache_write_tokens`, usar `x-session-id` (que el router de `crush` ya envía)
y gastar crédito. Queda fuera de la fase 1 y requiere decisión explícita.