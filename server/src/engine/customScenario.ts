// Turns client-supplied JSON (from the Conflict Lab UI) into a real
// NegotiationScenario and runs it through the exact same engine functions
// used everywhere else in the app. This is the seam that proves the
// negotiation logic is genuine reasoning over calendar data, not a script:
// anything a caller builds here - a new conflict, a new ontology mismatch,
// a new notice-period trap - gets evaluated live, with no special-casing.
import { getOrg } from "../data/orgs";
import { AgentProfile, CalendarBlock, Day, NegotiationScenario, StatedWindow } from "../types/domain";

const DAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEBEX_STATUSES = new Set(["busy", "tentative-hold", "free"]);
const COPILOT_STATUSES = new Set(["busy", "focus-time", "free"]);

function fail(msg: string): never {
  throw new Error(`Invalid custom scenario: ${msg}`);
}

function str(v: unknown, field: string, fallback?: string): string {
  if (typeof v === "string" && v.trim()) return v;
  if (fallback !== undefined) return fallback;
  fail(`"${field}" must be a non-empty string`);
}

function num(v: unknown, field: string, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) fail(`"${field}" must be a number between ${min} and ${max}`);
  return n;
}

function day(v: unknown, field: string): Day {
  if (typeof v === "string" && (DAYS as string[]).includes(v)) return v as Day;
  fail(`"${field}" must be one of ${DAYS.join(", ")}`);
}

function time(v: unknown, field: string): string {
  if (typeof v === "string" && TIME_RE.test(v)) return v;
  fail(`"${field}" must be "HH:MM" 24h time, got ${JSON.stringify(v)}`);
}

function buildCalendar(raw: unknown, kind: "webex" | "copilot", field: string): CalendarBlock[] {
  if (!Array.isArray(raw)) fail(`"${field}" must be an array of calendar blocks`);
  const allowed = kind === "webex" ? WEBEX_STATUSES : COPILOT_STATUSES;
  return raw.map((b, i) => {
    const status = str(b?.status, `${field}[${i}].status`);
    if (!allowed.has(status)) {
      fail(`${field}[${i}].status must be one of ${[...allowed].join(", ")} for a ${kind} agent, got "${status}"`);
    }
    const start = time(b?.start, `${field}[${i}].start`);
    const end = time(b?.end, `${field}[${i}].end`);
    if (start >= end) fail(`${field}[${i}]: start (${start}) must be before end (${end})`);
    return {
      day: day(b?.day, `${field}[${i}].day`),
      start,
      end,
      status: status as CalendarBlock["status"],
      label: typeof b?.label === "string" ? b.label : "",
    };
  });
}

function buildAgent(raw: unknown, kind: "webex" | "copilot", orgId: string, field: string): AgentProfile {
  if (!raw || typeof raw !== "object") fail(`"${field}" is required`);
  const a = raw as Record<string, unknown>;
  return {
    kind,
    personName: str(a.personName, `${field}.personName`),
    orgId,
    priorityTier: num(a.priorityTier ?? 3, `${field}.priorityTier`, 1, 5),
    notice: { minNoticeHours: num((a.notice as any)?.minNoticeHours ?? 4, `${field}.notice.minNoticeHours`, 0, 240) },
    calendar: buildCalendar(a.calendar ?? [], kind, `${field}.calendar`),
  };
}

function buildStatedWindows(raw: unknown): StatedWindow[] {
  if (!Array.isArray(raw) || raw.length === 0) fail(`"statedWindows" must be a non-empty array`);
  return raw.map((w, i) => {
    const start = time(w?.start, `statedWindows[${i}].start`);
    const end = time(w?.end, `statedWindows[${i}].end`);
    if (start >= end) fail(`statedWindows[${i}]: start (${start}) must be before end (${end})`);
    return {
      day: day(w?.day, `statedWindows[${i}].day`),
      start,
      end,
      label: typeof w?.label === "string" && w.label ? w.label : `${w?.day ?? ""} window`,
    };
  });
}

/**
 * Builds a full NegotiationScenario from Conflict Lab input. Throws a
 * descriptive Error (caught by the route and returned as a 400) on any
 * malformed field - this is a real external input boundary now, unlike the
 * hardcoded seed scenarios, so it validates rather than trusting the caller.
 */
export function buildCustomScenario(body: unknown): NegotiationScenario {
  if (!body || typeof body !== "object") fail("request body must be an object");
  const b = body as Record<string, unknown>;

  const isIntraOrg = Boolean(b.isIntraOrg);
  const homeOrgId = str(b.homeOrgId, "homeOrgId");
  let partnerOrgId: string;
  let partnerKind: "webex" | "copilot";

  if (isIntraOrg) {
    partnerOrgId = homeOrgId;
    partnerKind = "webex";
  } else {
    partnerOrgId = str(b.partnerOrgId, "partnerOrgId");
    const org = getOrg(partnerOrgId);
    if (!org) fail(`partnerOrgId "${partnerOrgId}" is not a known partner org`);
    partnerKind = org.agentKind;
  }

  const intentRaw = (b.intent ?? {}) as Record<string, unknown>;
  const urgency = intentRaw.urgency;
  if (urgency !== "low" && urgency !== "medium" && urgency !== "high") {
    fail(`"intent.urgency" must be "low", "medium", or "high"`);
  }
  const requiredAttendees = Array.isArray(intentRaw.requiredAttendees)
    ? intentRaw.requiredAttendees.filter((x: unknown) => typeof x === "string" && x)
    : [];
  const statedWindows = buildStatedWindows(b.statedWindows);

  return {
    id: "custom",
    title: str(b.title, "title", "Custom scenario (Conflict Lab)"),
    userStory: str(b.userStory, "userStory", "A custom scenario built in the Conflict Lab to test a specific conflict."),
    homeOrgId,
    partnerOrgId,
    isIntraOrg,
    emailThread: [
      {
        id: "lab-1",
        from: "Conflict Lab",
        to: "Conflict Lab",
        subject: str(b.title, "title", "Custom scenario"),
        sentAt: new Date(0).toISOString(),
        body: str(b.userStory, "userStory", "Built in the Conflict Lab."),
      },
    ],
    homeAgent: buildAgent(b.homeAgent, "webex", homeOrgId, "homeAgent"),
    partnerAgent: buildAgent(b.partnerAgent, partnerKind, partnerOrgId, "partnerAgent"),
    statedWindows,
    baselineAssumedDurationMinutes: num(b.baselineAssumedDurationMinutes ?? 60, "baselineAssumedDurationMinutes", 5, 480),
    simulatedNowOffsetHours: num(b.simulatedNowOffsetHours ?? 240, "simulatedNowOffsetHours", 0, 2000),
    intent: {
      goal: str(intentRaw.goal, "intent.goal", "Custom meeting"),
      urgency,
      requiredAttendees: requiredAttendees.length ? requiredAttendees : ["Home attendee", "Partner attendee"],
      durationMinutes: num(intentRaw.durationMinutes ?? 30, "intent.durationMinutes", 5, 480),
      candidateWindows: statedWindows.map((w) => w.label),
    },
  };
}
