import { NegotiationScenario } from "../types/domain";
import { HOME_ORG_ID } from "./orgs";

// All scenarios play out "next week" relative to WEEK_START_DATE in calendarUtil.ts
// (a Monday). Mon=day0 ... Fri=day4.

export const scenarios: NegotiationScenario[] = [
  // ---------------------------------------------------------------------
  // 1. FLAGSHIP SCENARIO - used in the end-user view and the comparison view.
  // Designed so the baseline genuinely stalls on an ontology mismatch and a
  // naive duration default, then escalates; CSP mode resolves it by grounding
  // vocab, extracting the real (shorter) duration, and reasoning over both
  // calendars in one pass.
  // ---------------------------------------------------------------------
  {
    id: "fenwick-integration-sync",
    title: "Integration timeline sync - Northwind x Fenwick Partners",
    homeOrgId: HOME_ORG_ID,
    partnerOrgId: "fenwick",
    statedWindows: [
      { day: "Tue", start: "14:00", end: "17:00", label: "Tue afternoon" },
      { day: "Thu", start: "09:00", end: "12:00", label: "Thu morning" },
    ],
    baselineAssumedDurationMinutes: 60,
    intent: {
      goal: "Sync on the integration timeline",
      urgency: "medium",
      requiredAttendees: ["Dana Whitfield", "Marcus Ilic", "Priya Nair"],
      durationMinutes: 30,
      candidateWindows: ["Tue afternoon", "Thu morning"],
    },
    emailThread: [
      {
        id: "m1",
        from: "Dana Whitfield <dana.whitfield@northwind.example>",
        to: "Marcus Ilic <marcus.ilic@fenwickpartners.example>",
        subject: "Integration timeline - quick sync?",
        sentAt: "2026-08-17T09:12:00-07:00",
        body:
          "Hi Marcus,\n\nCan we grab a quick sync on the integration timeline before next sprint planning? " +
          "30 min should do it. I'm free Tue afternoon or Thu morning next week - whatever works on your end.\n\nDana",
      },
      {
        id: "m2",
        from: "Marcus Ilic <marcus.ilic@fenwickpartners.example>",
        to: "Dana Whitfield <dana.whitfield@northwind.example>",
        subject: "RE: Integration timeline - quick sync?",
        sentAt: "2026-08-17T10:47:00-07:00",
        body:
          "Works for me - let's loop in Priya from my side too since she owns the data-mapping piece. " +
          "I'll let my scheduling assistant sort out the exact time with yours.\n\nMarcus",
      },
    ],
    webexAgent: {
      kind: "webex",
      personName: "Dana Whitfield",
      orgId: HOME_ORG_ID,
      priorityTier: 3,
      notice: { minNoticeHours: 4 },
      calendar: [
        { day: "Tue", start: "14:00", end: "15:00", status: "tentative-hold", label: "Tentative: Roadmap review" },
        { day: "Tue", start: "15:00", end: "16:00", status: "free", label: "" },
        { day: "Tue", start: "16:00", end: "17:00", status: "busy", label: "1:1 with manager" },
        { day: "Thu", start: "09:00", end: "10:30", status: "busy", label: "Board prep" },
        { day: "Thu", start: "10:30", end: "11:00", status: "free", label: "" },
        { day: "Thu", start: "11:00", end: "12:00", status: "tentative-hold", label: "Tentative: Backup planning" },
      ],
    },
    copilotAgent: {
      kind: "copilot",
      personName: "Marcus Ilic",
      orgId: "fenwick",
      priorityTier: 3,
      notice: { minNoticeHours: 24 },
      calendar: [
        { day: "Tue", start: "14:00", end: "16:00", status: "focus-time", label: "Focus time: architecture doc" },
        { day: "Tue", start: "16:00", end: "17:00", status: "free", label: "" },
        { day: "Thu", start: "09:00", end: "09:30", status: "free", label: "" },
        { day: "Thu", start: "09:30", end: "11:00", status: "busy", label: "Client QBR" },
        { day: "Thu", start: "11:00", end: "12:00", status: "focus-time", label: "Focus time: prep for client call" },
      ],
    },
  },

  // ---------------------------------------------------------------------
  // 2. A "good case" for contrast - even the baseline converges here, just
  // less efficiently than CSP mode. Not every without-IoC negotiation should
  // be a disaster.
  // ---------------------------------------------------------------------
  {
    id: "solace-quarterly-review",
    title: "Quarterly integration review - Northwind x Solace Health",
    homeOrgId: HOME_ORG_ID,
    partnerOrgId: "solace",
    statedWindows: [
      { day: "Wed", start: "09:00", end: "12:00", label: "Wed morning" },
      { day: "Wed", start: "13:00", end: "16:00", label: "Wed afternoon" },
    ],
    baselineAssumedDurationMinutes: 30,
    intent: {
      goal: "Quarterly integration review",
      urgency: "low",
      requiredAttendees: ["Alex Chen", "Priya Nair"],
      durationMinutes: 30,
      candidateWindows: ["Wed morning", "Wed afternoon"],
    },
    emailThread: [
      {
        id: "m1",
        from: "Alex Chen <alex.chen@northwind.example>",
        to: "Priya Nair <priya.nair@solacehealth.example>",
        subject: "Quarterly review - grab 30 min Wed?",
        sentAt: "2026-08-14T11:00:00-07:00",
        body: "Hi Priya, can we do our usual quarterly integration review Wednesday? Morning or afternoon both fine for me.",
      },
    ],
    webexAgent: {
      kind: "webex",
      personName: "Alex Chen",
      orgId: HOME_ORG_ID,
      priorityTier: 2,
      notice: { minNoticeHours: 4 },
      calendar: [
        { day: "Wed", start: "09:00", end: "10:00", status: "busy", label: "Standup + triage" },
        { day: "Wed", start: "10:00", end: "12:00", status: "free", label: "" },
        { day: "Wed", start: "13:00", end: "14:00", status: "tentative-hold", label: "Tentative: Budget hold" },
        { day: "Wed", start: "14:00", end: "16:00", status: "free", label: "" },
      ],
    },
    copilotAgent: {
      kind: "copilot",
      personName: "Priya Nair",
      orgId: "solace",
      priorityTier: 2,
      notice: { minNoticeHours: 8 },
      calendar: [
        { day: "Wed", start: "09:00", end: "11:00", status: "focus-time", label: "Focus time: compliance draft" },
        { day: "Wed", start: "11:00", end: "13:30", status: "free", label: "" },
        { day: "Wed", start: "13:30", end: "16:00", status: "busy", label: "Client onsite" },
      ],
    },
  },

  // ---------------------------------------------------------------------
  // 3. Trust not yet established - CSP mode should escalate immediately at
  // the discovery stage, before any calendar reasoning happens at all. The
  // baseline mode has no concept of org trust, so it barrels ahead on
  // calendars alone - which is itself the point: without a discovery stage,
  // nothing stops an ungoverned negotiation from happening.
  // ---------------------------------------------------------------------
  {
    id: "bramwell-vendor-intro",
    title: "Vendor intro call - Northwind x Bramwell & Vance",
    homeOrgId: HOME_ORG_ID,
    partnerOrgId: "bramwell",
    statedWindows: [{ day: "Mon", start: "10:00", end: "15:00", label: "Mon daytime" }],
    baselineAssumedDurationMinutes: 30,
    intent: {
      goal: "Vendor introduction call",
      urgency: "low",
      requiredAttendees: ["Dana Whitfield", "Sam Okoro"],
      durationMinutes: 30,
      candidateWindows: ["Mon daytime"],
    },
    emailThread: [
      {
        id: "m1",
        from: "Sam Okoro <sam.okoro@bramwellvance.example>",
        to: "Dana Whitfield <dana.whitfield@northwind.example>",
        subject: "Intro call sometime Monday?",
        sentAt: "2026-08-13T08:30:00-07:00",
        body: "Hi Dana, following up from the conference - open to a 30 min intro call Monday daytime?",
      },
    ],
    webexAgent: {
      kind: "webex",
      personName: "Dana Whitfield",
      orgId: HOME_ORG_ID,
      priorityTier: 1,
      notice: { minNoticeHours: 4 },
      calendar: [
        { day: "Mon", start: "10:00", end: "11:00", status: "free", label: "" },
        { day: "Mon", start: "11:00", end: "15:00", status: "busy", label: "Sprint planning" },
      ],
    },
    copilotAgent: {
      kind: "copilot",
      personName: "Sam Okoro",
      orgId: "bramwell",
      priorityTier: 1,
      notice: { minNoticeHours: 24 },
      calendar: [
        { day: "Mon", start: "10:00", end: "11:00", status: "free", label: "" },
        { day: "Mon", start: "11:00", end: "15:00", status: "focus-time", label: "Focus time" },
      ],
    },
  },

  // ---------------------------------------------------------------------
  // 4. Urgent, same-day ask that collides with a notice-period policy - CSP
  // mode gets all the way to joint negotiation and still has to escalate,
  // proving the demo doesn't force a 100% success rate even with the full
  // protocol.
  // ---------------------------------------------------------------------
  {
    id: "orbit-urgent-outage",
    title: "Urgent outage sync - Northwind x Orbit Logistics",
    homeOrgId: HOME_ORG_ID,
    partnerOrgId: "orbit",
    statedWindows: [{ day: "Mon", start: "09:00", end: "17:00", label: "today" }],
    baselineAssumedDurationMinutes: 30,
    simulatedNowOffsetHours: 2,
    intent: {
      goal: "Sev-1 outage coordination",
      urgency: "high",
      requiredAttendees: ["Dana Whitfield", "Jordan Reyes"],
      durationMinutes: 30,
      candidateWindows: ["today"],
    },
    emailThread: [
      {
        id: "m1",
        from: "Jordan Reyes <jordan.reyes@orbitlogistics.example>",
        to: "Dana Whitfield <dana.whitfield@northwind.example>",
        subject: "URGENT: need a sync on the outage today",
        sentAt: "2026-08-24T07:15:00-07:00",
        body: "Dana - we need a same-day sync on the sev-1 outage. Any time today works, the sooner the better.",
      },
    ],
    webexAgent: {
      kind: "webex",
      personName: "Dana Whitfield",
      orgId: HOME_ORG_ID,
      priorityTier: 5,
      notice: { minNoticeHours: 1 },
      calendar: [
        { day: "Mon", start: "09:00", end: "12:00", status: "free", label: "" },
        { day: "Mon", start: "12:00", end: "17:00", status: "tentative-hold", label: "Tentative: offsite" },
      ],
    },
    copilotAgent: {
      kind: "copilot",
      personName: "Jordan Reyes",
      orgId: "orbit",
      priorityTier: 5,
      // Orbit's policy requires 24h notice for anything on a partner's calendar,
      // even Sev-1s - a real (if painful) corporate-policy conflict.
      notice: { minNoticeHours: 24 },
      calendar: [
        { day: "Mon", start: "09:00", end: "17:00", status: "free", label: "" },
      ],
    },
  },
];

export function getScenario(id: string): NegotiationScenario | undefined {
  return scenarios.find((s) => s.id === id);
}
