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
const routes = { "end-user": renderEndUser, compare: renderCompare, admin: renderAdmin };

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
    const data = await apiGet(`/compare/${compareState.activeId}`);
    compareState.data = { scenarioId: compareState.activeId, ...data };
  }

  const { withoutIoc, withIoc } = compareState.data;

  app.innerHTML = `
    <h1>Without IoC vs. With IoC</h1>
    <p class="subtitle">Same scenario, same two calendars - run through both negotiation modes side by side.</p>
    <div class="panel">
      <label for="scenario-picker"><strong>Scenario:</strong></label>
      <select id="scenario-picker">
        ${compareState.scenarios.map((s) => `<option value="${s.id}" ${s.id === compareState.activeId ? "selected" : ""}>${esc(s.title)}</option>`).join("")}
      </select>
    </div>
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
