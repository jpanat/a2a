import { DataSharingPolicy, Org } from "../types/domain";

// Outshift by Cisco's default outbound policy: what's allowed to cross the
// org boundary for any trusted partner negotiation. Editable in the admin view.
export const DEFAULT_POLICY: DataSharingPolicy = {
  freeBusy: true,
  priorityTier: true,
  meetingTitlesAndAttendees: false,
  humanApprovalBeforeSend: true,
};

// Home orgs aren't themselves "connected organizations" in the admin view
// (they're "us", not a partner to manage trust for) - the `orgs` list below
// is the external partners a home org's agent negotiates with.
export const HOME_ORGS: Record<string, { id: string; name: string }> = {
  "cisco-outshift": { id: "cisco-outshift", name: "Outshift by Cisco" },
};

export function getHomeOrgName(id: string): string {
  return HOME_ORGS[id]?.name ?? id;
}

export const orgs: Org[] = [
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
