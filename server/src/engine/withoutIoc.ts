// Baseline negotiation: no shared ontology, no shared intent object, no joint
// reasoning. Each agent only ever looks at its own calendar, in its own
// vocabulary, and only ever reasons about one candidate slot at a time. This
// is what most "agent-to-agent" scheduling looks like today without a
// coordination layer - it's genuinely usable, just inefficient and brittle.
import {
  AgentProfile,
  Day,
  NegotiationScenario,
  NegotiationSession,
  TranscriptMessage,
} from "../types/domain";
import { addMinutes, formatSlot, statusAt } from "./calendarUtil";

const MAX_ROUNDS = 6;
const DEFAULT_DURATION = 60;

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

function isFreeForAgent(agent: AgentProfile, c: Candidate): boolean {
  return statusAt(agent, c.day, c.start, c.end).status === "free";
}

export function runWithoutIoc(scenario: NegotiationScenario): NegotiationSession {
  const startedAt = new Date();
  const transcript: TranscriptMessage[] = [];
  const duration = scenario.baselineAssumedDurationMinutes ?? DEFAULT_DURATION;
  const candidates = buildCandidates(scenario, duration);
  const tried = new Set<string>();
  const key = (c: Candidate) => `${c.day}-${c.start}`;

  transcript.push(
    sys(
      1,
      "baseline-exchange",
      `No shared protocol in play: each agent only reasons about its own calendar, in its own vocabulary, ` +
        `and assumes a default meeting length of ${duration} minutes since there is no shared intent object to read the real ask from.`
    )
  );

  let proposer: "webex" | "copilot" = "webex";
  let round = 1;
  let resolved: Candidate | undefined;
  let escalationReason: string | undefined;

  while (round <= MAX_ROUNDS) {
    const proposerAgent = proposer === "webex" ? scenario.webexAgent : scenario.copilotAgent;
    const responderAgent = proposer === "webex" ? scenario.copilotAgent : scenario.webexAgent;

    const pick = candidates.find((c) => !tried.has(key(c)) && isFreeForAgent(proposerAgent, c));
    if (!pick) {
      // This agent has nothing left to offer from its own calendar. Hand off
      // to the other side once; if THEY also have nothing, it's a stalemate.
      const otherAgent = responderAgent;
      const otherPick = candidates.find((c) => !tried.has(key(c)) && isFreeForAgent(otherAgent, c));
      if (!otherPick) {
        escalationReason =
          "Both agents have exhausted every candidate slot within the stated windows without finding one free on both calendars. " +
          "Neither agent can see whether the other's held time is movable, so nothing marked busy on either side gets reconsidered.";
        break;
      }
      proposer = proposer === "webex" ? "copilot" : "webex";
      continue;
    }

    tried.add(key(pick));
    transcript.push({
      round,
      stage: "baseline-exchange",
      from: proposer === "webex" ? "webex-agent" : "copilot-agent",
      kind: "proposal",
      text: `${label(proposerAgent)}: proposes ${formatSlot(pick.day, pick.start, pick.end)} (${pick.windowLabel}), ${duration} min.`,
      data: { day: pick.day, start: pick.start, end: pick.end },
      timestamp: iso(startedAt, round),
    });

    const check = statusAt(responderAgent, pick.day, pick.start, pick.end);
    if (check.status === "free") {
      resolved = pick;
      transcript.push({
        round,
        stage: "baseline-exchange",
        from: proposer === "webex" ? "copilot-agent" : "webex-agent",
        kind: "resolution",
        text: `${label(responderAgent)}: that slot is open on my calendar too - agreed.`,
        timestamp: iso(startedAt, round),
      });
      break;
    }

    const localTerm = check.block?.status ?? "busy";
    const mismatchNote =
      localTerm !== "busy"
        ? ` (a "${localTerm}" block${check.block?.label ? ` - "${check.block.label}"` : ""} - ${label(
            responderAgent
          )}'s side has no way to tell ${label(proposerAgent)}'s agent whether that's movable)`
        : ` (hard conflict${check.block?.label ? `: "${check.block.label}"` : ""})`;
    transcript.push({
      round,
      stage: "baseline-exchange",
      from: proposer === "webex" ? "copilot-agent" : "webex-agent",
      kind: "rejection",
      text: `${label(responderAgent)}: can't do that time${mismatchNote}.`,
      timestamp: iso(startedAt, round),
    });

    proposer = proposer === "webex" ? "copilot" : "webex";
    round += 1;
  }

  if (!resolved && !escalationReason) {
    escalationReason = `No agreement reached after ${MAX_ROUNDS} rounds.`;
  }

  const endedAt = new Date(startedAt.getTime() + transcript.length * 45_000);
  if (escalationReason) {
    transcript.push({
      round: round,
      stage: "escalation",
      from: "system",
      kind: "escalation",
      text: `Escalating to Dana and the partner contact for manual scheduling: ${escalationReason}`,
      timestamp: endedAt.toISOString(),
    });
  }

  return {
    id: "", // assigned by caller/store
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    orgAId: scenario.homeOrgId,
    orgBId: scenario.partnerOrgId,
    mode: "without-ioc",
    status: resolved ? "agreed" : "escalated",
    transcript,
    rounds: round,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    reasonerMode: "rule-based",
    proposedSlot: resolved
      ? {
          day: resolved.day,
          start: resolved.start,
          end: resolved.end,
          durationMinutes: duration,
          dateLabel: formatSlot(resolved.day, resolved.start, resolved.end),
        }
      : undefined,
  };
}

function label(agent: AgentProfile): string {
  return `${agent.personName} (${agent.kind === "webex" ? "Webex agent" : "Copilot agent"})`;
}

function sys(round: number, stage: TranscriptMessage["stage"], text: string): TranscriptMessage {
  return { round, stage, from: "system", kind: "info", text, timestamp: new Date().toISOString() };
}

function iso(base: Date, round: number): string {
  return new Date(base.getTime() + round * 45_000).toISOString();
}
