# POC: patrones de diseño para modelos de decisión

POC offline y sin credenciales para comparar una selección directa de modelo con un router gobernado por decisiones. No invoca Jev: `DecisionEngine` es una frontera inyectable; un adaptador real de Jev sería una implementación posterior, no el router entero.

El motivo, alcance y no-objetivos están en [WHY.md](./WHY.md). Esta POC no modifica el router o benchmark principal.

Ejecutar:

```powershell
npx tsx --test pocs/design-patterns/router.test.ts
node --test pocs/design-patterns/lab.test.js
node --test pocs/design-patterns/server.test.js
```

Abre [lab.html](./lab.html) directamente en un navegador para la simulación offline. El flujo usa [vis-network](https://github.com/visjs/vis-network) desde CDN, fijado en `10.1.2`; necesita conexión para cargar ese grafo. Para probar Jev real con la clave existente, arranca el servidor y abre la URL local:

```powershell
node --env-file=pocs/design-patterns/.env pocs/design-patterns/server.js
```

Después abre `http://127.0.0.1:8788`. La clave nunca se sirve al navegador; `POST /api/decision` acepta solo un estado de hasta 6.000 caracteres, pide un tier cerrado y devuelve la decisión tipada. No ejecuta el modelo seleccionado.

## Comparativa

| Enfoque directo | Composición de esta POC |
| --- | --- |
| El clasificador recibe IDs de proveedor/modelo. | Recibe tiers cerrados (`local`, `cheap`, `strong`, `frontier`). |
| Decide y se ejecuta la respuesta. | Decide; policy y resolver autorizan y seleccionan candidato. |
| Las capacidades se describen en texto. | Un filtro determinista elimina candidatos sin tools, contexto, salud o proveedor permitido. |
| Un top-1 siempre se acepta. | Confianza y margen configurables permiten `abstain`. |
| Reevalúa cada llamada. | Una sesión sana mantiene su binding; no cambia en tool loops. |

El flujo implementado es:

```text
rules -> capability filter -> closed-world decision -> confidence/margin policy
      -> semantic tier -> healthy provider candidate -> receipt
```

No hay `Execution`, SDK, reintentos, credenciales ni acceso a proveedor en `router.ts`: son fronteras deliberadamente fuera del decision engine.

## Patrones y decisión de adopción

| Grupo | Patrones | Estado en la POC |
| --- | --- | --- |
| Núcleo | Decision Engine, Closed World, Semantic Routing, Strategy | `DecisionEngine`, tiers y dependencia inyectada. |
| Corrección | Candidate Filtering, Rule First, AI First Validation, Schema/allowlist | filtro previo; validación de opción y candidato después. |
| Gobernanza | Policy, Budget/Health/Capability routing, Provider Adapter, Fail Open/Closed | policy de proveedores/salud; el adapter y presupuesto quedan fuera, por no haber proveedor real. |
| Incertidumbre | Confidence Gate, Abstention, Decision Margin, Clarification | confianza/margen configurables y `abstain`; una integración puede convertirlo en `needs_clarification`. |
| Sesiones | Session Affinity, Sticky Upgrade | binding por sesión; la ruta existente no baja de tier. |
| Extensibilidad | Chain of Responsibility, Decorator, Observer, Receipt | receipt mínimo; cache, métricas y circuit breaker serían decoradores, no lógica de Jev. |
| Aprendizaje | Feedback, Champion/Challenger, Shadow, Ensemble | siguiente fase de benchmark; no se simulan resultados ni se hacen llamadas. |
| Especializados | Parallel/Hierarchical/Score/Vector, Tool/Graph/Risk routing, Escalation/Fallback | útiles al haber casos reales; conservar candidatos cerrados y policy externa. |

La configuración de `minConfidence` y `minMargin` no fija números universales: deben calibrarse con un benchmark y recibos reales. El fallback tampoco es implícito: esta POC devuelve `abstain` o `no-candidate` para que el host decida si aclara, aplica reglas o deniega.

## Fuentes consultadas

| Tipo | Fuente | Uso en esta POC |
| --- | --- | --- |
| Oficial | [TypeSafe AI: Introduction](https://docs.typesafe.ai/introduction) | Jev como System One: estado y preguntas tipadas con probabilidades; `Choice`, `Score` y `Noul` paralelos. |
| Comunitario | [TypeSafeAI/typesafe-router](https://github.com/TypeSafeAI/typesafe-router) | Separación “Jev selects; application authorizes and executes”, opciones cerradas, policy y fallback. |
| Comunitario | [TypeSafeAI/typesafe-playground: tool router](https://github.com/TypeSafeAI/typesafe-playground/blob/main/docs/tool-router.md) | Grafo de candidatos permitidos, `needs_clarification` y autorización posterior. |
| Comunitario | [hyspacex/jev-router](https://github.com/hyspacex/jev-router) | Binding estable de modelo/proveedor/límites durante una sesión. |
| Comunitario | [dirien/jev-router](https://github.com/dirien/jev-router) | Decisión por turno humano y upgrades sin degradación silenciosa. |
| Comunitario | [BillionsBobby/JevRouter](https://github.com/BillionsBobby/JevRouter) | Receipts, disponibilidad, permisos, riesgo y confirmación externos a Jev. |

Conclusión propia: empezar con shadow mode sobre el benchmark existente. Medir receipt, tier, confianza, margen, candidato efectivo y resultado. Solo después habilitar decisiones reales de baja criticidad; no copiar mecanismos de proveedor, proxy o autorización de esos proyectos.

## Invariantes

```text
Decision != Execution
Recommendation != Authorization
Semantic Routing != Provider Resolution
Capability != Concrete Model
Confidence != Certainty
AI Decision != Trusted Input
Provider Failure != Agent Failure
JEV Failure != Router Failure
```
