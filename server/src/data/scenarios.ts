import { NegotiationScenario } from "../types/domain";

// All scenarios play out "next week" relative to WEEK_START_DATE in calendarUtil.ts
// (a Monday). Mon=day0 ... Fri=day4.

export const scenarios: NegotiationScenario[] = [
  // ---------------------------------------------------------------------
  // 1. FLAGSHIP SCENARIO - Cross-company, different vendors. Designed so the
  // baseline genuinely stalls on an ontology mismatch and a naive duration
  // default, then escalates; CSP mode resolves it by grounding vocab,
  // extracting the real (shorter) duration, and reasoning over both
  // calendars in one pass. This is the real pairing this demo is built to
  // pitch: Cisco's Webex Scheduler side negotiating with a partner running
  // Microsoft Copilot.
  // ---------------------------------------------------------------------
  {
    id: "outshift-microsoft-api-review",
    title: "API contract review - Outshift by Cisco x Microsoft",
    userStory:
      "As Riya, an engineering lead at Outshift (Cisco's incubation studio), I need to lock in a 30-minute API-" +
      "contract review with Microsoft's Copilot integration team before their release cut - without a week of " +
      "reply-all spanning two companies' inboxes and two different scheduling assistants.",
    homeOrgId: "cisco-outshift",
    partnerOrgId: "microsoft",
    statedWindows: [
      { day: "Tue", start: "14:00", end: "17:00", label: "Tue afternoon" },
      { day: "Thu", start: "09:00", end: "12:00", label: "Thu morning" },
    ],
    baselineAssumedDurationMinutes: 60,
    intent: {
      goal: "Review the API contract before the release cut",
      urgency: "medium",
      requiredAttendees: ["Riya Patel", "Grace Liu", "Devon Okafor"],
      durationMinutes: 30,
      candidateWindows: ["Tue afternoon", "Thu morning"],
    },
    emailThread: [
      {
        id: "m1",
        from: "Riya Patel <riya.patel@outshift.cisco.example>",
        to: "Grace Liu <grace.liu@microsoft.example>",
        subject: "API contract review before your release cut?",
        sentAt: "2026-08-17T08:40:00-07:00",
        body:
          "Hi Grace,\n\nCan we grab a quick review of the API contract before your team's release cut? " +
          "30 min should cover it. I'm free Tue afternoon or Thu morning next week - happy to work around your calendar.\n\nRiya",
      },
      {
        id: "m2",
        from: "Grace Liu <grace.liu@microsoft.example>",
        to: "Riya Patel <riya.patel@outshift.cisco.example>",
        subject: "RE: API contract review before your release cut?",
        sentAt: "2026-08-17T11:05:00-07:00",
        body:
          "Sounds good - looping in Devon from your side too since he's driving the auth changes. " +
          "I'll let my Copilot assistant work out the exact time with yours.\n\nGrace",
      },
    ],
    homeAgent: {
      kind: "webex",
      personName: "Riya Patel",
      orgId: "cisco-outshift",
      priorityTier: 3,
      notice: { minNoticeHours: 4 },
      calendar: [
        { day: "Tue", start: "14:00", end: "15:00", status: "tentative-hold", label: "Tentative: Roadmap review" },
        { day: "Tue", start: "15:00", end: "16:00", status: "free", label: "" },
        { day: "Tue", start: "16:00", end: "17:00", status: "busy", label: "1:1 with manager" },
        { day: "Thu", start: "09:00", end: "10:30", status: "busy", label: "Leadership sync" },
        { day: "Thu", start: "10:30", end: "11:00", status: "free", label: "" },
        { day: "Thu", start: "11:00", end: "12:00", status: "tentative-hold", label: "Tentative: Backup planning" },
      ],
    },
    partnerAgent: {
      kind: "copilot",
      personName: "Grace Liu",
      orgId: "microsoft",
      priorityTier: 3,
      notice: { minNoticeHours: 24 },
      calendar: [
        { day: "Tue", start: "14:00", end: "16:00", status: "focus-time", label: "Focus time: architecture doc" },
        { day: "Tue", start: "16:00", end: "17:00", status: "free", label: "" },
        { day: "Thu", start: "09:00", end: "09:30", status: "free", label: "" },
        { day: "Thu", start: "09:30", end: "11:00", status: "busy", label: "Customer briefing" },
        { day: "Thu", start: "11:00", end: "12:00", status: "focus-time", label: "Focus time: prep for customer call" },
      ],
    },
  },

  // ---------------------------------------------------------------------
  // 2. INTRA-COMPANY: two Cisco employees, different business units, both
  // on Webex - no vendor to blame, no ontology mismatch possible. This is
  // the control case: it isolates how much of CSP's value comes purely from
  // shared intent (the real duration) and joint reasoning across both
  // calendars, with vocabulary translation entirely out of the picture.
  // ---------------------------------------------------------------------
  {
    id: "cisco-internal-standup-prep",
    title: "Pre-exec-review sync - Outshift x Cisco Security (internal)",
    userStory:
      "As Priya at Outshift, I need 30 minutes with Sam from Cisco Security to align before an exec review. " +
      "Same company, same Webex tooling - no vendor mismatch to blame this time. If CSP still finds a slot that a " +
      "naive back-and-forth misses, that's proof the win isn't only about translating vocab.",
    homeOrgId: "cisco-outshift",
    partnerOrgId: "cisco-outshift",
    isIntraOrg: true,
    statedWindows: [
      { day: "Wed", start: "09:00", end: "12:00", label: "Wed morning" },
      { day: "Wed", start: "13:00", end: "17:00", label: "Wed afternoon" },
    ],
    baselineAssumedDurationMinutes: 60,
    intent: {
      goal: "Align before the exec review",
      urgency: "medium",
      requiredAttendees: ["Priya Nair", "Sam Reyes"],
      durationMinutes: 30,
      candidateWindows: ["Wed morning", "Wed afternoon"],
    },
    emailThread: [
      {
        id: "m1",
        from: "Priya Nair <priya.nair@outshift.cisco.example>",
        to: "Sam Reyes <sam.reyes@security.cisco.example>",
        subject: "Quick align before the exec review?",
        sentAt: "2026-08-18T08:05:00-07:00",
        body:
          "Hey Sam, can we grab a quick 30 min before the exec review to get our story straight? " +
          "I'm slammed Wednesday but there's got to be something - morning or afternoon both work in principle.\n\nPriya",
      },
      {
        id: "m2",
        from: "Sam Reyes <sam.reyes@security.cisco.example>",
        to: "Priya Nair <priya.nair@outshift.cisco.example>",
        subject: "RE: Quick align before the exec review?",
        sentAt: "2026-08-18T08:20:00-07:00",
        body: "Same here, my Wednesday is a mess too. Let's just let the scheduling assistants sort it out.",
      },
    ],
    homeAgent: {
      kind: "webex",
      personName: "Priya Nair",
      orgId: "cisco-outshift",
      priorityTier: 3,
      notice: { minNoticeHours: 2 },
      calendar: [
        { day: "Wed", start: "09:00", end: "10:00", status: "busy", label: "Sprint standup" },
        { day: "Wed", start: "10:00", end: "11:00", status: "tentative-hold", label: "Tentative: Roadmap doc block" },
        { day: "Wed", start: "11:00", end: "12:00", status: "free", label: "" },
        { day: "Wed", start: "13:00", end: "14:00", status: "free", label: "" },
        { day: "Wed", start: "14:00", end: "15:30", status: "busy", label: "Exec review prep" },
        { day: "Wed", start: "15:30", end: "17:00", status: "tentative-hold", label: "Tentative: Backlog grooming" },
      ],
    },
    partnerAgent: {
      kind: "webex",
      personName: "Sam Reyes",
      orgId: "cisco-outshift",
      priorityTier: 3,
      notice: { minNoticeHours: 2 },
      calendar: [
        { day: "Wed", start: "09:00", end: "10:30", status: "tentative-hold", label: "Tentative: Threat review" },
        { day: "Wed", start: "10:30", end: "11:30", status: "busy", label: "Incident retro" },
        { day: "Wed", start: "11:30", end: "12:00", status: "free", label: "" },
        { day: "Wed", start: "13:00", end: "13:30", status: "free", label: "" },
        { day: "Wed", start: "13:30", end: "15:00", status: "busy", label: "Customer escalation call" },
        { day: "Wed", start: "15:00", end: "17:00", status: "tentative-hold", label: "Tentative: Security office hours" },
      ],
    },
  },
];

export function getScenario(id: string): NegotiationScenario | undefined {
  return scenarios.find((s) => s.id === id);
}
