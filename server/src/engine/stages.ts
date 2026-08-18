// Shared builders for the three CSP stages that don't make a scheduling
// decision by themselves - discovery, ontology grounding, intent exchange -
// used by the standard CSP negotiation and by every demo that starts from
// the same grounded state (drift/cognition, mediation, emergent-conflict).
import { getOrg, resolveOrgName } from "../data/orgs";
import { AgentProfile, DataSharingPolicy, NegotiationScenario, TranscriptMessage } from "../types/domain";
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

export interface DiscoveryResult {
  messages: TranscriptMessage[];
  escalated: boolean;
}

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
    text: `${agentLabel(homeAgent)} (${resolveOrgName(scenario.homeOrgId)}) and ${agentLabel(partnerAgent)} (${
      partnerOrg?.name ?? scenario.partnerOrgId
    }) authenticate and look up an existing trust relationship.`,
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

export function intentStage(scenario: NegotiationScenario, round: number, ts: () => string): TranscriptMessage[] {
  const { intent } = scenario;
  return [
    {
      round,
      stage: "intent-exchange",
      from: "system",
      kind: "intent",
      text:
        `Both agents parse the email thread into one shared intent object: goal "${intent.goal}", ` +
        `urgency ${intent.urgency}, required attendees [${intent.requiredAttendees.join(", ")}], ` +
        `duration ${intent.durationMinutes} min, candidate windows [${intent.candidateWindows.join(", ")}].`,
      data: { ...intent },
      timestamp: ts(),
    },
  ];
}
