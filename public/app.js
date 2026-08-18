// Plain vanilla JS SPA - no build step. Hash-routed between three views.
const app = document.getElementById("app");
const toastEl = document.getElementById("toast");

// ---------------- API helpers ----------------
async function apiGet(path) {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error((await res.json()).error || res.statusText);
  return res.json();
}
async function apiPost(path, body) {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error((await res.json()).error || res.statusText);
  return res.json();
}
async function apiPatch(path, body) {
  const res = await fetch(`/api${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error((await res.json()).error || res.statusText);
  return res.json();
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  setTimeout(() => toastEl.classList.add("hidden"), 2600);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtDuration(ms) {
  if (ms == null) return "-";
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${(s / 60).toFixed(1)}m`;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ---------------- Topology diagram: where each agent actually lives ----------------
function agentKindShort(kind) {
  return kind === "webex" ? "Webex" : "Copilot";
}

function svgPill(x, y, w, h, fill, stroke) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />`;
}

function renderTopologyDiagram(scenario) {
  const home = scenario.homeAgent;
  const partner = scenario.partnerAgent;
  const homeColor = home.kind === "webex" ? "var(--webex)" : "var(--copilot)";
  const partnerColor = partner.kind === "webex" ? "var(--webex)" : "var(--copilot)";

  if (scenario.isIntraOrg) {
    return `
      <svg viewBox="0 0 640 190" class="topology-svg" role="img" aria-label="Both agents hosted inside the same org tenant">
        <rect x="30" y="20" width="580" height="150" rx="16" fill="none" stroke="var(--border)" stroke-width="2" stroke-dasharray="6 5" />
        <text x="50" y="46" class="topo-tenant-label">${esc(scenario.homeOrgName)} - single tenant</text>

        ${svgPill(90, 75, 190, 70, "#eef1fb", homeColor)}
        <text x="185" y="103" text-anchor="middle" class="topo-agent-name">${esc(home.personName)}</text>
        <text x="185" y="123" text-anchor="middle" class="topo-agent-kind">${esc(agentKindShort(home.kind))} agent</text>

        ${svgPill(360, 75, 190, 70, "#eef1fb", partnerColor)}
        <text x="455" y="103" text-anchor="middle" class="topo-agent-name">${esc(partner.personName)}</text>
        <text x="455" y="123" text-anchor="middle" class="topo-agent-kind">${esc(agentKindShort(partner.kind))} agent</text>

        <line x1="280" y1="110" x2="360" y2="110" stroke="var(--good)" stroke-width="2.5" />
        <text x="320" y="150" text-anchor="middle" class="topo-link-label">direct reasoning -</text>
        <text x="320" y="164" text-anchor="middle" class="topo-link-label">no trust boundary to cross</text>
      </svg>`;
  }

  return `
    <svg viewBox="0 0 640 190" class="topology-svg" role="img" aria-label="Each agent hosted inside its own org tenant">
      <rect x="10" y="20" width="270" height="150" rx="16" fill="none" stroke="var(--border)" stroke-width="2" stroke-dasharray="6 5" />
      <text x="28" y="46" class="topo-tenant-label">${esc(scenario.homeOrgName)}</text>
      ${svgPill(50, 70, 190, 70, "#eef1fb", homeColor)}
      <text x="145" y="98" text-anchor="middle" class="topo-agent-name">${esc(home.personName)}</text>
      <text x="145" y="118" text-anchor="middle" class="topo-agent-kind">${esc(agentKindShort(home.kind))} agent</text>

      <rect x="360" y="20" width="270" height="150" rx="16" fill="none" stroke="var(--border)" stroke-width="2" stroke-dasharray="6 5" />
      <text x="378" y="46" class="topo-tenant-label">${esc(scenario.partnerOrgName)}</text>
      ${svgPill(400, 70, 190, 70, "#eef1fb", partnerColor)}
      <text x="495" y="98" text-anchor="middle" class="topo-agent-name">${esc(partner.personName)}</text>
      <text x="495" y="118" text-anchor="middle" class="topo-agent-kind">${esc(agentKindShort(partner.kind))} agent</text>

      <line x1="280" y1="105" x2="360" y2="105" stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="5 4" />
      <text x="320" y="146" text-anchor="middle" class="topo-link-label">CSP trust</text>
      <text x="320" y="160" text-anchor="middle" class="topo-link-label">channel</text>
    </svg>`;
}

// ---------------- KPI deltas between the two modes ----------------
function computeKpis(withoutIoc, withIoc) {
  const roundsDelta = withoutIoc.rounds - withIoc.rounds;
  const timePctSaved =
    withoutIoc.durationMs && withIoc.durationMs
      ? Math.round((1 - withIoc.durationMs / withoutIoc.durationMs) * 100)
      : null;

  let headline;
  let tone;
  if (withoutIoc.status === "escalated" && withIoc.status === "agreed") {
    headline = "Escalation avoided - CSP resolved what the baseline couldn't";
    tone = "good";
  } else if (withoutIoc.status === "agreed" && withIoc.status === "escalated") {
    headline = "CSP correctly stopped a booking the baseline would have made blindly";
    tone = "warn";
  } else if (withoutIoc.status === "agreed" && withIoc.status === "agreed") {
    headline =
      roundsDelta > 0
        ? `Same outcome, ${roundsDelta} fewer round-trip${roundsDelta === 1 ? "" : "s"}`
        : "Same outcome, reached in a single joint pass";
    tone = "good";
  } else {
    headline = "Escalated in both modes - a real human call either way";
    tone = "neutral";
  }
  return { roundsDelta, timePctSaved, headline, tone };
}

function renderKpiRow(withoutIoc, withIoc) {
  const k = computeKpis(withoutIoc, withIoc);
  return `
    <div class="kpi-row kpi-${k.tone}">
      <div class="kpi-headline">${esc(k.headline)}</div>
      <div class="kpi-tiles">
        <div class="kpi-tile"><div class="val">${withoutIoc.rounds} → ${withIoc.rounds}</div><div class="lbl">Negotiation rounds</div></div>
        <div class="kpi-tile"><div class="val">${k.timePctSaved != null ? `${k.timePctSaved}%` : "-"}</div><div class="lbl">Time saved</div></div>
        <div class="kpi-tile"><div class="val">${withoutIoc.transcript.length} → ${withIoc.transcript.length}</div><div class="lbl">Messages exchanged</div></div>
      </div>
    </div>`;
}

const STAGE_LABELS = {
  discovery: "Discovery",
  "ontology-grounding": "Ontology grounding",
  "intent-exchange": "Intent exchange",
  "joint-negotiation": "Joint negotiation",
  resolution: "Resolution",
  "baseline-exchange": "Baseline exchange",
  escalation: "Escalation",
};

function renderTranscript(transcript) {
  return `<div class="transcript">${transcript
    .map(
      (m) => `
      <div class="tmsg from-${esc(m.from)} kind-${esc(m.kind)}">
        <div class="stage-tag">${esc(STAGE_LABELS[m.stage] || m.stage)}</div>
        <div>${esc(m.text)}</div>
      </div>`
    )
    .join("")}</div>`;
}

function outcomeBadge(session) {
  if (session.status === "agreed") return `<span class="badge good">Agreed</span>`;
  if (session.status === "escalated") return `<span class="badge warn">Escalated to humans</span>`;
  return `<span class="badge neutral">In progress</span>`;
}

// ---------------- Router ----------------
const routes = { "end-user": renderEndUser, compare: renderCompare, lab: renderLab, admin: renderAdmin };

function currentRoute() {
  const hash = location.hash.replace(/^#\//, "");
  return routes[hash] ? hash : "end-user";
}

async function router() {
  const route = currentRoute();
  document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("active", a.dataset.route === route));
  app.innerHTML = `<p class="loading">Loading...</p>`;
  try {
    await routes[route]();
  } catch (err) {
    app.innerHTML = `<div class="panel"><p><strong>Error:</strong> ${esc(err.message)}</p></div>`;
  }
}
window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", () => {
  if (!location.hash) location.hash = "#/end-user";
  router();
});

// ================= END-USER (INBOX) VIEW =================
let endUserState = { scenarios: [], activeId: null, negotiation: null, expanded: false };

async function renderEndUser() {
  if (!endUserState.scenarios.length) {
    endUserState.scenarios = await apiGet("/scenarios");
    endUserState.activeId = endUserState.scenarios[0].id;
  }
  const scenario = await apiGet(`/scenarios/${endUserState.activeId}`);

  app.innerHTML = `
    <h1>Inbox</h1>
    <p class="subtitle">Person A's mock Outlook inbox. Pick a thread, then either add a Webex meeting the old way, or let your agent negotiate with the partner's agent.</p>
    <div class="inbox-layout">
      <div class="panel thread-list">
        ${endUserState.scenarios
          .map(
            (s) => `
          <button class="thread-item ${s.id === endUserState.activeId ? "active" : ""}" data-thread="${s.id}">
            ${esc(s.emailThread[s.emailThread.length - 1].subject)}
            <span class="org">${esc(s.emailThread[0].from.split("<")[0].trim())}</span>
          </button>`
          )
          .join("")}
      </div>
      <div class="panel">
        <h2>${esc(scenario.title)}</h2>
        <div class="user-story">${esc(scenario.userStory)}</div>
        ${scenario.emailThread
          .map(
            (m) => `
          <div class="email-msg">
            <div class="meta"><strong>${esc(m.from.split("<")[0].trim())}</strong> to ${esc(m.to.split("<")[0].trim())} &middot; ${esc(
              new Date(m.sentAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
            )}</div>
            <div class="body">${esc(m.body)}</div>
          </div>`
          )
          .join("")}
        <div class="action-row">
          <button id="btn-webex">Add Webex meeting</button>
          <button id="btn-negotiate" class="primary">Negotiate with agent</button>
        </div>
        <div id="result-slot"></div>
      </div>
    </div>
  `;

  app.querySelectorAll("[data-thread]").forEach((btn) =>
    btn.addEventListener("click", () => {
      endUserState.activeId = btn.dataset.thread;
      endUserState.negotiation = null;
      endUserState.expanded = false;
      renderEndUser();
    })
  );

  document.getElementById("btn-webex").addEventListener("click", () => {
    toast("This would open the Webex Scheduler add-in in Outlook (simulated - no real integration in this demo).");
  });

  document.getElementById("btn-negotiate").addEventListener("click", async () => {
    const slot = document.getElementById("result-slot");
    slot.innerHTML = `<p class="loading">Negotiating with ${esc(scenario.emailThread[0].to.split("<")[0].trim())}'s agent...</p>`;
    try {
      const session = await apiPost("/negotiate", { scenarioId: scenario.id, mode: "with-ioc" });
      endUserState.negotiation = session;
      endUserState.expanded = false;
      renderNegotiationResult();
    } catch (err) {
      slot.innerHTML = `<p><strong>Error:</strong> ${esc(err.message)}</p>`;
    }
  });

  if (endUserState.negotiation && endUserState.negotiation.scenarioId === scenario.id) {
    renderNegotiationResult();
  }
}

function renderNegotiationResult() {
  const slotEl = document.getElementById("result-slot");
  const session = endUserState.negotiation;
  if (!slotEl || !session) return;

  if (session.status === "escalated") {
    const reason = session.transcript[session.transcript.length - 1].text;
    slotEl.innerHTML = `
      <div class="suggestion-card escalated">
        <div class="slot">⚠ Couldn't reach agreement automatically</div>
        <div class="why">${esc(reason)}</div>
        <button class="ghost" id="toggle-transcript">${endUserState.expanded ? "Hide" : "See"} negotiation details</button>
        ${endUserState.expanded ? renderTranscript(session.transcript) : ""}
      </div>`;
    document.getElementById("toggle-transcript").addEventListener("click", () => {
      endUserState.expanded = !endUserState.expanded;
      renderNegotiationResult();
    });
    return;
  }

  if (session.writeBack) {
    slotEl.innerHTML = `
      <div class="confirm-card">
        <div class="slot">✓ Meeting confirmed: ${esc(session.proposedSlot.dateLabel)}</div>
        <p>Calendar invite sent and added to both calendars.</p>
        <p><a class="join" href="${esc(session.writeBack.joinLink)}" target="_blank" rel="noopener">Join Webex meeting →</a></p>
        <button class="ghost" id="toggle-transcript">${endUserState.expanded ? "Hide" : "See"} negotiation details</button>
        ${endUserState.expanded ? renderTranscript(session.transcript) : ""}
      </div>`;
    document.getElementById("toggle-transcript").addEventListener("click", () => {
      endUserState.expanded = !endUserState.expanded;
      renderNegotiationResult();
    });
    return;
  }

  const resolutionMsg = [...session.transcript].reverse().find((m) => m.kind === "resolution");
  slotEl.innerHTML = `
    <div class="suggestion-card">
      <div class="slot">Proposed: ${esc(session.proposedSlot.dateLabel)}</div>
      <div class="why">${esc(resolutionMsg ? resolutionMsg.text : "")}</div>
      <div class="action-row">
        <button class="primary" id="btn-accept">Accept and send invite</button>
        <button class="ghost" id="toggle-transcript">${endUserState.expanded ? "Hide" : "See"} negotiation details</button>
      </div>
      ${endUserState.expanded ? renderTranscript(session.transcript) : ""}
    </div>`;

  document.getElementById("btn-accept").addEventListener("click", async () => {
    try {
      const updated = await apiPost(`/negotiations/${session.id}/accept`, {});
      endUserState.negotiation = updated;
      renderNegotiationResult();
    } catch (err) {
      toast(err.message);
    }
  });
  document.getElementById("toggle-transcript").addEventListener("click", () => {
    endUserState.expanded = !endUserState.expanded;
    renderNegotiationResult();
  });
}

// ================= COMPARISON VIEW =================
let compareState = { scenarios: [], activeId: null, data: null };

async function renderCompare() {
  if (!compareState.scenarios.length) {
    compareState.scenarios = await apiGet("/scenarios");
    compareState.activeId = compareState.scenarios[0].id;
  }
  if (!compareState.data || compareState.data.scenarioId !== compareState.activeId) {
    app.innerHTML = `<h1>Without IoC vs. With IoC</h1><p class="loading">Running both negotiation modes...</p>`;
    const [data, scenarioDetail] = await Promise.all([
      apiGet(`/compare/${compareState.activeId}`),
      apiGet(`/scenarios/${compareState.activeId}`),
    ]);
    compareState.data = { scenarioId: compareState.activeId, scenarioDetail, ...data };
  }

  const { withoutIoc, withIoc, scenarioDetail } = compareState.data;

  app.innerHTML = `
    <h1>Without IoC vs. With IoC</h1>
    <p class="subtitle">Same scenario, same two calendars - run through both negotiation modes side by side.</p>
    <div class="panel">
      <label for="scenario-picker"><strong>Scenario:</strong></label>
      <select id="scenario-picker">
        ${compareState.scenarios.map((s) => `<option value="${s.id}" ${s.id === compareState.activeId ? "selected" : ""}>${esc(s.title)}</option>`).join("")}
      </select>
    </div>
    <div class="panel">
      <div class="user-story">${esc(scenarioDetail.userStory)}</div>
      <h2 class="topo-heading">Where these agents actually live</h2>
      ${renderTopologyDiagram(scenarioDetail)}
    </div>
    ${renderKpiRow(withoutIoc, withIoc)}
    <div class="compare-grid">
      ${compareColumn("without", "Without IoC", withoutIoc)}
      ${compareColumn("with", "With IoC (CSP)", withIoc)}
    </div>
  `;

  document.getElementById("scenario-picker").addEventListener("change", (e) => {
    compareState.activeId = e.target.value;
    renderCompare();
  });
}

function compareColumn(cls, title, session) {
  const resultLine =
    session.status === "agreed"
      ? `<span class="badge good">Agreed</span> ${esc(session.proposedSlot.dateLabel)}`
      : `<span class="badge warn">Escalated to humans</span>`;
  const roundsLabel = session.mode === "with-ioc" ? "Negotiation rounds (single joint pass)" : "Negotiation rounds";
  return `
    <div class="compare-col ${cls}">
      <h2>${esc(title)}</h2>
      <div class="compare-result">${resultLine}</div>
      <div class="compare-stats">
        <div class="compare-stat"><div class="val">${session.rounds}</div><div class="lbl">${roundsLabel}</div></div>
        <div class="compare-stat"><div class="val">${fmtDuration(session.durationMs)}</div><div class="lbl">Time to outcome</div></div>
        <div class="compare-stat"><div class="val">${session.transcript.length}</div><div class="lbl">Messages exchanged</div></div>
      </div>
      ${renderTranscript(session.transcript)}
    </div>
  `;
}

// ================= CONFLICT LAB =================
// Lets you build an arbitrary scenario - any calendars, any ask, any trust
// setup - and run it through the exact same runWithoutIoc/runWithIoc engine
// functions used by the Compare view. Nothing here is scripted: whatever you
// enter is what the engine reasons over.
const WEBEX_STATUS_OPTIONS = ["free", "tentative-hold", "busy"];
const COPILOT_STATUS_OPTIONS = ["free", "focus-time", "busy"];
const DAY_OPTIONS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const HOME_ORG_OPTIONS = [
  { id: "northwind", name: "Northwind Corp" },
  { id: "cisco-outshift", name: "Outshift by Cisco" },
];

let labState = { presets: [], orgs: [], draft: null, result: null, error: null };

function defaultLabDraft() {
  return {
    title: "My test scenario",
    userStory: "Testing a specific conflict I want to see the engine handle.",
    homeOrgId: "cisco-outshift",
    isIntraOrg: false,
    partnerOrgId: "fenwick",
    statedWindows: [{ day: "Tue", start: "14:00", end: "17:00", label: "Tue afternoon" }],
    baselineAssumedDurationMinutes: 60,
    simulatedNowOffsetHours: 240,
    intent: { goal: "Test sync", urgency: "medium", durationMinutes: 30, requiredAttendees: "Home Person, Partner Person" },
    homeAgent: { personName: "Home Person", priorityTier: 3, minNoticeHours: 4, calendar: [] },
    partnerAgent: { personName: "Partner Person", priorityTier: 3, minNoticeHours: 24, calendar: [] },
  };
}

function presetToDraft(s) {
  return {
    title: s.title,
    userStory: s.userStory,
    homeOrgId: s.homeOrgId,
    isIntraOrg: !!s.isIntraOrg,
    partnerOrgId: s.isIntraOrg ? labState.orgs[0]?.id ?? "fenwick" : s.partnerOrgId,
    statedWindows: s.statedWindows.map((w) => ({ ...w })),
    baselineAssumedDurationMinutes: s.baselineAssumedDurationMinutes ?? 60,
    simulatedNowOffsetHours: s.simulatedNowOffsetHours ?? 240,
    intent: {
      goal: s.intent.goal,
      urgency: s.intent.urgency,
      durationMinutes: s.intent.durationMinutes,
      requiredAttendees: s.intent.requiredAttendees.join(", "),
    },
    homeAgent: {
      personName: s.homeAgent.personName,
      priorityTier: s.homeAgent.priorityTier,
      minNoticeHours: s.homeAgent.notice.minNoticeHours,
      calendar: s.homeAgent.calendar.map((b) => ({ ...b })),
    },
    partnerAgent: {
      personName: s.partnerAgent.personName,
      priorityTier: s.partnerAgent.priorityTier,
      minNoticeHours: s.partnerAgent.notice.minNoticeHours,
      calendar: s.partnerAgent.calendar.map((b) => ({ ...b })),
    },
  };
}

function daySelect(selected) {
  return `<select data-field="day">${DAY_OPTIONS.map((d) => `<option value="${d}" ${d === selected ? "selected" : ""}>${d}</option>`).join("")}</select>`;
}
function statusSelect(selected, options) {
  return `<select data-field="status">${options.map((s) => `<option value="${s}" ${s === selected ? "selected" : ""}>${s}</option>`).join("")}</select>`;
}
function windowRow(w, i) {
  return `<tr>
    <td>${daySelect(w.day)}</td>
    <td><input type="time" data-field="start" value="${w.start}"/></td>
    <td><input type="time" data-field="end" value="${w.end}"/></td>
    <td><input type="text" data-field="label" value="${esc(w.label)}"/></td>
    <td><button class="small ghost" data-remove="windows" data-idx="${i}">✕</button></td>
  </tr>`;
}
function calendarRow(who, b, i, statusOptions) {
  return `<tr>
    <td>${daySelect(b.day)}</td>
    <td><input type="time" data-field="start" value="${b.start}"/></td>
    <td><input type="time" data-field="end" value="${b.end}"/></td>
    <td>${statusSelect(b.status, statusOptions)}</td>
    <td><input type="text" data-field="label" value="${esc(b.label)}"/></td>
    <td><button class="small ghost" data-remove="${who}-cal" data-idx="${i}">✕</button></td>
  </tr>`;
}
function readTableRows(tableId) {
  const rows = document.querySelectorAll(`#${tableId} tbody tr`);
  return [...rows].map((tr) => {
    const get = (f) => tr.querySelector(`[data-field="${f}"]`)?.value ?? "";
    return { day: get("day"), start: get("start"), end: get("end"), status: get("status"), label: get("label") };
  });
}

async function renderLab() {
  if (!labState.presets.length) {
    labState.presets = await apiGet("/scenarios");
    labState.orgs = await apiGet("/orgs");
  }
  if (!labState.draft) labState.draft = defaultLabDraft();
  const d = labState.draft;

  app.innerHTML = `
    <h1>Conflict Lab</h1>
    <p class="subtitle">Build your own calendars and ask, then run it through the same negotiation engine used everywhere else in this app - no scripted outcomes, just live reasoning over whatever you enter below.</p>

    <div class="panel">
      <label>Start from a preset
        <select id="preset-picker">
          <option value="">- blank scenario -</option>
          ${labState.presets.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join("")}
        </select>
      </label>
    </div>

    <div class="panel lab-form">
      <div class="lab-grid-2">
        <label>Title<input type="text" id="f-title" value="${esc(d.title)}" /></label>
        <label>Home org
          <select id="f-homeOrg">
            ${HOME_ORG_OPTIONS.map((o) => `<option value="${o.id}" ${o.id === d.homeOrgId ? "selected" : ""}>${esc(o.name)}</option>`).join("")}
          </select>
        </label>
      </div>
      <label>User story - why this negotiation matters<input type="text" id="f-userStory" value="${esc(d.userStory)}" /></label>

      <label class="lab-checkbox"><input type="checkbox" id="f-intraOrg" ${d.isIntraOrg ? "checked" : ""}/> Same org on both sides (intra-org - skips the trust check, same vocabulary)</label>

      <div id="f-partnerOrgWrap" ${d.isIntraOrg ? 'style="display:none"' : ""}>
        <label>Partner org
          <select id="f-partnerOrg">
            ${labState.orgs.map((o) => `<option value="${o.id}" ${o.id === d.partnerOrgId ? "selected" : ""}>${esc(o.name)} (${o.trustStatus === "trusted" ? "trusted" : "pending review"})</option>`).join("")}
          </select>
        </label>
      </div>

      <h2>The ask (shared intent)</h2>
      <div class="lab-grid-3">
        <label>Goal<input type="text" id="f-goal" value="${esc(d.intent.goal)}" /></label>
        <label>Urgency
          <select id="f-urgency">
            ${["low", "medium", "high"].map((u) => `<option value="${u}" ${u === d.intent.urgency ? "selected" : ""}>${u}</option>`).join("")}
          </select>
        </label>
        <label>True duration (min)<input type="number" id="f-duration" min="5" max="480" value="${d.intent.durationMinutes}" /></label>
      </div>
      <div class="lab-grid-3">
        <label>Attendees (comma-separated)<input type="text" id="f-attendees" value="${esc(d.intent.requiredAttendees)}" /></label>
        <label>Baseline's naive default duration (min)<input type="number" id="f-baselineDuration" min="5" max="480" value="${d.baselineAssumedDurationMinutes}" /></label>
        <label>Simulated hours until the earliest window<input type="number" id="f-nowOffset" min="0" max="2000" value="${d.simulatedNowOffsetHours}" /></label>
      </div>

      <h2>Stated windows <button class="small" id="add-window">+ add window</button></h2>
      <table class="lab-table" id="windows-table">
        <thead><tr><th>Day</th><th>Start</th><th>End</th><th>Label</th><th></th></tr></thead>
        <tbody>${d.statedWindows.map((w, i) => windowRow(w, i)).join("")}</tbody>
      </table>

      <div class="lab-grid-2">
        <div>
          <h2>Home agent <span class="topo-agent-kind">(Webex)</span></h2>
          <div class="lab-grid-2">
            <label>Name<input type="text" id="f-home-name" value="${esc(d.homeAgent.personName)}" /></label>
            <label>Notice needed (hrs)<input type="number" id="f-home-notice" min="0" max="240" value="${d.homeAgent.minNoticeHours}" /></label>
          </div>
          <h3>Calendar <button class="small" id="add-home-block">+ add block</button></h3>
          <table class="lab-table" id="home-cal-table">
            <thead><tr><th>Day</th><th>Start</th><th>End</th><th>Status</th><th>Label</th><th></th></tr></thead>
            <tbody>${d.homeAgent.calendar.map((b, i) => calendarRow("home", b, i, WEBEX_STATUS_OPTIONS)).join("")}</tbody>
          </table>
        </div>
        <div>
          <h2>Partner agent <span class="topo-agent-kind">(${d.isIntraOrg ? "Webex" : "Copilot"})</span></h2>
          <div class="lab-grid-2">
            <label>Name<input type="text" id="f-partner-name" value="${esc(d.partnerAgent.personName)}" /></label>
            <label>Notice needed (hrs)<input type="number" id="f-partner-notice" min="0" max="240" value="${d.partnerAgent.minNoticeHours}" /></label>
          </div>
          <h3>Calendar <button class="small" id="add-partner-block">+ add block</button></h3>
          <table class="lab-table" id="partner-cal-table">
            <thead><tr><th>Day</th><th>Start</th><th>End</th><th>Status</th><th>Label</th><th></th></tr></thead>
            <tbody>${d.partnerAgent.calendar.map((b, i) => calendarRow("partner", b, i, d.isIntraOrg ? WEBEX_STATUS_OPTIONS : COPILOT_STATUS_OPTIONS)).join("")}</tbody>
          </table>
        </div>
      </div>

      <div class="action-row">
        <button class="primary" id="run-lab">Run comparison</button>
      </div>
      ${labState.error ? `<p class="lab-error">${esc(labState.error)}</p>` : ""}
    </div>

    <div id="lab-result"></div>
  `;

  wireLabForm();
  if (labState.result) renderLabResult();
}

function syncFormIntoDraft() {
  const d = labState.draft;
  d.title = document.getElementById("f-title").value;
  d.userStory = document.getElementById("f-userStory").value;
  d.homeOrgId = document.getElementById("f-homeOrg").value;
  d.isIntraOrg = document.getElementById("f-intraOrg").checked;
  const partnerOrgSel = document.getElementById("f-partnerOrg");
  if (partnerOrgSel) d.partnerOrgId = partnerOrgSel.value;

  d.intent.goal = document.getElementById("f-goal").value;
  d.intent.urgency = document.getElementById("f-urgency").value;
  d.intent.durationMinutes = Number(document.getElementById("f-duration").value);
  d.intent.requiredAttendees = document.getElementById("f-attendees").value;
  d.baselineAssumedDurationMinutes = Number(document.getElementById("f-baselineDuration").value);
  d.simulatedNowOffsetHours = Number(document.getElementById("f-nowOffset").value);

  d.homeAgent.personName = document.getElementById("f-home-name").value;
  d.homeAgent.minNoticeHours = Number(document.getElementById("f-home-notice").value);
  d.partnerAgent.personName = document.getElementById("f-partner-name").value;
  d.partnerAgent.minNoticeHours = Number(document.getElementById("f-partner-notice").value);

  d.statedWindows = readTableRows("windows-table").map((r) => ({ day: r.day, start: r.start, end: r.end, label: r.label }));
  d.homeAgent.calendar = readTableRows("home-cal-table").map((r) => ({ day: r.day, start: r.start, end: r.end, status: r.status, label: r.label }));
  d.partnerAgent.calendar = readTableRows("partner-cal-table").map((r) => ({ day: r.day, start: r.start, end: r.end, status: r.status, label: r.label }));
}

function buildLabPayload() {
  const d = labState.draft;
  return {
    title: d.title,
    userStory: d.userStory,
    homeOrgId: d.homeOrgId,
    partnerOrgId: d.isIntraOrg ? d.homeOrgId : d.partnerOrgId,
    isIntraOrg: d.isIntraOrg,
    statedWindows: d.statedWindows,
    baselineAssumedDurationMinutes: d.baselineAssumedDurationMinutes,
    simulatedNowOffsetHours: d.simulatedNowOffsetHours,
    intent: {
      goal: d.intent.goal,
      urgency: d.intent.urgency,
      durationMinutes: d.intent.durationMinutes,
      requiredAttendees: d.intent.requiredAttendees.split(",").map((s) => s.trim()).filter(Boolean),
    },
    homeAgent: {
      personName: d.homeAgent.personName,
      priorityTier: d.homeAgent.priorityTier,
      notice: { minNoticeHours: d.homeAgent.minNoticeHours },
      calendar: d.homeAgent.calendar,
    },
    partnerAgent: {
      personName: d.partnerAgent.personName,
      priorityTier: d.partnerAgent.priorityTier,
      notice: { minNoticeHours: d.partnerAgent.minNoticeHours },
      calendar: d.partnerAgent.calendar,
    },
  };
}

function wireLabForm() {
  document.getElementById("preset-picker").addEventListener("change", async (e) => {
    if (!e.target.value) {
      labState.draft = defaultLabDraft();
    } else {
      const s = await apiGet(`/scenarios/${e.target.value}`);
      labState.draft = presetToDraft(s);
    }
    labState.result = null;
    labState.error = null;
    renderLab();
  });

  document.getElementById("f-intraOrg").addEventListener("change", () => {
    syncFormIntoDraft();
    renderLab();
  });

  document.getElementById("add-window").addEventListener("click", () => {
    syncFormIntoDraft();
    labState.draft.statedWindows.push({ day: "Tue", start: "09:00", end: "10:00", label: "New window" });
    renderLab();
  });
  document.getElementById("add-home-block").addEventListener("click", () => {
    syncFormIntoDraft();
    labState.draft.homeAgent.calendar.push({ day: "Tue", start: "09:00", end: "10:00", status: "free", label: "" });
    renderLab();
  });
  document.getElementById("add-partner-block").addEventListener("click", () => {
    syncFormIntoDraft();
    labState.draft.partnerAgent.calendar.push({ day: "Tue", start: "09:00", end: "10:00", status: "free", label: "" });
    renderLab();
  });

  app.querySelectorAll("[data-remove]").forEach((btn) =>
    btn.addEventListener("click", () => {
      syncFormIntoDraft();
      const idx = Number(btn.dataset.idx);
      if (btn.dataset.remove === "windows") labState.draft.statedWindows.splice(idx, 1);
      else if (btn.dataset.remove === "home-cal") labState.draft.homeAgent.calendar.splice(idx, 1);
      else if (btn.dataset.remove === "partner-cal") labState.draft.partnerAgent.calendar.splice(idx, 1);
      renderLab();
    })
  );

  document.getElementById("run-lab").addEventListener("click", async () => {
    syncFormIntoDraft();
    labState.error = null;
    const resultEl = document.getElementById("lab-result");
    resultEl.innerHTML = `<p class="loading">Running both negotiation modes against your scenario...</p>`;
    try {
      const data = await apiPost("/compare/custom", buildLabPayload());
      labState.result = data;
    } catch (err) {
      labState.error = err.message;
      labState.result = null;
    }
    renderLab();
  });
}

function renderLabResult() {
  const el = document.getElementById("lab-result");
  if (!el || !labState.result) return;
  const { withoutIoc, withIoc, scenario } = labState.result;
  el.innerHTML = `
    <div class="panel">
      <h2 class="topo-heading">Where these agents actually live</h2>
      ${renderTopologyDiagram(scenario)}
    </div>
    ${renderKpiRow(withoutIoc, withIoc)}
    <div class="compare-grid">
      ${compareColumn("without", "Without IoC", withoutIoc)}
      ${compareColumn("with", "With IoC (CSP)", withIoc)}
    </div>
  `;
}

// ================= ADMIN VIEW =================
let adminState = { policy: null };

async function renderAdmin() {
  const [orgs, policy, metrics, negotiations] = await Promise.all([
    apiGet("/orgs"),
    apiGet("/policy"),
    apiGet("/metrics"),
    apiGet("/negotiations"),
  ]);
  adminState.policy = policy;

  app.innerHTML = `
    <h1>Admin console</h1>
    <p class="subtitle">Northwind Corp's cross-org negotiation settings, trust relationships, and audit history.</p>

    <div class="metrics-row">
      <div class="metric-tile"><div class="num">${metrics.trustedOrgCount}</div><div class="lbl">Trusted orgs</div></div>
      <div class="metric-tile"><div class="num">${metrics.negotiationsThisPeriod}</div><div class="lbl">Negotiations this period</div></div>
      <div class="metric-tile"><div class="num">${metrics.avgTimeToResolutionSeconds}s</div><div class="lbl">Avg. time to resolution</div></div>
      <div class="metric-tile"><div class="num">${metrics.percentEscalated}%</div><div class="lbl">Escalated to humans</div></div>
    </div>

    <div class="panel">
      <h2>Connected organizations</h2>
      <table>
        <thead><tr><th>Organization</th><th>Agent platform</th><th>Trust status</th><th></th></tr></thead>
        <tbody>
          ${orgs
            .map(
              (o) => `
            <tr>
              <td>${esc(o.name)}</td>
              <td>${o.agentKind === "webex" ? "Webex" : "Microsoft Copilot"}</td>
              <td>${o.trustStatus === "trusted" ? '<span class="badge good">Trusted</span>' : '<span class="badge warn">Pending review</span>'}</td>
              <td><button class="small" data-org="${o.id}" data-next="${o.trustStatus === "trusted" ? "pending-review" : "trusted"}">
                ${o.trustStatus === "trusted" ? "Revoke trust" : "Approve trust"}
              </button></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="panel">
      <h2>Data-sharing policy</h2>
      <p class="subtitle">What's allowed to cross the org boundary during a negotiation.</p>
      <div class="policy-grid">
        ${policyToggle("freeBusy", "Free/busy status", "Share available/busy windows (in the shared schema, never raw calendar entries).", policy.freeBusy)}
        ${policyToggle("priorityTier", "Priority tier", "Share how important this org considers the meeting.", policy.priorityTier)}
        ${policyToggle("meetingTitlesAndAttendees", "Meeting titles & attendee names", "Share the actual subject lines and names on either calendar.", policy.meetingTitlesAndAttendees)}
        ${policyToggle("humanApprovalBeforeSend", "Human approval before send", "Require a person to accept before any invite goes out.", policy.humanApprovalBeforeSend)}
      </div>
    </div>

    <div class="panel">
      <h2>Audit log</h2>
      <table>
        <thead><tr><th>When</th><th>Organization</th><th>Mode</th><th>Outcome</th><th>Rounds</th><th>Duration</th><th></th></tr></thead>
        <tbody>
          ${negotiations
            .map(
              (n) => `
            <tr>
              <td>${fmtDate(n.startedAt)}</td>
              <td>${esc(n.scenarioTitle)}</td>
              <td>${n.mode === "with-ioc" ? "With IoC" : "Without IoC"}</td>
              <td>${outcomeBadge(n)}</td>
              <td>${n.rounds}</td>
              <td>${fmtDuration(n.durationMs)}</td>
              <td><button class="small ghost" data-view-transcript="${n.id}">View transcript</button></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
    <div id="modal-root"></div>
  `;

  app.querySelectorAll("[data-org]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      await apiPatch(`/orgs/${btn.dataset.org}/trust`, { trustStatus: btn.dataset.next });
      toast("Trust status updated.");
      renderAdmin();
    })
  );

  app.querySelectorAll(".policy-toggle input").forEach((input) =>
    input.addEventListener("change", async () => {
      await apiPatch("/policy", { [input.dataset.key]: input.checked });
      toast("Policy updated.");
    })
  );

  app.querySelectorAll("[data-view-transcript]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const session = negotiations.find((n) => n.id === btn.dataset.viewTranscript);
      showTranscriptModal(session);
    })
  );
}

function policyToggle(key, label, hint, value) {
  return `
    <div class="policy-toggle">
      <div>
        <div class="label">${esc(label)}</div>
        <div class="hint">${esc(hint)}</div>
      </div>
      <label class="switch">
        <input type="checkbox" class="policy-toggle" data-key="${key}" ${value ? "checked" : ""} />
        <span class="slider"></span>
      </label>
    </div>
  `;
}

function showTranscriptModal(session) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <h2>${esc(session.scenarioTitle)} <button class="ghost" id="modal-close">Close ✕</button></h2>
        <p class="subtitle">${session.mode === "with-ioc" ? "With IoC" : "Without IoC"} &middot; ${outcomeBadge(session)} &middot; ${session.rounds} round(s) &middot; ${fmtDuration(session.durationMs)}</p>
        ${renderTranscript(session.transcript)}
      </div>
    </div>
  `;
  document.getElementById("modal-close").addEventListener("click", () => (root.innerHTML = ""));
  document.getElementById("modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "modal-backdrop") root.innerHTML = "";
  });
}
