(() => {
  const patterns = [
    ["Decision Engine", "Núcleo", "Recomienda; no ejecuta."], ["Closed World", "Núcleo", "Solo elige opciones permitidas."], ["Candidate Filtering", "Corrección", "Descarta capacidades imposibles antes de IA."], ["Semantic Routing", "Núcleo", "Decide tier, no proveedor."],
    ["Strategy", "Extensibilidad", "Permite sustituir Jev por reglas u otro clasificador."], ["Policy", "Gobernanza", "La recomendación no tiene autoridad final."], ["Confidence Gate", "Incertidumbre", "Acepta según confianza calibrada."], ["Abstention", "Incertidumbre", "Puede no decidir."],
    ["Decision Margin", "Incertidumbre", "Mide top-1 menos top-2."], ["Parallel Decision", "Composición", "Evalúa dimensiones independientes."], ["Hierarchical Decision", "Composición", "Tier primero; modelo después."], ["Score Before Choice", "Composición", "Separa evaluación semántica de política."],
    ["Decision Vector", "Composición", "Entrega varias señales semánticas."], ["Rule First, AI Second", "Corrección", "Atajos deterministas antes de IA."], ["AI First, Validation Last", "Corrección", "Valida también después de decidir."], ["Hybrid Router", "Composición", "Une reglas y decisión semántica."],
    ["Session Affinity", "Sesiones", "Mantiene modelo durante una unidad lógica."], ["Sticky Upgrade", "Sesiones", "Escala, pero no baja silenciosamente."], ["Decision Cache", "Rendimiento", "Cachea rasgos, no prompts ciegamente."], ["Circuit Breaker", "Resiliencia", "Evita que Jev sea un punto único de fallo."],
    ["Chain of Responsibility", "Extensibilidad", "Cada etapa responde o deja pasar."], ["Decorator", "Extensibilidad", "Añade métricas o cache sin contaminar Jev."], ["Observer / Telemetry", "Observabilidad", "Registra decisión sin registrar el prompt sensible."], ["Decision Receipt", "Observabilidad", "Conserva evidencia estructurada."],
    ["Feedback Loop", "Aprendizaje", "Relaciona decisión y resultado."], ["Champion / Challenger", "Aprendizaje", "Compara sin entregar control."], ["Shadow Mode", "Aprendizaje", "Registra, no ejecuta."], ["Ensemble Decision", "Aprendizaje", "Contrasta clasificadores; no por defecto."],
    ["Escalation", "Resiliencia", "Sube de tier tras fallos acotados."], ["Budget-Aware Routing", "Gobernanza", "Precio se decide fuera de la semántica."], ["Health-Aware Routing", "Gobernanza", "Resolver usa salud operacional."], ["Capability-Based Routing", "Gobernanza", "Tiers representan capacidad, no marca."],
    ["Provider Adapter", "Integración", "Oculta SDK, auth y streaming."], ["Fallback Chain", "Resiliencia", "Degradación explícita y registrada."], ["Schema Validation", "Corrección", "Nunca confía en strings externos."], ["Fail Closed vs Fail Open", "Gobernanza", "La semántica depende del riesgo."],
    ["Tool Routing", "Acciones", "Herramientas solo desde allowlist."], ["Graph-Constrained Routing", "Acciones", "Solo edges válidos desde el estado."], ["Clarification Route", "Acciones", "Incluye needs_clarification."], ["Risk-Gated Routing", "Acciones", "Riesgo alto necesita aprobación."],
  ].map(([name, group, summary]) => ({ name, group, summary }));

  const scenarios = {
    simple: { label: "Consulta simple", choice: "cheap", probabilities: { local: 0.04, cheap: 0.9, strong: 0.06 }, needsTools: false, context: 8_000 },
    coding: { label: "Refactor con tools", choice: "strong", probabilities: { cheap: 0.11, strong: 0.82, frontier: 0.07 }, needsTools: true, context: 128_000 },
    ambiguous: { label: "Petición ambigua", choice: "strong", probabilities: { cheap: 0.49, strong: 0.51 }, needsTools: true, context: 128_000 },
    external: { label: "Razonamiento profundo", choice: "strong", probabilities: { cheap: 0.08, strong: 0.84, frontier: 0.08 }, needsTools: true, context: 128_000 },
  };
  const candidates = [
    { id: "local-qwen", tier: "local", provider: "ollama", tools: false, context: 32_000 },
    { id: "cheap-qwen", tier: "cheap", provider: "openrouter", tools: true, context: 128_000 },
    { id: "strong-kimi", tier: "strong", provider: "openrouter", tools: true, context: 256_000 },
    { id: "frontier-gpt", tier: "frontier", provider: "openai", tools: true, context: 1_000_000 },
  ];

  const stageFor = {
    "Decision Engine": "decision", "Closed World": "decision", "Candidate Filtering": "filter", "Semantic Routing": "resolver",
    Strategy: "decision", Policy: "policy", "Confidence Gate": "policy", Abstention: "policy", "Decision Margin": "policy",
    "Parallel Decision": "decision", "Hierarchical Decision": "resolver", "Score Before Choice": "decision", "Decision Vector": "decision",
    "Rule First, AI Second": "rules", "AI First, Validation Last": "policy", "Hybrid Router": "rules", "Session Affinity": "binding", "Sticky Upgrade": "binding",
    "Decision Cache": "rules", "Circuit Breaker": "rules", "Chain of Responsibility": "rules", Decorator: "receipt", "Observer / Telemetry": "receipt", "Decision Receipt": "receipt",
    "Feedback Loop": "receipt", "Champion / Challenger": "receipt", "Shadow Mode": "receipt", "Ensemble Decision": "decision", Escalation: "policy",
    "Budget-Aware Routing": "policy", "Health-Aware Routing": "resolver", "Capability-Based Routing": "resolver", "Provider Adapter": "resolver", "Fallback Chain": "resolver",
    "Schema Validation": "policy", "Fail Closed vs Fail Open": "policy", "Tool Routing": "filter", "Graph-Constrained Routing": "filter", "Clarification Route": "policy", "Risk-Gated Routing": "policy",
  };
  const stageTitles = { input: "1 · Tarea", rules: "2 · Reglas", filter: "3 · Filtro", decision: "4 · Jev decide", policy: "5 · Policy", resolver: "6 · Resolver", binding: "7 · Sesión", execution: "8 · Ejecución", receipt: "9 · Receipt" };
  const exampleModels = { local: "local-qwen", cheap: "cheap-qwen", strong: "strong-kimi", frontier: "frontier-gpt" };

  function flow(decision, source = "simulado") {
    const probabilities = decision.probabilities ?? {};
    const values = Object.values(probabilities).sort((a, b) => b - a);
    const margin = values[0] - (values[1] ?? 0);
    const accepted = decision.choice && decision.confidence >= 0.7 && margin >= 0.1;
    return {
      source, choice: decision.choice, margin, accepted,
      stages: {
        input: "Tarea introducida por la persona.",
        rules: "La tarea no coincide con un atajo determinista.",
        filter: "Elegibles: cheap, strong. Local no tiene tools; frontier queda fuera por policy.",
        decision: `${source}: ${decision.choice ?? "sin decisión"} (${typeof decision.confidence === "number" ? decision.confidence.toFixed(2) : "sin confianza"})`,
        policy: accepted ? `Aceptada: margen ${margin.toFixed(2)}.` : `Abstain: confianza o margen insuficiente.`,
        resolver: accepted ? `Ejemplo: ${exampleModels[decision.choice]} satisface ${decision.choice}.` : "No se resuelve ningún modelo.",
        binding: accepted ? "Binding por turno disponible; no cambia durante tool loops." : "Sin binding.",
        execution: "No ejecutado: este lab termina antes de la ejecución.",
        receipt: accepted ? `Receipt: tier ${decision.choice}, fallback false.` : "Receipt: fallback abstain.",
      },
    };
  }

  function simulate({ scenario = "coding", minConfidence = 0.7, minMargin = 0.1, allowExternal = false, session = false }) {
    const request = scenarios[scenario];
    const providers = allowExternal ? ["ollama", "openrouter", "openai"] : ["ollama", "openrouter"];
    const eligible = candidates.filter((item) => providers.includes(item.provider) && item.tools >= request.needsTools && item.context >= request.context);
    const allowed = eligible.map((item) => item.tier);
    if (session) return { strategy: "session-affinity", allowed, effective: "strong", candidate: "strong-kimi", note: "Binding previo conservado: no se reevalúa el tool loop." };
    const ranked = allowed.map((tier) => [tier, request.probabilities[tier] ?? 0]).sort((a, b) => b[1] - a[1]);
    const [choice, confidence] = ranked[0];
    const runnerUp = ranked[1]?.[0] ?? "—";
    const margin = confidence - (ranked[1]?.[1] ?? 0);
    if (choice !== request.choice || confidence < minConfidence || margin < minMargin) {
      return { strategy: "abstain", allowed, requested: request.choice, confidence, runnerUp, margin, note: "La policy no autoriza una ruta efectiva." };
    }
    const candidate = eligible.find((item) => item.tier === choice)?.id;
    return { strategy: "decision-engine", allowed, requested: request.choice, effective: choice, candidate, confidence, runnerUp, margin, note: "El host aún debe autorizar y ejecutar." };
  }

  function boot() {
    const form = document.querySelector("#controls");
    const receipt = document.querySelector("#receipt");
    const patternMap = document.querySelector("#pattern-map");
    const detail = document.querySelector("#pattern-detail");
    const flowBoxes = document.querySelector("#flow-boxes");
    const flowDetail = document.querySelector("#flow-detail");
    let network;
    let current = { decision: { choice: "strong", confidence: 0.82, probabilities: { strong: 0.82, cheap: 0.11, frontier: 0.07 } }, source: "ejemplo" };
    function renderFlow(result, focus) {
      const pipeline = flow(result.decision ?? result, result.source);
      if (!globalThis.vis) {
        flowBoxes.textContent = "No se pudo cargar vis-network. Comprueba la conexión al CDN y recarga.";
        return;
      }
      const nodes = new globalThis.vis.DataSet(Object.entries(pipeline.stages).map(([id, text], index) => ({
        id, label: `${stageTitles[id]}\n${id === "decision" ? pipeline.choice ?? "sin decisión" : id === "execution" ? "bloqueada" : ""}`, level: index, title: text,
        color: id === focus ? { background: "#0ea5e9", border: "#e0f2fe" } : id === "execution" ? { background: "#713f12", border: "#fcd34d" } : { background: "#172554", border: "#475569" },
        font: { color: "#eef3ff", face: "system-ui", size: 15 }, shape: "box", margin: 14, widthConstraint: { maximum: 180 },
      })));
      const ids = Object.keys(pipeline.stages);
      const edges = new globalThis.vis.DataSet(ids.slice(1).map((to, index) => ({ from: ids[index], to, arrows: "to", color: { color: "#7dd3fc" }, width: 2 })));
      network?.destroy();
      network = new globalThis.vis.Network(flowBoxes, { nodes, edges }, {
        layout: { hierarchical: { direction: "LR", sortMethod: "directed", levelSeparation: 190, nodeSpacing: 120 } }, physics: false,
        interaction: { hover: true, navigationButtons: true, keyboard: true }, edges: { smooth: { type: "cubicBezier" } },
      });
      network.on("click", ({ nodes: selected }) => {
        const stage = selected[0];
        if (stage) {
          flowDetail.innerHTML = `<strong>${stageTitles[stage]}</strong><p>${pipeline.stages[stage]}</p>`;
          document.querySelectorAll(".pattern-group").forEach((group) => group.classList.toggle("active", group.dataset.stage === stage));
        }
      });
    }
    function highlight(stage) {
      network?.selectNodes([stage]);
      network?.focus(stage, { scale: 1.05, animation: { duration: 350, easingFunction: "easeInOutQuad" } });
      document.querySelectorAll(".pattern-group").forEach((group) => group.classList.toggle("active", group.dataset.stage === stage));
    }
    const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    function loadPattern(index) {
      const pattern = patterns[index];
      if (!pattern) return;
      detail.innerHTML = `<strong>${pattern.name}</strong><span>${pattern.group}</span><p>${pattern.summary}</p><p class="hint">Paso principal: ${stageTitles[stageFor[pattern.name]]}.</p>`;
      document.querySelectorAll(".pattern").forEach((item) => item.classList.toggle("selected", Number(item.dataset.index) === index));
      document.querySelector("#pattern-select").value = String(index);
      renderFlow(current, stageFor[pattern.name]);
      highlight(stageFor[pattern.name]);
      flowDetail.innerHTML = `<strong>${pattern.name}</strong><p>Este patrón controla principalmente ${stageTitles[stageFor[pattern.name]]}. ${pattern.summary}</p>`;
    }
    patternMap.innerHTML = Object.entries(stageTitles).map(([stage, title]) => {
      const items = patterns.map((pattern, index) => ({ pattern, index })).filter(({ pattern }) => stageFor[pattern.name] === stage);
      return `<article class="pattern-group" data-stage="${stage}"><h3>${title}</h3>${items.length ? items.map(({ pattern, index }) => `<button class="pattern" data-index="${index}"><small>${pattern.group}</small>${pattern.name}</button>`).join("") : "<p class=\"hint\">Sin patrón: es la entrada.</p>"}</article>`;
    }).join("");
    patternMap.addEventListener("click", (event) => {
      const card = event.target.closest("button");
      if (!card) return;
      loadPattern(Number(card.dataset.index));
    });
    const patternSelect = document.querySelector("#pattern-select");
    patternSelect.innerHTML = `<option value="">Cargar patrón en el grafo…</option>${patterns.map((pattern, index) => `<option value="${index}">${pattern.name} → ${stageTitles[stageFor[pattern.name]]}</option>`).join("")}`;
    patternSelect.addEventListener("change", () => { if (patternSelect.value) loadPattern(Number(patternSelect.value)); });
    function run() {
      const values = Object.fromEntries(new FormData(form));
      const result = simulate({ scenario: values.scenario, minConfidence: Number(values.confidence), minMargin: Number(values.margin), allowExternal: values.external === "on", session: values.session === "on" });
      receipt.textContent = JSON.stringify(result, null, 2);
      document.querySelector("#confidence-value").textContent = Number(values.confidence).toFixed(2);
      document.querySelector("#margin-value").textContent = Number(values.margin).toFixed(2);
      const decision = result.strategy === "decision-engine" ? { choice: result.effective, confidence: result.confidence, probabilities: { [result.effective]: result.confidence, [result.runnerUp]: result.confidence - result.margin } } : { choice: undefined, confidence: 0, probabilities: {} };
      current = { decision, source: "simulación" };
      renderFlow(current);
      flowDetail.innerHTML = "<strong>Lectura del flujo</strong><p>Esta es una simulación: cambia controles para ver cómo policy acepta o rechaza una decisión.</p>";
    }
    form.addEventListener("input", run);
    form.addEventListener("change", run);
    document.querySelector("#live-run").addEventListener("click", async () => {
      const status = document.querySelector("#live-status");
      const liveReceipt = document.querySelector("#live-receipt");
      const task = document.querySelector("#live-task").value;
      try {
        current = { decision: { choice: undefined, confidence: 0, probabilities: {} }, source: "recorrido" };
        renderFlow(current);
        for (const stage of ["input", "rules", "filter"]) { status.textContent = `Recorriendo ${stageTitles[stage]}…`; highlight(stage); await pause(650); }
        status.textContent = "Paso 4: consultando Jev real…";
        highlight("decision");
        const response = await fetch("http://127.0.0.1:8788/api/decision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task }) });
        const content = await response.text();
        let result;
        try { result = content ? JSON.parse(content) : { error: "el servidor devolvió una respuesta vacía" }; }
        catch { result = { error: "el servidor devolvió una respuesta no válida" }; }
        if (!response.ok) throw new Error(result.error ?? "live decision failed");
        if (result.error) throw new Error(result.error);
        liveReceipt.textContent = JSON.stringify(result, null, 2);
        status.textContent = "Decisión recibida. Sigue siendo una recomendación; el lab no ejecuta nada.";
        current = { decision: result.decision, source: "Jev real" };
        renderFlow(current, "decision");
        for (const stage of ["decision", "policy", "resolver", "binding", "execution", "receipt"]) { status.textContent = `Recorriendo ${stageTitles[stage]}…`; highlight(stage); await pause(650); }
        status.textContent = "Recorrido completado. Jev decidió; la ejecución quedó bloqueada.";
        flowDetail.innerHTML = `<strong>Jev real ha decidido: ${result.decision.choice}</strong><p>Confianza ${result.decision.confidence ?? "no disponible"}. El recorrido llegó al receipt; ningún modelo downstream fue ejecutado.</p>`;
      } catch (error) {
        status.textContent = `No se pudo consultar Jev: ${error instanceof Error ? error.message : String(error)}`;
      }
    });
    run();
  }

  globalThis.PatternLab = { patterns, simulate, flow };
  if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", boot);
})();
