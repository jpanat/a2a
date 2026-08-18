// CSP ("Cognition State Protocol") negotiation: five explicit stages that
// build shared state before any scheduling decision is made -
//   (a) identity & discovery, (b) shared ontology grounding,
//   (c) shared intent exchange, (d) joint constraint negotiation,
//   (e) resolution & write-back.
// Stages (a)-(c) don't decide anything by themselves - they just make sure
// both agents are reasoning from the same facts before stage (d), which is
// the only stage that actually picks a slot, by scoring every candidate
// across BOTH calendars in one pass instead of proposing them one at a time.
//
// This also covers the intra-org case (isIntraOrg: true - two agents at the
// same company): stage (a) becomes a no-op (nothing to federate), and stage
// (b) collapses to a single line when both agents already share a vocabulary
// - isolating how much of CSP's value is shared intent + joint reasoning
// alone, independent of vocabulary translation.
import { DataSharingPolicy, NegotiationScenario, NegotiationSession, ProposedSlot, TranscriptMessage } from "../types/domain";
import { formatSlot } from "./calendarUtil";
import { buildCandidates, hoursFromNow, scoreCandidates } from "./jointReasoning";
import { activeReasonerMode, explainResolution } from "./reasoner";
import { discoveryStage, intentStage, ontologyStage } from "./stages";

export async function runWithIoc(scenario: NegotiationScenario, policy: DataSharingPolicy): Promise<NegotiationSession> {
  const startedAt = new Date();
  const transcript: TranscriptMessage[] = [];
  let round = 1;
  const tick = () => new Date(startedAt.getTime() + round * 20_000).toISOString();
  const { homeAgent, partnerAgent } = scenario;

  // (a) Identity & discovery
  const discovery = discoveryStage(scenario, policy, round, tick);
  transcript.push(...discovery.messages);
  if (discovery.escalated) {
    return finalize(scenario, startedAt, round, transcript, "escalated", undefined);
  }
  round++;

  // (b) Shared ontology grounding
  transcript.push(...ontologyStage(scenario, round, tick));
  round++;

  // (c) Shared intent exchange
  const intent = scenario.intent;
  transcript.push(...intentStage(scenario, round, tick));
  round++;

  // (d) Joint constraint negotiation - reason over both calendars together in one pass.
  const allCandidates = buildCandidates(scenario.statedWindows, intent.durationMinutes);
  const noticeFiltered = allCandidates.filter(
    (c) => hoursFromNow(scenario, c) >= homeAgent.notice.minNoticeHours && hoursFromNow(scenario, c) >= partnerAgent.notice.minNoticeHours
  );
  const scored = scoreCandidates(scenario, homeAgent, partnerAgent, noticeFiltered, false);

  transcript.push({
    round,
    stage: "joint-negotiation",
    from: "system",
    kind: "info",
    text:
      `Reasoning jointly over both calendars in the shared schema across ${allCandidates.length} candidate slot(s) ` +
      `(${noticeFiltered.length} pass the notice-period check for both sides). Scoring by how many soft-busy holds each option touches.`,
    timestamp: tick(),
  });

  if (allCandidates.length > 0 && noticeFiltered.length === 0) {
    transcript.push({
      round,
      stage: "escalation",
      from: "system",
      kind: "escalation",
      text:
        `Every candidate window falls inside someone's minimum notice period ` +
        `(${label(homeAgent)} requires ${homeAgent.notice.minNoticeHours}h, ${label(partnerAgent)} requires ` +
        `${partnerAgent.notice.minNoticeHours}h). No slot can be booked without a policy exception - escalating to humans.`,
      timestamp: tick(),
    });
    return finalize(scenario, startedAt, round, transcript, "escalated", intent);
  }

  if (scored.length === 0) {
    transcript.push({
      round,
      stage: "escalation",
      from: "system",
      kind: "escalation",
      text: `Every remaining candidate hits a hard conflict on at least one calendar. No mutually available slot exists within the stated windows - escalating to humans.`,
      timestamp: tick(),
    });
    return finalize(scenario, startedAt, round, transcript, "escalated", intent);
  }

  const best = scored[0];
  const reasons: string[] = [];
  reasons.push(
    best.homeStatus === "available" ? `fully open for ${homeAgent.personName}` : `only a soft, movable hold for ${homeAgent.personName}`
  );
  reasons.push(
    best.partnerStatus === "available"
      ? `fully open for ${partnerAgent.personName}`
      : `only a soft, movable hold for ${partnerAgent.personName}`
  );
  round++;

  const slot: ProposedSlot = {
    day: best.c.day,
    start: best.c.start,
    end: best.c.end,
    durationMinutes: intent.durationMinutes,
    dateLabel: formatSlot(best.c.day, best.c.start, best.c.end),
  };

  const trimmedFrom = scenario.baselineAssumedDurationMinutes ?? intent.durationMinutes;
  const explanation = await explainResolution({
    scenarioTitle: scenario.title,
    slotDescription: slot.dateLabel,
    durationMinutes: intent.durationMinutes,
    originalDurationMinutes: trimmedFrom,
    reasons,
  });

  transcript.push({
    round,
    stage: "joint-negotiation",
    from: "system",
    kind: "info",
    text: `Best joint option found: ${slot.dateLabel} - ${reasons.join(", ")}. Neither side proposed this exact window individually; it came out of scoring both calendars together.`,
    data: { ...slot },
    timestamp: tick(),
  });
  round++;

  // (e) Resolution & write-back
  const approvalNote = policy.humanApprovalBeforeSend
    ? " Per data-sharing policy, this still requires a human to accept before any invite goes out."
    : "";
  transcript.push({
    round,
    stage: "resolution",
    from: "system",
    kind: "resolution",
    text: explanation + approvalNote,
    data: { ...slot },
    timestamp: tick(),
  });

  const session = finalize(scenario, startedAt, round, transcript, "agreed", intent, slot);
  session.writeBack = {
    webexEventId: `webex-evt-${Math.abs(hashCode(scenario.id + "webex")).toString(36)}`,
    copilotEventId: `copilot-evt-${Math.abs(hashCode(scenario.id + "copilot")).toString(36)}`,
    joinLink: `https://web.example-webex.com/join/${Math.abs(hashCode(scenario.id)).toString(36)}`,
  };
  return session;
}

function label(agent: NegotiationScenario["homeAgent"]): string {
  return `${agent.personName} (${agent.kind === "webex" ? "Webex agent" : "Copilot agent"})`;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

export function finalize(
  scenario: NegotiationScenario,
  startedAt: Date,
  round: number,
  transcript: TranscriptMessage[],
  status: "agreed" | "escalated",
  intent: NegotiationScenario["intent"] | undefined,
  proposedSlot?: ProposedSlot,
  /**
   * Override for `rounds`. The standard single-pass CSP flow always reports
   * 1 (see below); demos that layer real back-and-forth on top - the loop +
   * mediation demo, for instance - pass the actual round count here instead.
   */
  roundsOverride?: number
): NegotiationSession {
  const endedAt = new Date(startedAt.getTime() + transcript.length * 20_000);
  return {
    id: "",
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    orgAId: scenario.homeOrgId,
    orgBId: scenario.partnerOrgId,
    mode: "with-ioc",
    status,
    transcript,
    // CSP mode reasons over both calendars in a single joint pass, never a
    // serial back-and-forth - so "rounds" of negotiation is always 1, however
    // many protocol stages it took to get there - unless a demo overrides it.
    rounds: roundsOverride ?? 1,
    stagesCompleted: round,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    reasonerMode: activeReasonerMode(),
    intent,
    proposedSlot,
  };
}
