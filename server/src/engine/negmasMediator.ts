// Demonstrates a genuine non-convergent cycle and a mediator breaking it.
// Both agents ground the same shared intent (discovery/ontology/intent all
// run normally) but the negotiation *strategy* here is deliberately rigid:
// each side always re-offers its own single favorite slot instead of
// reasoning jointly - a realistic bad implementation, not a contrived one.
// Two distinct, mutually infeasible favorites make this loop forever on its
// own. A lightweight, hand-rolled concession mediator then steps in, modeled
// on NegMAS's alternating-offers protocol (utilities + a monotonically
// conceding acceptance threshold) - this is NOT the real NegMAS Python
// library, which a Node/TS app can't invoke; it's a "NegMAS-style" simulation
// of the same idea, labeled as such everywhere it's shown.
import {
  DataSharingPolicy,
  NegotiationScenario,
  NegotiationSession,
  ProposedSlot,
  SharedStatus,
  TranscriptMessage,
} from "../types/domain";
import { formatSlot, statusAt } from "./calendarUtil";
import { Candidate, buildCandidates, candidateKey, hoursFromNow, isFreeForAgent, scoreCandidates } from "./jointReasoning";
import { agentLabel, discoveryStage, fromFor, intentStage, ontologyStage } from "./stages";
import { finalize } from "./withIoc";

const MAX_LOOP_ROUNDS = 6;
const START_THRESHOLD = 0.95;
const CONCESSION_STEP = 0.12;
const MIN_THRESHOLD = 0.2;
const MAX_MEDIATION_ROUNDS = 8;

function favoriteFor(agent: NegotiationScenario["homeAgent"], candidates: Candidate[]): Candidate | undefined {
  return candidates.find((c) => isFreeForAgent(agent, c));
}

function utility(isFavorite: boolean, ownShared: SharedStatus): number {
  let u = isFavorite ? 1.0 : 0.55;
  if (ownShared === "soft-busy") u -= 0.15;
  return Math.max(0, u);
}

export async function runLoopThenMediateDemo(scenario: NegotiationScenario, policy: DataSharingPolicy): Promise<NegotiationSession> {
  const startedAt = new Date();
  const transcript: TranscriptMessage[] = [];
  let round = 1;
  const tick = () => new Date(startedAt.getTime() + round * 25_000).toISOString();
  const { homeAgent, partnerAgent, intent } = scenario;

  const discovery = discoveryStage(scenario, policy, round, tick);
  transcript.push(...discovery.messages);
  if (discovery.escalated) return finalize(scenario, startedAt, round, transcript, "escalated", undefined);
  round++;
  transcript.push(...ontologyStage(scenario, round, tick));
  round++;
  transcript.push(...intentStage(scenario, round, tick));
  round++;

  const candidates = buildCandidates(scenario.statedWindows, intent.durationMinutes);
  const homeFavorite = favoriteFor(homeAgent, candidates);
  const partnerFavorite = favoriteFor(partnerAgent, candidates);
  let totalRounds = 0;

  if (!homeFavorite || !partnerFavorite) {
    transcript.push({
      round,
      stage: "escalation",
      from: "system",
      kind: "escalation",
      text: `At least one side has no fully free slot at all within the stated windows to even start from. Escalating.`,
      timestamp: tick(),
    });
    return finalize(scenario, startedAt, round, transcript, "escalated", intent, undefined, totalRounds);
  }

  transcript.push({
    round,
    stage: "joint-negotiation",
    from: "system",
    kind: "info",
    text:
      `Both agents ground the same shared intent, but this negotiation strategy is rigid: each side always re-offers ` +
      `its own single favorite slot rather than reasoning jointly. ${agentLabel(homeAgent)}'s favorite is ` +
      `${formatSlot(homeFavorite.day, homeFavorite.start, homeFavorite.end)}; ${agentLabel(partnerAgent)}'s favorite is ` +
      `${formatSlot(partnerFavorite.day, partnerFavorite.start, partnerFavorite.end)}.`,
    timestamp: tick(),
  });
  round++;

  const seen = new Set<string>();
  let loopDetected = false;
  let proposer: "home" | "partner" = "home";
  for (let i = 0; i < MAX_LOOP_ROUNDS; i++) {
    const proposerAgent = proposer === "home" ? homeAgent : partnerAgent;
    const responderAgent = proposer === "home" ? partnerAgent : homeAgent;
    const favorite = proposer === "home" ? homeFavorite : partnerFavorite;
    const key = `${proposer}:${candidateKey(favorite)}`;
    totalRounds++;

    transcript.push({
      round,
      stage: "baseline-exchange",
      from: fromFor(proposerAgent),
      kind: "proposal",
      text: `${agentLabel(proposerAgent)}: proposes ${formatSlot(favorite.day, favorite.start, favorite.end)} - the same favorite it always offers.`,
      data: { day: favorite.day, start: favorite.start, end: favorite.end },
      timestamp: tick(),
    });

    if (seen.has(key)) {
      loopDetected = true;
      transcript.push({
        round,
        stage: "negmas-mediation",
        from: "system",
        kind: "loop-detected",
        text:
          `Loop detected: ${agentLabel(proposerAgent)} has now re-offered ${formatSlot(favorite.day, favorite.start, favorite.end)} ` +
          `for the second time with no adaptation on either side. This rigid strategy will never converge on its own - handing off to a mediator.`,
        timestamp: tick(),
      });
      round++;
      break;
    }
    seen.add(key);

    const check = statusAt(responderAgent, favorite.day, favorite.start, favorite.end);
    const localTerm = check.block?.status ?? "busy";
    const mismatchNote =
      localTerm !== "busy"
        ? ` (a "${localTerm}" block${check.block?.label ? ` - "${check.block.label}"` : ""})`
        : ` (hard conflict${check.block?.label ? `: "${check.block.label}"` : ""})`;
    transcript.push({
      round,
      stage: "baseline-exchange",
      from: fromFor(responderAgent),
      kind: "rejection",
      text: `${agentLabel(responderAgent)}: can't do that time${mismatchNote}. Re-offering my own favorite instead.`,
      timestamp: tick(),
    });

    proposer = proposer === "home" ? "partner" : "home";
    round++;
  }

  if (!loopDetected) {
    transcript.push({
      round,
      stage: "negmas-mediation",
      from: "system",
      kind: "loop-detected",
      text: `No convergence after ${MAX_LOOP_ROUNDS} rigid rounds - treating this as a stalled negotiation and handing off to a mediator.`,
      timestamp: tick(),
    });
    round++;
  }

  // NegMAS-style mediation (simulated - see file header).
  const noticeFiltered = candidates.filter(
    (c) => hoursFromNow(scenario, c) >= homeAgent.notice.minNoticeHours && hoursFromNow(scenario, c) >= partnerAgent.notice.minNoticeHours
  );
  const scored = scoreCandidates(scenario, homeAgent, partnerAgent, noticeFiltered, false);

  if (scored.length === 0) {
    transcript.push({
      round,
      stage: "escalation",
      from: "system",
      kind: "escalation",
      text: `Even the mediator finds no mutually feasible slot (everything hits a hard conflict on one side). Escalating to humans.`,
      timestamp: tick(),
    });
    return finalize(scenario, startedAt, round, transcript, "escalated", intent, undefined, totalRounds);
  }

  const utilities = scored.map((sc) => {
    const isHomeFav = candidateKey(sc.c) === candidateKey(homeFavorite);
    const isPartnerFav = candidateKey(sc.c) === candidateKey(partnerFavorite);
    return { sc, homeU: utility(isHomeFav, sc.homeStatus), partnerU: utility(isPartnerFav, sc.partnerStatus) };
  });

  let mediated: (typeof utilities)[number] | undefined;
  let finalThreshold = START_THRESHOLD;
  for (let r = 1; r <= MAX_MEDIATION_ROUNDS; r++) {
    const threshold = Math.max(MIN_THRESHOLD, START_THRESHOLD - (r - 1) * CONCESSION_STEP);
    finalThreshold = threshold;
    const clearing = utilities.filter((u) => u.homeU >= threshold && u.partnerU >= threshold);
    totalRounds++;
    transcript.push({
      round,
      stage: "negmas-mediation",
      from: "system",
      kind: "mediation-offer",
      text: `Mediation round ${r}: acceptance threshold ${threshold.toFixed(2)} - ${
        clearing.length ? `${clearing.length} candidate(s) clear it` : "no candidate clears it yet"
      }.`,
      data: {
        round: r,
        threshold,
        clearing: clearing.map((c) => ({
          slot: formatSlot(c.sc.c.day, c.sc.c.start, c.sc.c.end),
          homeUtility: c.homeU,
          partnerUtility: c.partnerU,
        })),
      },
      timestamp: tick(),
    });
    round++;
    if (clearing.length) {
      clearing.sort(
        (a, b) => Math.min(b.homeU, b.partnerU) - Math.min(a.homeU, a.partnerU) || Math.max(b.homeU, b.partnerU) - Math.max(a.homeU, a.partnerU)
      );
      mediated = clearing[0];
      break;
    }
  }

  if (!mediated) {
    const ranked = [...utilities].sort((a, b) => Math.min(b.homeU, b.partnerU) - Math.min(a.homeU, a.partnerU));
    mediated = ranked[0];
    transcript.push({
      round,
      stage: "negmas-mediation",
      from: "system",
      kind: "mediation-offer",
      text: `Concession floor reached with no natural match - the mediator imposes the fairest available compromise instead of conceding further.`,
      timestamp: tick(),
    });
    round++;
  }

  const slot: ProposedSlot = {
    day: mediated.sc.c.day,
    start: mediated.sc.c.start,
    end: mediated.sc.c.end,
    durationMinutes: intent.durationMinutes,
    dateLabel: formatSlot(mediated.sc.c.day, mediated.sc.c.start, mediated.sc.c.end),
  };
  transcript.push({
    round,
    stage: "negmas-mediation",
    from: "system",
    kind: "mediation-accept",
    text: `Mediated agreement: ${slot.dateLabel} - utility ${mediated.homeU.toFixed(2)} for ${homeAgent.personName}, ${mediated.partnerU.toFixed(
      2
    )} for ${partnerAgent.personName}. Both clear the final threshold of ${finalThreshold.toFixed(2)}.`,
    data: { ...slot, homeUtility: mediated.homeU, partnerUtility: mediated.partnerU },
    timestamp: tick(),
  });
  round++;

  const approvalNote = policy.humanApprovalBeforeSend
    ? " Per data-sharing policy, this still requires a human to accept before any invite goes out."
    : "";
  transcript.push({
    round,
    stage: "resolution",
    from: "system",
    kind: "resolution",
    text: `Mediator-brokered resolution: ${slot.dateLabel}.${approvalNote}`,
    data: { ...slot },
    timestamp: tick(),
  });

  const session = finalize(scenario, startedAt, round, transcript, "agreed", intent, slot, totalRounds);
  session.writeBack = {
    webexEventId: `webex-evt-mediated-${scenario.id}`,
    copilotEventId: `copilot-evt-mediated-${scenario.id}`,
    joinLink: `https://web.example-webex.com/join/mediated-${scenario.id}`,
  };
  return session;
}
