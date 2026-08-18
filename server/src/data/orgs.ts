import { DataSharingPolicy, Org } from "../types/domain";

// Northwind's default outbound policy: what's allowed to cross the org
// boundary for any trusted partner negotiation. Editable in the admin view.
export const DEFAULT_POLICY: DataSharingPolicy = {
  freeBusy: true,
  priorityTier: true,
  meetingTitlesAndAttendees: false,
  humanApprovalBeforeSend: true,
};

// Northwind Corp is the "home" org running this demo - every Northwind
// employee's assistant is the WebexAgent. It isn't itself a "connected
// organization" in the admin view; the orgs below are the external partners
// Northwind's agents negotiate with.
export const HOME_ORG_ID = "northwind";
export const HOME_ORG_NAME = "Northwind Corp";

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
];

export function getOrg(id: string): Org | undefined {
  return orgs.find((o) => o.id === id);
}
