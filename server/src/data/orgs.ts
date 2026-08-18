import { DataSharingPolicy, Org } from "../types/domain";

// Northwind's default outbound policy: what's allowed to cross the org
// boundary for any trusted partner negotiation. Editable in the admin view.
export const DEFAULT_POLICY: DataSharingPolicy = {
  freeBusy: true,
  priorityTier: true,
  meetingTitlesAndAttendees: false,
  humanApprovalBeforeSend: true,
};

// Northwind Corp is the default "home" org for most seeded scenarios - every
// Northwind employee's assistant is the WebexAgent. Home orgs aren't
// themselves "connected organizations" in the admin view (they're "us", not
// a partner to manage trust for) - the `orgs` list below is the external
// partners a home org's agent negotiates with. A scenario can use a
// different home org (e.g. "Outshift by Cisco") by pointing homeOrgId at
// an entry in HOME_ORGS instead.
export const HOME_ORG_ID = "northwind";
export const HOME_ORG_NAME = "Northwind Corp";

export const HOME_ORGS: Record<string, { id: string; name: string }> = {
  northwind: { id: "northwind", name: "Northwind Corp" },
  "cisco-outshift": { id: "cisco-outshift", name: "Outshift by Cisco" },
};

export function getHomeOrgName(id: string): string {
  return HOME_ORGS[id]?.name ?? id;
}

export const orgs: Org[] = [
  {
    id: "fenwick",
    name: "Fenwick Partners",
    agentKind: "copilot",
    trustStatus: "trusted",
  },
  {
    id: "solace",
    name: "Solace Health",
    agentKind: "copilot",
    trustStatus: "trusted",
  },
  {
    id: "orbit",
    name: "Orbit Logistics",
    agentKind: "copilot",
    trustStatus: "trusted",
  },
  {
    id: "bramwell",
    name: "Bramwell & Vance",
    agentKind: "copilot",
    trustStatus: "pending-review",
  },
  {
    id: "microsoft",
    name: "Microsoft",
    agentKind: "copilot",
    trustStatus: "trusted",
  },
];

export function getOrg(id: string): Org | undefined {
  return orgs.find((o) => o.id === id);
}

/** Resolves a display name for any org id - a partner org, or a home org. */
export function resolveOrgName(id: string): string {
  return getOrg(id)?.name ?? getHomeOrgName(id);
}
