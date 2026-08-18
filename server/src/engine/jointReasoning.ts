// Shared candidate-building and scoring math used by every "joint reasoning"
// path in this app: the standard CSP negotiation (withIoc.ts), the cognition
// engine's drift/realignment demo, and the NegMAS-style mediator demo. Kept
// here once so all four reasoning paths score candidates identically -
// only their *search space* or *acceptance rule* differs, not the underlying
// calendar math.
import { AgentProfile, Day, NegotiationScenario, SharedStatus, StatedWindow } from "../types/domain";
import { DAY_OFFSET, addMinutes, statusAt } from "./calendarUtil";
import { toSharedStatus } from "./ontology";

export interface Candidate {
  day: Day;
  start: string;
  end: string;
  windowLabel: string;
}

export interface ScoredCandidate {
  c: Candidate;
  score: number;
  homeStatus: SharedStatus;
  partnerStatus: SharedStatus;
}

const ALL_DAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

/** A search space spanning the whole business week, ignoring what the humans actually stated - used to demonstrate scope drift. */
export const FULL_WEEK_WINDOWS: StatedWindow[] = ALL_DAYS.map((day) => ({
  day,
  start: "09:00",
  end: "17:00",
  label: `${day} (unconstrained)`,
}));

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
export function fromMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function buildCandidates(windows: StatedWindow[], durationMinutes: number): Candidate[] {
  const out: Candidate[] = [];
  for (const w of windows) {
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

export function hoursFromNow(scenario: NegotiationScenario, c: Candidate): number {
  const nowOffset = scenario.simulatedNowOffsetHours ?? 240;
  return nowOffset + DAY_OFFSET[c.day] * 24 + toMin(c.start) / 60;
}

/** Scores every candidate across both calendars in the shared schema; excludes anything hard-busy for either side. Sorted best (fewest soft-busy touches) first. */
export function scoreCandidates(
  scenario: NegotiationScenario,
  homeAgent: AgentProfile,
  partnerAgent: AgentProfile,
  candidates: Candidate[],
  enforceNotice = true
): ScoredCandidate[] {
  const scored: ScoredCandidate[] = [];
  for (const c of candidates) {
    if (enforceNotice) {
      const hrs = hoursFromNow(scenario, c);
      if (hrs < homeAgent.notice.minNoticeHours || hrs < partnerAgent.notice.minNoticeHours) continue;
    }
    const homeLocal = statusAt(homeAgent, c.day, c.start, c.end);
    const partnerLocal = statusAt(partnerAgent, c.day, c.start, c.end);
    const homeShared = toSharedStatus(homeAgent.kind, homeLocal.status);
    const partnerShared = toSharedStatus(partnerAgent.kind, partnerLocal.status);
    if (homeShared === "hard-busy" || partnerShared === "hard-busy") continue;
    const score = (homeShared === "soft-busy" ? 1 : 0) + (partnerShared === "soft-busy" ? 1 : 0);
    scored.push({ c, score, homeStatus: homeShared, partnerStatus: partnerShared });
  }
  return scored.sort((a, b) => a.score - b.score);
}

export function isFreeForAgent(agent: AgentProfile, c: Candidate): boolean {
  return statusAt(agent, c.day, c.start, c.end).status === "free";
}

export function candidateKey(c: Candidate): string {
  return `${c.day}-${c.start}`;
}

export function inWindows(c: Candidate, windows: StatedWindow[]): boolean {
  return windows.some((w) => w.day === c.day && toMin(w.start) <= toMin(c.start) && toMin(c.end) >= toMin(c.end));
}
