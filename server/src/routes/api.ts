import { Router } from "express";
import { resolveOrgName } from "../data/orgs";
import { getScenario, scenarios } from "../data/scenarios";
import { runNegotiation } from "../engine";
import { buildCustomScenario } from "../engine/customScenario";
import {
  acceptNegotiation,
  computeMetrics,
  getNegotiation,
  getPolicy,
  listNegotiations,
  listOrgs,
  negotiateLive,
  setOrgTrust,
  updatePolicy,
} from "../store";
import { NegotiationMode, Org } from "../types/domain";

export const api = Router();

// ---- Orgs (admin: connected organizations) ----
api.get("/orgs", (_req, res) => {
  res.json(listOrgs());
});

api.patch("/orgs/:id/trust", (req, res) => {
  const { trustStatus } = req.body as { trustStatus?: Org["trustStatus"] };
  if (trustStatus !== "trusted" && trustStatus !== "pending-review") {
    return res.status(400).json({ error: "trustStatus must be 'trusted' or 'pending-review'" });
  }
  const org = setOrgTrust(req.params.id, trustStatus);
  if (!org) return res.status(404).json({ error: "org not found" });
  res.json(org);
});

// ---- Data sharing policy (admin) ----
api.get("/policy", (_req, res) => {
  res.json(getPolicy());
});

api.patch("/policy", (req, res) => {
  res.json(updatePolicy(req.body ?? {}));
});

// ---- Scenarios (end-user email thread + negotiate) ----
function withOrgNames<T extends { homeOrgId: string; partnerOrgId: string }>(s: T) {
  return { ...s, homeOrgName: resolveOrgName(s.homeOrgId), partnerOrgName: resolveOrgName(s.partnerOrgId) };
}

api.get("/scenarios", (_req, res) => {
  res.json(
    scenarios.map((s) =>
      withOrgNames({
        id: s.id,
        title: s.title,
        userStory: s.userStory,
        homeOrgId: s.homeOrgId,
        partnerOrgId: s.partnerOrgId,
        isIntraOrg: s.isIntraOrg ?? false,
        emailThread: s.emailThread,
        statedWindows: s.statedWindows,
      })
    )
  );
});

api.get("/scenarios/:id", (req, res) => {
  const s = getScenario(req.params.id);
  if (!s) return res.status(404).json({ error: "scenario not found" });
  res.json(withOrgNames(s));
});

// ---- Negotiations (live demo + audit log) ----
api.post("/negotiate", async (req, res) => {
  const { scenarioId, mode } = req.body as { scenarioId?: string; mode?: NegotiationMode };
  if (!scenarioId || (mode !== "with-ioc" && mode !== "without-ioc")) {
    return res.status(400).json({ error: "scenarioId and mode ('with-ioc' | 'without-ioc') are required" });
  }
  try {
    const session = await negotiateLive(scenarioId, mode);
    res.json(session);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

api.get("/negotiations", (_req, res) => {
  res.json(listNegotiations());
});

api.get("/negotiations/:id", (req, res) => {
  const session = getNegotiation(req.params.id);
  if (!session) return res.status(404).json({ error: "negotiation not found" });
  res.json(session);
});

api.post("/negotiations/:id/accept", (req, res) => {
  try {
    res.json(acceptNegotiation(req.params.id));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ---- Comparison view: run both modes fresh, without polluting the audit log ----
api.get("/compare/:scenarioId", async (req, res) => {
  const scenario = getScenario(req.params.scenarioId);
  if (!scenario) return res.status(404).json({ error: "scenario not found" });
  const policy = getPolicy();
  const [withoutIoc, withIoc] = await Promise.all([
    runNegotiation(scenario, "without-ioc", policy),
    runNegotiation(scenario, "with-ioc", policy),
  ]);
  withoutIoc.id = `preview-${scenario.id}-without-ioc`;
  withIoc.id = `preview-${scenario.id}-with-ioc`;
  res.json({ withoutIoc, withIoc });
});

// ---- Conflict Lab: build and run an ad hoc scenario against the real engine ----
api.post("/compare/custom", async (req, res) => {
  try {
    const scenario = buildCustomScenario(req.body);
    const policy = getPolicy();
    const [withoutIoc, withIoc] = await Promise.all([
      runNegotiation(scenario, "without-ioc", policy),
      runNegotiation(scenario, "with-ioc", policy),
    ]);
    withoutIoc.id = "custom-without-ioc";
    withIoc.id = "custom-with-ioc";
    res.json({ withoutIoc, withIoc, scenario: withOrgNames(scenario) });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ---- Metrics (admin summary) ----
api.get("/metrics", (_req, res) => {
  res.json(computeMetrics());
});
