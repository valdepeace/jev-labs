# Por qué existe esta POC

El benchmark raíz mide cómo Jev clasifica preguntas de programación y propone modelos. Eso no demuestra por sí solo que sea seguro ni mantenible convertir esa salida en routing de producción. Falta responder una pregunta arquitectónica anterior: **¿qué debe decidir Jev y qué debe seguir decidiendo el sistema?**

Esta POC responde esa pregunta con un contrato pequeño, ejecutable y offline. Su intención es evitar que una integración convierta una recomendación probabilística en autoridad para ejecutar, seleccionar credenciales, cambiar de proveedor o reintentar peticiones.

## Hipótesis

Una arquitectura con decisión semántica cerrada, filtros deterministas y policy externa es más verificable que pedir a un modelo que devuelva directamente un ID de proveedor/modelo.

La POC verifica el contrato, no la calidad de Jev: una implementación falsa entrega decisiones conocidas y las pruebas comprueban que el router:

- elimina candidatos sin capacidades, salud o proveedor permitido antes de decidir;
- acepta solamente tiers permitidos;
- se abstiene ante baja confianza o margen insuficiente;
- mantiene la selección de una sesión sana durante un tool loop;
- no ejecuta herramientas ni llama a ningún proveedor.

## Alcance

El resultado es un `DecisionReceipt`: tier solicitado, tier efectivo, candidato resuelto, confianza, segundo candidato y margen. Es la evidencia mínima para comparar reglas, Jev u otro clasificador más adelante en shadow mode.

No es un proxy, SDK de proveedores, gestor de sesiones persistente, cache, circuit breaker, sistema de autorización ni benchmark con llamadas reales. Esos componentes tendrían sus propios límites y pruebas cuando exista un caso de uso que los necesite.

## Próximo uso responsable

Con datos del benchmark, un adaptador de Jev puede implementar `DecisionEngine` y ejecutarse en shadow mode: la ruta actual sigue siendo la efectiva y esta POC solo genera receipts comparables. Los umbrales de confianza y margen se calibrarán con esos resultados, no se declararán universales.
