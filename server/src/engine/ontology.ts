import { AgentKind, LocalStatus, SharedStatus } from "../types/domain";

/**
 * Two org's calendar systems label the same concepts differently:
 * Webex side: busy / tentative-hold / free
 * Copilot side: busy / focus-time / free
 *
 * The CSP ontology-grounding stage maps both into one shared schema before any
 * negotiation logic runs. Without that step, an agent that sees the other
 * side's raw vocabulary (e.g. "focus-time") has no principled way to know
 * whether it's a hard blocker or a soft, movable hold - so the baseline mode
 * treats anything it doesn't recognize as unavailable, which is what causes
 * its extra back-and-forth.
 */
const WEBEX_TO_SHARED: Record<string, SharedStatus> = {
  busy: "hard-busy",
  "tentative-hold": "soft-busy",
  free: "available",
};

const COPILOT_TO_SHARED: Record<string, SharedStatus> = {
  busy: "hard-busy",
  "focus-time": "soft-busy",
  free: "available",
};

export function toSharedStatus(kind: AgentKind, status: LocalStatus): SharedStatus {
  const table = kind === "webex" ? WEBEX_TO_SHARED : COPILOT_TO_SHARED;
  const mapped = table[status];
  if (!mapped) throw new Error(`Unknown status "${status}" for agent kind "${kind}"`);
  return mapped;
}

export function localVocabLabel(kind: AgentKind): string {
  return kind === "webex" ? "tentative-hold" : "focus-time";
}

export function ontologyMappingLines(kind: AgentKind): string[] {
  const table = kind === "webex" ? WEBEX_TO_SHARED : COPILOT_TO_SHARED;
  return Object.entries(table).map(([local, shared]) => `${local} -> ${shared}`);
}
