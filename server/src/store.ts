import { DEFAULT_POLICY, orgs } from "./data/orgs";
import { getScenario, scenarios } from "./data/scenarios";
import { runNegotiation } from "./engine";
import { logSummaryLine, logTranscript } from "./logger";
import { DataSharingPolicy, NegotiationSession, Org } from "./types/domain";

let policy: DataSharingPolicy = { ...DEFAULT_POLICY };
const negotiations: NegotiationSession[] = [];
let nextId = 1;

export function getPolicy(): DataSharingPolicy {
  return policy;
}

export function updatePolicy(patch: Partial<DataSharingPolicy>): DataSharingPolicy {
  policy = { ...policy, ...patch };
  return policy;
}

export function listOrgs(): Org[] {
  return orgs;
}

export function setOrgTrust(orgId: string, trustStatus: Org["trustStatus"]): Org | undefined {
  const org = orgs.find((o) => o.id === orgId);
  if (!org) return undefined;
  org.trustStatus = trustStatus;
  return org;
}

function addNegotiation(session: NegotiationSession, backdateDaysAgo?: number): NegotiationSession {
  const id = `neg-${nextId++}`;
  session.id = id;
  if (backdateDaysAgo !== undefined) {
    const started = new Date(Date.now() - backdateDaysAgo * 24 * 3600_000);
    const duration = session.durationMs ?? 60_000;
    session.startedAt = started.toISOString();
    session.endedAt = new Date(started.getTime() + duration).toISOString();
  }
  negotiations.unshift(session);
  return session;
}

export function listNegotiations(): NegotiationSession[] {
  return [...negotiations].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

export function getNegotiation(id: string): NegotiationSession | undefined {
  return negotiations.find((n) => n.id === id);
}

/** Runs a fresh negotiation (used by the live demo UI) and records it in the audit log. */
export async function negotiateLive(scenarioId: string, mode: NegotiationSession["mode"]): Promise<NegotiationSession> {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`);
  const session = await runNegotiation(scenario, mode, policy);
  const recorded = addNegotiation(session);
  logTranscript(recorded);
  return recorded;
}

export function acceptNegotiation(id: string): NegotiationSession {
  const session = getNegotiation(id);
  if (!session) throw new Error(`Unknown negotiation: ${id}`);
  if (session.status !== "agreed" || !session.proposedSlot) {
    throw new Error("Only an agreed with-IoC negotiation can be accepted");
  }
  if (!session.writeBack) {
    session.writeBack = {
      webexEventId: `webex-evt-${id}`,
      copilotEventId: `copilot-evt-${id}`,
      joinLink: `https://web.example-webex.com/join/${id}`,
    };
  }
  return session;
}

export interface Metrics {
  trustedOrgCount: number;
  negotiationsThisPeriod: number;
  avgTimeToResolutionSeconds: number;
  percentEscalated: number;
}

export function computeMetrics(): Metrics {
  const all = negotiations;
  const trustedOrgCount = orgs.filter((o) => o.trustStatus === "trusted").length;
  const resolved = all.filter((n) => n.durationMs !== undefined);
  const avgMs = resolved.length ? resolved.reduce((sum, n) => sum + (n.durationMs ?? 0), 0) / resolved.length : 0;
  const escalatedCount = all.filter((n) => n.status === "escalated").length;
  return {
    trustedOrgCount,
    negotiationsThisPeriod: all.length,
    avgTimeToResolutionSeconds: Math.round(avgMs / 100) / 10,
    percentEscalated: all.length ? Math.round((escalatedCount / all.length) * 1000) / 10 : 0,
  };
}

/** Seeds the audit log with historical negotiations so the admin view isn't empty on first run. */
export async function seedPastNegotiations(): Promise<void> {
  // Spread across the last ~3 weeks, oldest first, mixing modes/orgs/outcomes.
  const plan: Array<{ scenarioId: string; mode: NegotiationSession["mode"]; daysAgo: number }> = [
    { scenarioId: "solace-quarterly-review", mode: "without-ioc", daysAgo: 19 },
    { scenarioId: "solace-quarterly-review", mode: "with-ioc", daysAgo: 18 },
    { scenarioId: "bramwell-vendor-intro", mode: "without-ioc", daysAgo: 14 },
    { scenarioId: "bramwell-vendor-intro", mode: "with-ioc", daysAgo: 13 },
    { scenarioId: "orbit-urgent-outage", mode: "without-ioc", daysAgo: 9 },
    { scenarioId: "orbit-urgent-outage", mode: "with-ioc", daysAgo: 9 },
    { scenarioId: "fenwick-integration-sync", mode: "without-ioc", daysAgo: 5 },
    { scenarioId: "fenwick-integration-sync", mode: "with-ioc", daysAgo: 4 },
    { scenarioId: "cisco-internal-standup-prep", mode: "without-ioc", daysAgo: 3 },
    { scenarioId: "cisco-internal-standup-prep", mode: "with-ioc", daysAgo: 3 },
    { scenarioId: "outshift-microsoft-api-review", mode: "without-ioc", daysAgo: 2 },
    { scenarioId: "outshift-microsoft-api-review", mode: "with-ioc", daysAgo: 1 },
  ];
  console.log("Seeding historical negotiations...");
  for (const entry of plan) {
    const scenario = getScenario(entry.scenarioId);
    if (!scenario) continue;
    const session = await runNegotiation(scenario, entry.mode, policy);
    logSummaryLine(session);
    addNegotiation(session, entry.daysAgo);
  }
}

export function allScenarios() {
  return scenarios;
}
