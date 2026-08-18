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
  | "escalation";

export interface TranscriptMessage {
  round: number;
  stage: NegotiationStage;
  from: "webex-agent" | "copilot-agent" | "system";
  kind: "proposal" | "rejection" | "counter-proposal" | "info" | "mapping" | "intent" | "resolution" | "escalation";
  text: string;
  /** Optional structured payload for UI rendering (e.g. the proposed slot). */
  data?: Record<string, unknown>;
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
  homeOrgId: string; // Northwind Corp, always the Webex side
  partnerOrgId: string;
  emailThread: EmailMessage[];
  webexAgent: AgentProfile;
  copilotAgent: AgentProfile;
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
}
