// Core domain model for the CSP (Cognition State Protocol) negotiation demo.
// Kept independent of Express/HTTP so the negotiation engine can be reused or
// swapped (e.g. for a real LLM-driven reasoner) without touching the API layer.

export type AgentKind = "webex" | "copilot";

/** Each agent platform labels the same underlying concept differently on purpose. */
export type WebexVocab = "busy" | "tentative-hold" | "free";
export type CopilotVocab = "busy" | "focus-time" | "free";
export type LocalStatus = WebexVocab | CopilotVocab;

/** The shared schema both agents translate into once a CSP grounding step runs. */
export type SharedStatus = "hard-busy" | "soft-busy" | "available";

export type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";

export interface CalendarBlock {
  day: Day;
  /** 24h "HH:MM" */
  start: string;
  end: string;
  status: LocalStatus;
  /** Human label as it would appear in the native calendar UI, e.g. "Tentative: Budget sync" */
  label: string;
}

export interface NoticePolicy {
  /** Minimum lead time, in hours, this agent's org requires before a meeting can be booked. */
  minNoticeHours: number;
}

export interface AgentProfile {
  kind: AgentKind;
  personName: string;
  orgId: string;
  calendar: CalendarBlock[];
  /** 1 (lowest) - 5 (highest) importance this org places on the meeting's stated goal. */
  priorityTier: number;
  notice: NoticePolicy;
}

export type TrustStatus = "trusted" | "pending-review";

export interface DataSharingPolicy {
  freeBusy: boolean;
  priorityTier: boolean;
  meetingTitlesAndAttendees: boolean;
  humanApprovalBeforeSend: boolean;
}

export interface Org {
  id: string;
  name: string;
  agentKind: AgentKind;
  trustStatus: TrustStatus;
}

export interface EmailMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  sentAt: string;
  body: string;
}

export interface StructuredIntent {
  goal: string;
  urgency: "low" | "medium" | "high";
  requiredAttendees: string[];
  durationMinutes: number;
  candidateWindows: string[];
}

export type NegotiationMode = "without-ioc" | "with-ioc";
export type NegotiationOutcome = "agreed" | "escalated";
export type NegotiationStage =
  | "discovery"
  | "ontology-grounding"
  | "intent-exchange"
  | "joint-negotiation"
  | "resolution"
  | "baseline-exchange"
  | "escalation"
  /** A cognition engine pass checking the candidate slot against the original shared intent object. */
  | "cognition-check"
  /** A utility/concession-based mediator stepping in after a detected deadlock. */
  | "negmas-mediation";

export interface TranscriptMessage {
  round: number;
  stage: NegotiationStage;
  from: "webex-agent" | "copilot-agent" | "system";
  kind:
    | "proposal"
    | "rejection"
    | "counter-proposal"
    | "info"
    | "mapping"
    | "intent"
    | "resolution"
    | "escalation"
    /** The cognition engine found the candidate slot doesn't match the shared intent (wrong window, wrong duration, ...). */
    | "drift"
    /** The cognition engine (or a mediator) corrected course back to an intent-compliant slot. */
    | "realignment"
    /** Two (or more) rigid proposals have repeated without progress - a genuine non-convergent cycle. */
    | "loop-detected"
    /** A mediator's scored offer for one candidate slot, shown with the utility numbers behind it. */
    | "mediation-offer"
    /** A mediator-brokered agreement once utilities clear the current concession threshold. */
    | "mediation-accept";
  text: string;
  /** Optional structured payload for UI rendering (e.g. the proposed slot). */
  data?: Record<string, unknown>;
  timestamp: string;
}

/**
 * An ACL-style ("Agent Communication Language") view of one transcript
 * message - the same event, reframed as an explicit protocol frame with a
 * performative, sender/receiver, and a machine-readable content payload.
 * This is a display-layer projection computed from TranscriptMessage, not a
 * second source of truth - see engine/protocol.ts.
 */
export interface ProtocolFrame {
  seq: number;
  performative: string;
  sender: TranscriptMessage["from"];
  receiver: TranscriptMessage["from"] | "broadcast";
  protocol: string;
  round: number;
  stage: NegotiationStage;
  content: Record<string, unknown>;
  text: string;
  timestamp: string;
}

export interface ProposedSlot {
  day: Day;
  start: string;
  end: string;
  durationMinutes: number;
  dateLabel: string;
}

export interface StatedWindow {
  day: Day;
  start: string;
  end: string;
  label: string; // e.g. "Tue afternoon", as the human phrased it in the thread
}

export interface NegotiationScenario {
  id: string;
  title: string;
  /** One line, human-facing: why this negotiation matters to the person who needs it, framed as a user story. */
  userStory: string;
  homeOrgId: string; // the org whose employee sent the first email
  partnerOrgId: string; // the other side. Equal to homeOrgId when isIntraOrg is true.
  /**
   * True when both agents belong to the same organization (e.g. two
   * employees at the same company, different business units). No
   * cross-org trust/discovery is needed, and if both agents share the same
   * AgentKind there's nothing to translate at the ontology stage either -
   * this isolates how much of CSP's value comes from shared intent + joint
   * reasoning alone, versus vocabulary translation.
   */
  isIntraOrg?: boolean;
  emailThread: EmailMessage[];
  /** The agent for the person who sent the first email. */
  homeAgent: AgentProfile;
  /** The agent for the other side - a cross-org partner, or another employee at the same org. */
  partnerAgent: AgentProfile;
  /** Rough day-part windows as stated by the humans in the email thread. */
  statedWindows: StatedWindow[];
  /**
   * Duration (minutes) a naive baseline assistant assumes with no shared
   * intent object to read from - a plain scheduling default, not derived
   * from the thread. Defaults to 60 if omitted.
   */
  baselineAssumedDurationMinutes?: number;
  /** The correctly-extracted structured intent, only available once agents ground a shared intent object (CSP stage c). */
  intent: StructuredIntent;
  /**
   * Hours between a fixed simulated "now" and the Monday of the demo week
   * (WEEK_START_DATE). Small values simulate a same-day/urgent ask that can
   * collide with an org's minimum notice-period policy.
   */
  simulatedNowOffsetHours?: number;
}

export interface NegotiationSession {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  orgAId: string;
  orgBId: string;
  mode: NegotiationMode;
  status: "in-progress" | NegotiationOutcome;
  transcript: TranscriptMessage[];
  /** Round-trips of back-and-forth negotiation. With-IoC mode resolves in a single joint pass, so this is always 1 (or 0 if it never got past discovery). */
  rounds: number;
  /** Number of CSP stages actually completed (with-IoC only) - a-e = 5, less if it escalated early. */
  stagesCompleted?: number;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  proposedSlot?: ProposedSlot;
  intent?: StructuredIntent;
  reasonerMode: "rule-based" | "llm";
  writeBack?: {
    webexEventId: string;
    copilotEventId: string;
    joinLink: string;
  };
  /** ACL-style protocol view of `transcript`, computed once and attached for the Protocol view's UI. */
  protocolFrames?: ProtocolFrame[];
}
