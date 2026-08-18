// Shared builders for the CSP stages that don't make a scheduling decision
// by themselves - identity resolution, discovery/trust, ontology grounding,
// term alignment, intent exchange - used by the standard CSP negotiation and
// by every demo that starts from the same grounded state (drift/cognition,
// mediation, emergent-conflict).
import { getOrg, resolveOrgName } from "../data/orgs";
import { AgentProfile, DataSharingPolicy, NegotiationScenario, StructuredIntent, TranscriptMessage } from "../types/domain";
import { ontologyMappingLines } from "./ontology";

export function agentKindLabel(kind: AgentProfile["kind"]): string {
  return kind === "webex" ? "Webex agent" : "Copilot agent";
}
export function agentLabel(agent: AgentProfile): string {
  return `${agent.personName} (${agentKindLabel(agent.kind)})`;
}
export function fromFor(agent: AgentProfile): TranscriptMessage["from"] {
  return agent.kind === "webex" ? "webex-agent" : "copilot-agent";
}
function flag(b: boolean): string {
  return b ? "allowed" : "blocked";
}

/**
 * Step 1 of discovery: figure out *who is actually negotiating* before
 * anything else - which agent/service identity represents each human
 * sender, and which tenant's IAM it authenticates against. This runs even
 * for an intra-org negotiation (you still need to resolve two distinct
 * agent identities), but only a cross-org negotiation goes on to ask
 * whether that other identity's org is trusted at all - see discoveryStage.
 */
export function identityResolutionStage(scenario: NegotiationScenario, round: number, ts: () => string): TranscriptMessage[] {
  const { homeAgent, partnerAgent } = scenario;
  const partnerTenant = scenario.isIntraOrg ? resolveOrgName(scenario.homeOrgId) : resolveOrgName(scenario.partnerOrgId);
  return [
    {
      round,
      stage: "discovery",
      from: "system",
      kind: "identity",
      text:
        `Resolving who's actually negotiating before anything else: ${homeAgent.personName}'s message maps to ` +
        `${agentLabel(homeAgent)}, a service identity authenticated against ${resolveOrgName(scenario.homeOrgId)}'s IAM. ` +
        `${partnerAgent.personName}'s maps to ${agentLabel(partnerAgent)}, authenticated against ${partnerTenant}'s IAM. ` +
        `Each agent only ever acts under its own tenant's credentials - neither can act as the other.`,
      timestamp: ts(),
    },
  ];
}

export interface DiscoveryResult {
  messages: TranscriptMessage[];
  escalated: boolean;
}

/** Step 2 of discovery: now that both identities are resolved, is there a trust/federation relationship between their orgs at all? */
export function discoveryStage(
  scenario: NegotiationScenario,
  policy: DataSharingPolicy,
  round: number,
  ts: () => string
): DiscoveryResult {
  const { homeAgent, partnerAgent } = scenario;
  const messages: TranscriptMessage[] = [];

  if (scenario.isIntraOrg) {
    messages.push({
      round,
      stage: "discovery",
      from: "system",
      kind: "info",
      text: `${agentLabel(homeAgent)} and ${agentLabel(partnerAgent)} both belong to ${resolveOrgName(
        scenario.homeOrgId
      )} - no cross-org trust or federation check is needed, so negotiation proceeds straight to grounding.`,
      timestamp: ts(),
    });
    return { messages, escalated: false };
  }

  const partnerOrg = getOrg(scenario.partnerOrgId);
  messages.push({
    round,
    stage: "discovery",
    from: "system",
    kind: "info",
    text: `Both identities resolved - now checking whether ${resolveOrgName(scenario.homeOrgId)} and ${
      partnerOrg?.name ?? scenario.partnerOrgId
    } actually have a trust relationship on file.`,
    timestamp: ts(),
  });

  if (!partnerOrg || partnerOrg.trustStatus !== "trusted") {
    messages.push({
      round,
      stage: "discovery",
      from: "system",
      kind: "escalation",
      text:
        `No established trust relationship found for ${partnerOrg?.name ?? scenario.partnerOrgId} ` +
        `(status: ${partnerOrg?.trustStatus ?? "unknown"}). Per policy, agents cannot exchange calendar or intent data ` +
        `without a trusted federation - escalating to humans for manual scheduling and admin review.`,
      timestamp: ts(),
    });
    return { messages, escalated: true };
  }

  messages.push({
    round,
    stage: "discovery",
    from: "system",
    kind: "info",
    text:
      `Trust confirmed. Data-sharing policy in effect: free/busy ${flag(policy.freeBusy)}, ` +
      `priority tier ${flag(policy.priorityTier)}, meeting titles/attendees ${flag(
        policy.meetingTitlesAndAttendees
      )}, human approval before send ${policy.humanApprovalBeforeSend ? "always on" : "off"}.`,
    timestamp: ts(),
  });
  return { messages, escalated: false };
}

export function ontologyStage(scenario: NegotiationScenario, round: number, ts: () => string): TranscriptMessage[] {
  const { homeAgent, partnerAgent } = scenario;
  if (homeAgent.kind === partnerAgent.kind) {
    return [
      {
        round,
        stage: "ontology-grounding",
        from: "system",
        kind: "mapping",
        text:
          `Both agents already speak the same vocabulary (${homeAgent.kind === "webex" ? "Webex" : "Copilot"}) - ` +
          `grounding is a no-op here. Any value CSP adds in this negotiation has to come from shared intent and joint reasoning, not translation.`,
        timestamp: ts(),
      },
    ];
  }
  return [
    {
      round,
      stage: "ontology-grounding",
      from: fromFor(homeAgent),
      kind: "mapping",
      text: `${agentLabel(homeAgent)} grounds its vocabulary into the shared schema: ${ontologyMappingLines(homeAgent.kind).join(", ")}.`,
      timestamp: ts(),
    },
    {
      round,
      stage: "ontology-grounding",
      from: fromFor(partnerAgent),
      kind: "mapping",
      text: `${agentLabel(partnerAgent)} grounds its vocabulary into the shared schema: ${ontologyMappingLines(partnerAgent.kind).join(", ")}.`,
      timestamp: ts(),
    },
  ];
}

const URGENCY_DEFINITIONS: Record<StructuredIntent["urgency"], string> = {
  low: 'no deadline pressure - can slip to next week if it has to; standard notice-period rules apply, nothing special',
  medium: "should land within the stated windows this week; a short slip is tolerable but shouldn't roll to next week",
  high: "same-day or next-business-day priority; a notice-period exception may need to be requested to hit it",
};

/**
 * Before the two agents lock a request into one shared intent object, they
 * ground what its ambiguous, qualitative terms actually mean - the same
 * failure mode ontology grounding fixes for calendar vocab (a "medium"
 * priority meeting means different things to different orgs) but applied to
 * the intent's own terms instead of calendar status labels.
 */
export function termAlignmentStage(scenario: NegotiationScenario, round: number, ts: () => string): TranscriptMessage[] {
  const { homeAgent, partnerAgent, intent } = scenario;
  const sameTier = homeAgent.priorityTier === partnerAgent.priorityTier;
  const tierNote = sameTier
    ? "both sides happen to rate this kind of meeting the same"
    : "the two sides don't weight this the same internally - worth a human's attention if that ever conflicts with the proposed slot";
  return [
    {
      round,
      stage: "intent-exchange",
      from: "system",
      kind: "term-alignment",
      text:
        `Before assembling the shared intent object, both agents align on what its ambiguous terms actually mean: ` +
        `urgency "${intent.urgency}" means ${URGENCY_DEFINITIONS[intent.urgency]}. A "required attendee" means the ` +
        `meeting shouldn't be booked without that person present unless they explicitly decline. Priority tier ` +
        `(${homeAgent.personName}: ${homeAgent.priorityTier}, ${partnerAgent.personName}: ${partnerAgent.priorityTier}, ` +
        `on a shared 1-5 scale) is each org's own standing weighting, agreed once during federation setup - ${tierNote} - ` +
        `not renegotiated per meeting.`,
      data: { urgency: intent.urgency, urgencyDefinition: URGENCY_DEFINITIONS[intent.urgency], homeTier: homeAgent.priorityTier, partnerTier: partnerAgent.priorityTier },
      timestamp: ts(),
    },
  ];
}

export function intentStage(scenario: NegotiationScenario, round: number, ts: () => string): TranscriptMessage[] {
  const { intent } = scenario;
  return [
    {
      round,
      stage: "intent-exchange",
      from: "system",
      kind: "intent",
      text:
        `With those terms grounded, both agents assemble one shared intent object: goal "${intent.goal}", ` +
        `urgency ${intent.urgency}, required attendees [${intent.requiredAttendees.join(", ")}], ` +
        `duration ${intent.durationMinutes} min, candidate windows [${intent.candidateWindows.join(", ")}].`,
      data: { ...intent },
      timestamp: ts(),
    },
  ];
}
