import { Router } from "express";
import { resolveOrgName } from "../data/orgs";
import { getScenario, scenarios } from "../data/scenarios";
import { runNegotiation } from "../engine";
import { runDriftDemo } from "../engine/cognitionEngine";
import { buildCustomScenario } from "../engine/customScenario";
import { runEmergentConflictDemo } from "../engine/emergentConflict";
import { runLoopThenMediateDemo } from "../engine/negmasMediator";
import { buildProtocolFrames } from "../engine/protocol";
import { logTranscript } from "../logger";
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
  logTranscript(withoutIoc);
  logTranscript(withIoc);
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
    logTranscript(withoutIoc);
    logTranscript(withIoc);
    res.json({ withoutIoc, withIoc, scenario: withOrgNames(scenario) });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ---- Protocol demos: A2A trace, drift/cognition, endless-loop/mediation, T+1 emergent conflict ----
// These are all Webex <-> Copilot only for now, so intra-org scenarios are rejected here.
function requireCrossOrgScenario(id: string) {
  const scenario = getScenario(id);
  if (!scenario) {
    const err: Error & { status?: number } = new Error("scenario not found");
    err.status = 404;
    throw err;
  }
  if (scenario.isIntraOrg) {
    const err: Error & { status?: number } = new Error(
      "This demo currently only supports Webex <-> Copilot (cross-company) scenarios, not intra-org ones."
    );
    err.status = 400;
    throw err;
  }
  return scenario;
}

function handleDemoError(res: import("express").Response, err: unknown) {
  const status = (err as { status?: number }).status ?? 400;
  res.status(status).json({ error: (err as Error).message });
}

api.get("/demo/live/:scenarioId", async (req, res) => {
  try {
    const scenario = requireCrossOrgScenario(req.params.scenarioId);
    const mode = req.query.mode === "without-ioc" ? "without-ioc" : "with-ioc";
    const session = await runNegotiation(scenario, mode, getPolicy());
    logTranscript(session);
    res.json({ session });
  } catch (err) {
    handleDemoError(res, err);
  }
});

api.get("/demo/drift/:scenarioId", async (req, res) => {
  try {
    const scenario = requireCrossOrgScenario(req.params.scenarioId);
    const session = await runDriftDemo(scenario, getPolicy());
    session.protocolFrames = buildProtocolFrames(session);
    logTranscript(session);
    res.json({ session });
  } catch (err) {
    handleDemoError(res, err);
  }
});

api.get("/demo/loop/:scenarioId", async (req, res) => {
  try {
    const scenario = requireCrossOrgScenario(req.params.scenarioId);
    const session = await runLoopThenMediateDemo(scenario, getPolicy());
    session.protocolFrames = buildProtocolFrames(session);
    logTranscript(session);
    res.json({ session });
  } catch (err) {
    handleDemoError(res, err);
  }
});

api.get("/demo/emergent/:scenarioId", async (req, res) => {
  try {
    const scenario = requireCrossOrgScenario(req.params.scenarioId);
    const result = await runEmergentConflictDemo(scenario, getPolicy());
    logTranscript(result.t0);
    if (result.t1) logTranscript(result.t1);
    res.json(result);
  } catch (err) {
    handleDemoError(res, err);
  }
});

// ---- Metrics (admin summary) ----
api.get("/metrics", (_req, res) => {
  res.json(computeMetrics());
});
