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
    userStory:
      "As Dana at Northwind, I need a 30-minute sync with our integration partner before sprint planning - " +
      "without a week of reply-all across two companies' inboxes.",
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
    homeAgent: {
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
    partnerAgent: {
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
    userStory:
      "As Alex at Northwind, I want our routine quarterly check-in with Solace to book itself, since neither " +
      "side has anything urgent riding on it - CSP shouldn't need a five-stage production for the easy cases either.",
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
    homeAgent: {
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
    partnerAgent: {
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
    userStory:
      "As Dana, I met Sam at a conference and want a casual intro call - but our admin hasn't cleared Bramwell & " +
      "Vance as a trusted org yet, and I'd rather CSP catch that than have my agent quietly hand over my calendar anyway.",
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
    homeAgent: {
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
    partnerAgent: {
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
    userStory:
      "As Dana, I have a sev-1 outage and need Orbit on a call now - but their org's own notice-period policy " +
      "won't bend even for this, so I need to know that immediately instead of watching my agent spin.",
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
    homeAgent: {
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
    partnerAgent: {
      kind: "copilot",
      personName: "Jordan Reyes",
      orgId: "orbit",
      priorityTier: 5,
      // Orbit's policy requires 24h notice for anything on a partner's calendar,
      // even Sev-1s - a real (if painful) corporate-policy conflict.
      notice: { minNoticeHours: 24 },
      calendar: [{ day: "Mon", start: "09:00", end: "17:00", status: "free", label: "" }],
    },
  },

  // ---------------------------------------------------------------------
  // 5. CROSS-COMPANY: Outshift by Cisco x Microsoft. Same underlying
  // contrast as the flagship Fenwick scenario (genuine ontology mismatch +
  // naive duration default vs. correctly-extracted intent), reskinned onto
  // the real pairing this demo was built to pitch: Cisco's Webex Scheduler
  // side negotiating with a partner running Microsoft Copilot.
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
  // 6. INTRA-COMPANY: two Cisco employees, different business units, both
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
