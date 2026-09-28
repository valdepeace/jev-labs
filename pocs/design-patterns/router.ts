export type Tier = "local" | "cheap" | "strong" | "frontier";

export interface Candidate {
  id: string;
  tier: Tier;
  provider: string;
  tools: boolean;
  context: number;
  healthy: boolean;
}

export interface RoutingContext {
  task: string;
  sessionId?: string;
  requiresTools: boolean;
  minContext: number;
}

export interface Decision {
  choice: Tier;
  probabilities: Partial<Record<Tier, number>>;
}

// Boundary: an engine recommends from a closed set; it cannot execute or resolve a provider.
export interface DecisionEngine {
  decide(context: RoutingContext, allowed: readonly Tier[]): Promise<Decision>;
}

export interface RoutingPolicy {
  minConfidence: number;
  minMargin: number;
  allowedProviders: readonly string[];
}

export interface DecisionReceipt {
  strategy: "rules" | "decision-engine" | "session-affinity";
  requestedTier?: Tier;
  effectiveTier?: Tier;
  candidateId?: string;
  confidence?: number;
  runnerUp?: Tier;
  margin?: number;
  fallback?: "abstain" | "no-candidate";
}

const tiers: readonly Tier[] = ["local", "cheap", "strong", "frontier"];

function eligibleCandidates(context: RoutingContext, candidates: readonly Candidate[], policy: RoutingPolicy): Candidate[] {
  return candidates.filter((candidate) =>
    candidate.healthy && candidate.tools >= context.requiresTools && candidate.context >= context.minContext && policy.allowedProviders.includes(candidate.provider),
  );
}

function rank(tier: Tier): number {
  return tiers.indexOf(tier);
}

function pickCandidate(tier: Tier, candidates: readonly Candidate[]): Candidate | undefined {
  return candidates.find((candidate) => candidate.tier === tier)
    ?? candidates.find((candidate) => rank(candidate.tier) > rank(tier));
}

export class DesignPatternRouter {
  private readonly sessions = new Map<string, Tier>();

  constructor(private readonly engine: DecisionEngine, private readonly policy: RoutingPolicy) {}

  async route(context: RoutingContext, candidates: readonly Candidate[]): Promise<DecisionReceipt> {
    // Rule-first: health checks never require a semantic decision.
    if (context.task === "health-check") return { strategy: "rules", effectiveTier: "local" };

    const eligible = eligibleCandidates(context, candidates, this.policy);
    const allowed = tiers.filter((tier) => eligible.some((candidate) => candidate.tier === tier));
    if (allowed.length === 0) return { strategy: "decision-engine", fallback: "no-candidate" };

    const prior = context.sessionId && this.sessions.get(context.sessionId);
    if (prior && eligible.some((candidate) => candidate.tier === prior)) {
      return { strategy: "session-affinity", effectiveTier: prior, candidateId: pickCandidate(prior, eligible)?.id };
    }

    const decision = await this.engine.decide(context, allowed);
    if (!allowed.includes(decision.choice)) return { strategy: "decision-engine", fallback: "abstain" };
    const ranked = allowed.map((tier) => [tier, decision.probabilities[tier] ?? 0] as const).sort((a, b) => b[1] - a[1]);
    const [selected, confidence] = ranked[0];
    const runnerUp = ranked[1];
    const margin = confidence - (runnerUp?.[1] ?? 0);
    if (selected !== decision.choice || confidence < this.policy.minConfidence || margin < this.policy.minMargin) {
      return { strategy: "decision-engine", requestedTier: decision.choice, confidence, runnerUp: runnerUp?.[0], margin, fallback: "abstain" };
    }

    // Sticky upgrades: a later decision may increase tier, never silently decrease it.
    const effectiveTier = prior && rank(prior) > rank(decision.choice) ? prior : decision.choice;
    const candidate = pickCandidate(effectiveTier, eligible);
    if (!candidate) return { strategy: "decision-engine", requestedTier: decision.choice, fallback: "no-candidate" };
    if (context.sessionId) this.sessions.set(context.sessionId, effectiveTier);
    return { strategy: "decision-engine", requestedTier: decision.choice, effectiveTier, candidateId: candidate.id, confidence, runnerUp: runnerUp?.[0], margin };
  }
}
