// Demonstrates emergent, post-agreement drift: the negotiation resolves
// cleanly at T0, then at T+1 a brand-new calendar event lands on one agent's
// calendar - something neither agent could have known about when they
// negotiated - and happens to land exactly on the slot they just booked.
// This shows what CSP mode does about it: the same joint-reasoning pass runs
// again against the updated calendars and either finds the next-best
// compliant slot automatically, or escalates if nothing is left.
import { DataSharingPolicy, CalendarBlock, NegotiationScenario, NegotiationSession } from "../types/domain";
import { buildProtocolFrames } from "./protocol";
import { runWithIoc } from "./withIoc";

export interface EmergentEvent {
  affectedRole: "home" | "partner";
  affectedPersonName: string;
  block: CalendarBlock;
}

export interface EmergentConflictResult {
  t0: NegotiationSession;
  t1: NegotiationSession | null;
  emergentEvent: EmergentEvent | null;
}

/**
 * Deep-clones a scenario and adds one new hard-busy block to the home
 * agent's calendar, landing exactly on the given slot - simulating a sudden
 * invite nobody could have foreseen at negotiation time.
 */
function injectEmergentBlock(scenario: NegotiationScenario, slot: { day: CalendarBlock["day"]; start: string; end: string }): {
  scenario: NegotiationScenario;
  event: EmergentEvent;
} {
  const cloned: NegotiationScenario = JSON.parse(JSON.stringify(scenario));
  const block: CalendarBlock = {
    day: slot.day,
    start: slot.start,
    end: slot.end,
    status: "busy",
    label: "Sudden: urgent escalation call",
  };
  cloned.homeAgent.calendar.push(block);
  return {
    scenario: cloned,
    event: { affectedRole: "home", affectedPersonName: cloned.homeAgent.personName, block },
  };
}

export async function runEmergentConflictDemo(scenario: NegotiationScenario, policy: DataSharingPolicy): Promise<EmergentConflictResult> {
  const t0 = await runWithIoc(scenario, policy);
  t0.protocolFrames = buildProtocolFrames(t0);
  if (t0.status !== "agreed" || !t0.proposedSlot) {
    return { t0, t1: null, emergentEvent: null };
  }

  const { scenario: mutated, event } = injectEmergentBlock(scenario, t0.proposedSlot);
  const t1 = await runWithIoc(mutated, policy);
  t1.protocolFrames = buildProtocolFrames(t1);
  return { t0, t1, emergentEvent: event };
}
