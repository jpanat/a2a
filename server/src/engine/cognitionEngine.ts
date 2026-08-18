// Demonstrates intent drift and correction. The joint-negotiation pass here
// is deliberately "smarter but careless": instead of searching only the
// windows the humans actually stated, it searches the whole business week
// for the best-scoring calendar fit - a realistic failure mode (an agent
// optimizing a metric while quietly widening its own scope, not a calendar
// bug). A separate cognition-check stage then compares whatever it found
// against the original shared intent object and, if it drifted outside the
// stated windows, re-grounds to a compliant candidate before resolving.
import { DataSharingPolicy, NegotiationScenario, NegotiationSession, ProposedSlot, TranscriptMessage } from "../types/domain";
import { formatSlot } from "./calendarUtil";
import { FULL_WEEK_WINDOWS, ScoredCandidate, buildCandidates, hoursFromNow, inWindows, scoreCandidates } from "./jointReasoning";
import { explainResolution } from "./reasoner";
import { discoveryStage, intentStage, ontologyStage } from "./stages";
import { finalize } from "./withIoc";

function slotFrom(candidate: ScoredCandidate, durationMinutes: number): ProposedSlot {
  return {
    day: candidate.c.day,
    start: candidate.c.start,
    end: candidate.c.end,
    durationMinutes,
    dateLabel: formatSlot(candidate.c.day, candidate.c.start, candidate.c.end),
  };
}

export async function runDriftDemo(scenario: NegotiationScenario, policy: DataSharingPolicy): Promise<NegotiationSession> {
  const startedAt = new Date();
  const transcript: TranscriptMessage[] = [];
  let round = 1;
  const tick = () => new Date(startedAt.getTime() + round * 20_000).toISOString();
  const { homeAgent, partnerAgent, intent } = scenario;

  const discovery = discoveryStage(scenario, policy, round, tick);
  transcript.push(...discovery.messages);
  if (discovery.escalated) return finalize(scenario, startedAt, round, transcript, "escalated", undefined);
  round++;

  transcript.push(...ontologyStage(scenario, round, tick));
  round++;

  transcript.push(...intentStage(scenario, round, tick));
  round++;

  // Drift-prone pass: search everywhere, optimize purely for calendar fit.
  const unconstrainedCandidates = buildCandidates(FULL_WEEK_WINDOWS, intent.durationMinutes);
  const unconstrainedScored = scoreCandidates(scenario, homeAgent, partnerAgent, unconstrainedCandidates, false);

  transcript.push({
    round,
    stage: "joint-negotiation",
    from: "system",
    kind: "info",
    text: `Joint search widened past the stated windows [${intent.candidateWindows.join(", ")}] to ${unconstrainedCandidates.length} candidates across the full business week, optimizing purely for calendar fit.`,
    timestamp: tick(),
  });

  if (unconstrainedScored.length === 0) {
    transcript.push({
      round,
      stage: "escalation",
      from: "system",
      kind: "escalation",
      text: `No calendar slot exists anywhere in the business week without a hard conflict on one side. Escalating to humans.`,
      timestamp: tick(),
    });
    return finalize(scenario, startedAt, round, transcript, "escalated", intent);
  }

  const drifted = unconstrainedScored[0];
  const driftedSlot = slotFrom(drifted, intent.durationMinutes);

  transcript.push({
    round,
    stage: "joint-negotiation",
    from: "system",
    kind: "info",
    text: `Best-scoring option found: ${driftedSlot.dateLabel} (soft-busy touches: ${drifted.score}). About to propose this as the resolution.`,
    data: { ...driftedSlot },
    timestamp: tick(),
  });
  round++;

  const compliant = inWindows(drifted.c, scenario.statedWindows);
  transcript.push({
    round,
    stage: "cognition-check",
    from: "system",
    kind: compliant ? "info" : "drift",
    text: compliant
      ? `Cognition engine check: ${driftedSlot.dateLabel} falls inside a stated window - no drift from the shared intent. Proceeding.`
      : `Cognition engine check: ${driftedSlot.dateLabel} is NOT inside any stated window [${intent.candidateWindows.join(", ")}]. ` +
        `The search satisfied both calendars but silently drifted past what the humans actually asked for - flagging this before it goes any further.`,
    data: { driftedSlot, statedWindows: scenario.statedWindows },
    timestamp: tick(),
  });

  let finalCandidate = drifted;
  let finalSlot = driftedSlot;
  let realigned = false;

  if (!compliant) {
    round++;
    const constrainedCandidates = buildCandidates(scenario.statedWindows, intent.durationMinutes);
    const noticeFiltered = constrainedCandidates.filter(
      (c) => hoursFromNow(scenario, c) >= homeAgent.notice.minNoticeHours && hoursFromNow(scenario, c) >= partnerAgent.notice.minNoticeHours
    );
    const constrainedScored = scoreCandidates(scenario, homeAgent, partnerAgent, noticeFiltered, false);

    if (constrainedScored.length === 0) {
      transcript.push({
        round,
        stage: "cognition-check",
        from: "system",
        kind: "escalation",
        text: `Re-grounded to the stated windows only and found no compliant candidate at all - the drifted answer can't be salvaged. Escalating to humans rather than silently keeping an off-ask slot.`,
        timestamp: tick(),
      });
      return finalize(scenario, startedAt, round, transcript, "escalated", intent);
    }

    finalCandidate = constrainedScored[0];
    finalSlot = slotFrom(finalCandidate, intent.durationMinutes);
    realigned = true;

    transcript.push({
      round,
      stage: "cognition-check",
      from: "system",
      kind: "realignment",
      text: `Realigned to the shared intent: re-scored candidates within the stated windows only and selected ${finalSlot.dateLabel} instead. This is the version that actually reflects what was asked.`,
      data: { ...finalSlot },
      timestamp: tick(),
    });
  }
  round++;

  const reasons: string[] = [
    finalCandidate.homeStatus === "available"
      ? `fully open for ${homeAgent.personName}`
      : `only a soft, movable hold for ${homeAgent.personName}`,
    finalCandidate.partnerStatus === "available"
      ? `fully open for ${partnerAgent.personName}`
      : `only a soft, movable hold for ${partnerAgent.personName}`,
  ];
  const explanation = await explainResolution({
    scenarioTitle: scenario.title,
    slotDescription: finalSlot.dateLabel,
    durationMinutes: intent.durationMinutes,
    originalDurationMinutes: scenario.baselineAssumedDurationMinutes ?? intent.durationMinutes,
    reasons,
  });

  const approvalNote = policy.humanApprovalBeforeSend
    ? " Per data-sharing policy, this still requires a human to accept before any invite goes out."
    : "";
  transcript.push({
    round,
    stage: "resolution",
    from: "system",
    kind: "resolution",
    text: (realigned ? "After correcting for drift: " : "") + explanation + approvalNote,
    data: { ...finalSlot },
    timestamp: tick(),
  });

  const session = finalize(scenario, startedAt, round, transcript, "agreed", intent, finalSlot);
  session.writeBack = {
    webexEventId: `webex-evt-drift-${scenario.id}`,
    copilotEventId: `copilot-evt-drift-${scenario.id}`,
    joinLink: `https://web.example-webex.com/join/drift-${scenario.id}`,
  };
  return session;
}
