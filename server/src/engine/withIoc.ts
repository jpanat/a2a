// CSP ("Cognition State Protocol") negotiation: five explicit stages that
// build shared state before any scheduling decision is made -
//   (a) identity & discovery, (b) shared ontology grounding,
//   (c) shared intent exchange, (d) joint constraint negotiation,
//   (e) resolution & write-back.
// Stages (a)-(c) don't decide anything by themselves - they just make sure
// both agents are reasoning from the same facts before stage (d), which is
// the only stage that actually picks a slot, by scoring every candidate
// across BOTH calendars in one pass instead of proposing them one at a time.
import { getOrg } from "../data/orgs";
import {
  AgentProfile,
  DataSharingPolicy,
  Day,
  NegotiationScenario,
  NegotiationSession,
  ProposedSlot,
  SharedStatus,
  TranscriptMessage,
} from "../types/domain";
import { DAY_OFFSET, addMinutes, formatSlot, statusAt } from "./calendarUtil";
import { ontologyMappingLines, toSharedStatus } from "./ontology";
import { activeReasonerMode, explainResolution } from "./reasoner";

interface Candidate {
  day: Day;
  start: string;
  end: string;
  windowLabel: string;
}

function buildCandidates(scenario: NegotiationScenario, durationMinutes: number): Candidate[] {
  const out: Candidate[] = [];
  for (const w of scenario.statedWindows) {
    let t = toMin(w.start);
    const end = toMin(w.end);
    while (t + durationMinutes <= end) {
      const start = fromMin(t);
      out.push({ day: w.day, start, end: addMinutes(start, durationMinutes), windowLabel: w.label });
      t += 30;
    }
  }
  return out;
}
function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function fromMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function hoursFromNow(scenario: NegotiationScenario, c: Candidate): number {
  const nowOffset = scenario.simulatedNowOffsetHours ?? 240;
  return nowOffset + DAY_OFFSET[c.day] * 24 + toMin(c.start) / 60;
}

function label(agent: AgentProfile): string {
  return `${agent.personName} (${agent.kind === "webex" ? "Webex agent" : "Copilot agent"})`;
}

export async function runWithIoc(scenario: NegotiationScenario, policy: DataSharingPolicy): Promise<NegotiationSession> {
  const startedAt = new Date();
  const transcript: TranscriptMessage[] = [];
  let round = 1;
  const tick = () => new Date(startedAt.getTime() + round * 20_000).toISOString();

  // (a) Identity & discovery
  const partnerOrg = getOrg(scenario.partnerOrgId);
  transcript.push({
    round,
    stage: "discovery",
    from: "system",
    kind: "info",
    text: `Webex agent (Northwind Corp) and Copilot agent (${partnerOrg?.name ?? scenario.partnerOrgId}) authenticate and look up an existing trust relationship.`,
    timestamp: tick(),
  });

  if (!partnerOrg || partnerOrg.trustStatus !== "trusted") {
    transcript.push({
      round,
      stage: "discovery",
      from: "system",
      kind: "escalation",
      text:
        `No established trust relationship found for ${partnerOrg?.name ?? scenario.partnerOrgId} ` +
        `(status: ${partnerOrg?.trustStatus ?? "unknown"}). Per policy, agents cannot exchange calendar or intent data ` +
        `without a trusted federation - escalating to humans for manual scheduling and admin review.`,
      timestamp: tick(),
    });
    return finalize(scenario, startedAt, round, transcript, "escalated", undefined);
  }

  transcript.push({
    round,
    stage: "discovery",
    from: "system",
    kind: "info",
    text: `Trust confirmed. Data-sharing policy in effect: free/busy ${flag(policy.freeBusy)}, ` +
      `priority tier ${flag(policy.priorityTier)}, meeting titles/attendees ${flag(
        policy.meetingTitlesAndAttendees
      )}, human approval before send ${policy.humanApprovalBeforeSend ? "always on" : "off"}.`,
    timestamp: tick(),
  });
  round++;

  // (b) Shared ontology grounding
  const webexMap = ontologyMappingLines(scenario.webexAgent.kind);
  const copilotMap = ontologyMappingLines(scenario.copilotAgent.kind);
  transcript.push({
    round,
    stage: "ontology-grounding",
    from: "webex-agent",
    kind: "mapping",
    text: `${label(scenario.webexAgent)} grounds its vocabulary into the shared schema: ${webexMap.join(", ")}.`,
    timestamp: tick(),
  });
  transcript.push({
    round,
    stage: "ontology-grounding",
    from: "copilot-agent",
    kind: "mapping",
    text: `${label(scenario.copilotAgent)} grounds its vocabulary into the shared schema: ${copilotMap.join(", ")}.`,
    timestamp: tick(),
  });
  round++;

  // (c) Shared intent exchange
  const intent = scenario.intent;
  transcript.push({
    round,
    stage: "intent-exchange",
    from: "system",
    kind: "intent",
    text:
      `Both agents parse the email thread into one shared intent object: goal "${intent.goal}", ` +
      `urgency ${intent.urgency}, required attendees [${intent.requiredAttendees.join(", ")}], ` +
      `duration ${intent.durationMinutes} min, candidate windows [${intent.candidateWindows.join(", ")}].`,
    data: { ...intent },
    timestamp: tick(),
  });
  round++;

  // (d) Joint constraint negotiation - reason over both calendars together in one pass.
  const allCandidates = buildCandidates(scenario, intent.durationMinutes);
  const noticeFiltered = allCandidates.filter(
    (c) =>
      hoursFromNow(scenario, c) >= scenario.webexAgent.notice.minNoticeHours &&
      hoursFromNow(scenario, c) >= scenario.copilotAgent.notice.minNoticeHours
  );

  type Scored = { c: Candidate; score: number; webexStatus: SharedStatus; copilotStatus: SharedStatus };
  const scored: Scored[] = [];
  for (const c of noticeFiltered) {
    const webexLocal = statusAt(scenario.webexAgent, c.day, c.start, c.end);
    const copilotLocal = statusAt(scenario.copilotAgent, c.day, c.start, c.end);
    const webexShared = toSharedStatus(scenario.webexAgent.kind, webexLocal.status);
    const copilotShared = toSharedStatus(scenario.copilotAgent.kind, copilotLocal.status);
    if (webexShared === "hard-busy" || copilotShared === "hard-busy") continue;
    const score = (webexShared === "soft-busy" ? 1 : 0) + (copilotShared === "soft-busy" ? 1 : 0);
    scored.push({ c, score, webexStatus: webexShared, copilotStatus: copilotShared });
  }
  scored.sort((a, b) => a.score - b.score);

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
        `(Webex side requires ${scenario.webexAgent.notice.minNoticeHours}h, ${label(scenario.copilotAgent)} requires ` +
        `${scenario.copilotAgent.notice.minNoticeHours}h). No slot can be booked without a policy exception - escalating to humans.`,
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
  reasons.push(best.webexStatus === "available" ? "fully open on the Webex side" : "only a soft, movable hold on the Webex side");
  reasons.push(
    best.copilotStatus === "available" ? "fully open on the Copilot side" : "only a soft, movable hold on the Copilot side"
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

function flag(b: boolean): string {
  return b ? "allowed" : "blocked";
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

function finalize(
  scenario: NegotiationScenario,
  startedAt: Date,
  round: number,
  transcript: TranscriptMessage[],
  status: "agreed" | "escalated",
  intent: NegotiationScenario["intent"] | undefined,
  proposedSlot?: ProposedSlot
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
    // many protocol stages it took to get there.
    rounds: 1,
    stagesCompleted: round,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    reasonerMode: activeReasonerMode(),
    intent,
    proposedSlot,
  };
}
