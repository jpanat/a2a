/* ============================================================
   Project Nova — Launch Readiness
   BEFORE (A2A orchestration) vs AFTER (A2A + IoC-Collaboration) prototype
   ============================================================ */

// ---------------------------------------------------------------
// Static data
// ---------------------------------------------------------------

const AGENTS = {
  human: { name: 'You', short: 'JP', avatarClass: 'avatar-human', nameClass: '' },
  orch:  { name: 'LaunchAgent', short: 'LA', avatarClass: 'avatar-orch', nameClass: 'orch' },
  eng:   { name: 'Engineering Agent', short: 'EN', avatarClass: 'avatar-eng', nameClass: 'eng' },
  sec:   { name: 'Security Agent', short: 'SE', avatarClass: 'avatar-sec', nameClass: 'sec' },
  sup:   { name: 'Support Agent', short: 'SU', avatarClass: 'avatar-sup', nameClass: 'sup' },
  prod:  { name: 'Product Agent', short: 'PR', avatarClass: 'avatar-prod', nameClass: 'prod' },
};

const STAGES = [
  { key: 'discovered', label: 'DISCOVERED' },
  { key: 'ontology',   label: 'ONTOLOGY' },
  { key: 'intent',     label: 'INTENT' },
  { key: 'context',    label: 'CONTEXT' },
  { key: 'reasoning',  label: 'REASONING' },
  { key: 'agreement',  label: 'AGREEMENT' },
];

const BEFORE_FINAL = { messages: 42, roundtrips: 18, tokens: 31.4, cost: 0.41, dup: 73, conflicts: 7, unresolved: 4, agreement: '2 / 4', confidence: 61, time: '2m 47s' };
const AFTER_FINAL  = { messages: 19, rounds: 6, tokens: 13.8, cost: 0.18, dup: 21, conflicts: 0, unresolved: 0, agreement: '4 / 4', confidence: 94, reuse: 79 };

const PAUSE_MESSAGES = {
  disagreement: "4 agents just responded with 3 different answers to the same question. This is where ordinary orchestration starts to strain.",
  ontology: "Agents just converged on a shared definition of “Launch Readiness” — no orchestrator did the interpreting for them.",
  context: "Two agents held contradictory facts, one of them 41 days stale. IoC-Collaboration resolves it by provenance — not by asking again.",
  agreement: "This proposal was negotiated directly between agents, issue by issue — no orchestrator relay required.",
  metrics: "Same task, same four agents, same question. Very different cost and confidence profile.",
};

// ---------------------------------------------------------------
// State
// ---------------------------------------------------------------

const state = {
  mode: 'before',            // 'before' | 'after'
  beforeIdx: 0,               // steps executed in before timeline
  afterIdx: 0,                // steps executed in after timeline
  autoplay: false,
  autoplayTimer: null,
  busy: false,                // step animation in flight
  stageStatus: { discovered: 'active', ontology: 'pending', intent: 'pending', context: 'pending', reasoning: 'pending', agreement: 'pending' },
  collabState: 'communicating',
  before: { messages: 1, tokens: 0.4, cost: 0.01, roundtrips: 0, dup: 0, conflicts: 0, unresolved: 0, agreement: '—', confidence: null, time: '0:00' },
  beforeComplete: false,
  after: { messages: 0, tokens: 0, cost: 0, rounds: 0, dup: 0, conflicts: 7, unresolved: 4, agreement: '—', confidence: null, reuse: 0 },
  afterComplete: false,
  negotiationCount: 0,
  clock: { h: 8, m: 52 },
  archTab: 'before',
  gen: 0,
};

// ---------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------

const messagesEl = document.getElementById('messages');
const intelBodyEl = document.getElementById('intel-body');
const stageTrackerEl = document.getElementById('stage-tracker');
const collabStateValueEl = document.getElementById('collab-state-value');
const miniMetricsEl = document.getElementById('mini-metrics');
const quickRepliesEl = document.getElementById('quick-replies');
const pauseBannerEl = document.getElementById('pause-banner');
const pauseTextEl = document.getElementById('pause-text');
const participantsEl = document.getElementById('participants');

const btnReset = document.getElementById('btn-reset');
const btnBefore = document.getElementById('btn-before');
const btnNegmas = document.getElementById('btn-negmas');
const btnAdvance = document.getElementById('btn-advance');
const btnAutoplay = document.getElementById('btn-autoplay');
const btnMetrics = document.getElementById('btn-metrics');
const btnArchitecture = document.getElementById('btn-architecture');
const composerInput = document.getElementById('composer-input');
const composerSend = document.getElementById('composer-send');

// ---------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------

function tickClock(mins) {
  state.clock.m += mins;
  while (state.clock.m >= 60) { state.clock.m -= 60; state.clock.h += 1; }
  const h = state.clock.h > 12 ? state.clock.h - 12 : state.clock.h;
  return `${h}:${String(state.clock.m).padStart(2, '0')} AM`;
}

function scrollBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(t) { return Math.max(0, Math.min(1, t)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function avatarSpan(key) {
  const a = AGENTS[key];
  return `<div class="msg-avatar ${a.avatarClass}">${a.short}</div>`;
}

function addChat(key, bodyHtml) {
  const a = AGENTS[key];
  const isMe = key === 'human';
  const row = document.createElement('div');
  row.className = 'msg-row' + (isMe ? ' me' : '');
  row.innerHTML = `
    ${avatarSpan(key)}
    <div class="msg-body">
      <div class="msg-meta"><span class="name ${a.nameClass}">${a.name}</span><span>${tickClock(1)}</span></div>
      <div class="msg-bubble">${bodyHtml}</div>
    </div>`;
  messagesEl.appendChild(row);
  scrollBottom();
  return row;
}

async function typingThen(key, bodyHtmlFn, delay = 500) {
  const a = AGENTS[key];
  const row = document.createElement('div');
  row.className = 'msg-row';
  row.innerHTML = `
    ${avatarSpan(key)}
    <div class="msg-body">
      <div class="msg-meta"><span class="name ${a.nameClass}">${a.name}</span></div>
      <div class="msg-bubble typing-dots"><span></span><span></span><span></span></div>
    </div>`;
  messagesEl.appendChild(row);
  scrollBottom();
  setAgentThinking(key, true);
  await sleep(delay);
  setAgentThinking(key, false);
  row.querySelector('.msg-meta').innerHTML = `<span class="name ${a.nameClass}">${a.name}</span><span>${tickClock(1)}</span>`;
  row.querySelector('.msg-bubble').outerHTML = `<div class="msg-bubble">${bodyHtmlFn()}</div>`;
  scrollBottom();
  return row;
}

function addRelay(fromKey, toKey, text) {
  const from = AGENTS[fromKey];
  const row = document.createElement('div');
  row.className = 'msg-row relay';
  row.innerHTML = `
    ${avatarSpan(fromKey)}
    <div class="msg-body">
      <div class="relay-path">${from.name.split(' ')[0].toUpperCase()} <span class="arrow">→</span> ${AGENTS[toKey].name.split(' ')[0].toUpperCase()}</div>
      <div class="msg-bubble">${text}</div>
    </div>`;
  messagesEl.appendChild(row);
  scrollBottom();
  return row;
}

function addCentered(html, cls) {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.justifyContent = 'center';
  row.innerHTML = `<div class="${cls}">${html}</div>`;
  messagesEl.appendChild(row);
  scrollBottom();
  return row;
}

function addSysNote(text, strong) {
  return addCentered(text, 'sys-note' + (strong ? ' strong' : ''));
}

function addPhaseDivider(num, title, question) {
  return addCentered(
    `<span class="label">${num} · ${title}</span><span class="question">${question}</span>`,
    'phase-divider'
  );
}

// ---------------------------------------------------------------
// Right panel rendering
// ---------------------------------------------------------------

function renderStageTracker() {
  stageTrackerEl.innerHTML = STAGES.map(s => {
    const status = state.stageStatus[s.key];
    return `<div class="stage-item ${status === 'active' ? 'active' : ''} ${status === 'done' ? 'done' : ''}">
      <div class="stage-dot"></div>
      <div class="stage-name">${s.label}</div>
    </div>`;
  }).join('');
}

function setStage(key, status) {
  state.stageStatus[key] = status;
  renderStageTracker();
}

function setCollabState(value, aligned) {
  state.collabState = value;
  collabStateValueEl.textContent = value;
  collabStateValueEl.className = 'collab-state-value ' + (aligned ? 'aligned' : 'communicating');
}

function setIntelBody(html) {
  intelBodyEl.innerHTML = html;
}

function setAgentThinking(key, on) {
  const dot = document.querySelector(`.participant-avatar[data-key="${key}"] .status-dot`);
  if (dot) dot.className = 'status-dot ' + (on ? 'thinking' : 'online');
}

function renderParticipants() {
  const order = ['human', 'orch', 'eng', 'sec', 'sup', 'prod'];
  participantsEl.innerHTML = order.map(k => {
    const a = AGENTS[k];
    return `<div class="participant-avatar ${a.avatarClass}" data-key="${k}" title="${a.name}">${a.short}<span class="status-dot online"></span></div>`;
  }).join('');
}

function renderMiniMetrics() {
  const m = state.mode === 'before' ? state.before : state.after;
  const tokensStr = m.tokens.toFixed(1) + 'K';
  miniMetricsEl.innerHTML = `
    <div class="mini-metric"><div class="num">${m.messages}</div><div class="lbl">Messages</div></div>
    <div class="mini-metric"><div class="num">${tokensStr}</div><div class="lbl">Tokens</div></div>
    <div class="mini-metric"><div class="num">${m.agreement}</div><div class="lbl">Consensus</div></div>
    <div class="mini-metrics-link" id="mini-metrics-link">View full metrics →</div>
    <div class="sim-tag">Simulated demo metrics</div>
  `;
  document.getElementById('mini-metrics-link').onclick = () => openMetrics();
}

function bumpBefore(delta) {
  Object.keys(delta).forEach(k => { state.before[k] = round1(state.before[k] + delta[k]); });
  renderMiniMetrics();
}
function setBefore(vals) {
  Object.assign(state.before, vals);
  renderMiniMetrics();
}
function bumpAfter(delta) {
  Object.keys(delta).forEach(k => { state.after[k] = round1(state.after[k] + delta[k]); });
  renderMiniMetrics();
}
function setAfter(vals) {
  Object.assign(state.after, vals);
  renderMiniMetrics();
}
function round1(n) { return Math.round(n * 10) / 10; }

// ---------------------------------------------------------------
// Reusable intel-panel card builders
// ---------------------------------------------------------------

function introPanelHtml() {
  return `<div class="intel-card">
    <h5>▸ Query broadcast</h5>
    <div class="desc">LaunchAgent has broadcast the readiness question to all four agents independently. Each will reason from its own context, in its own vocabulary.</div>
  </div>`;
}

function initialPositionsPanelHtml() {
  return `<div class="intel-card">
    <h5>▸ Initial positions</h5>
    <div class="badge-row">
      <span class="mini-badge go">Engineering: GO</span>
      <span class="mini-badge nogo">Security: NO-GO</span>
      <span class="mini-badge conditional">Support: CONDITIONAL</span>
      <span class="mini-badge go">Product: GO</span>
    </div>
    <div class="desc" style="margin-top:8px">4 agents responded. 3 different answers. No shared definition of “ready” to reconcile them.</div>
  </div>`;
}

function dupPanelHtml() {
  const d = state.dupDetail || { eng: 0, sec: 0, sup: 0, prod: 0 };
  const max = 4;
  function row(name, val, cls) {
    return `<div class="dup-row"><span class="dup-name">${name}</span><div class="dup-bar-track"><div class="dup-bar-fill" style="width:${(val / max) * 100}%"></div></div><span class="dup-count">×${val}</span></div>`;
  }
  return `<div class="intel-card">
    <h5>▸ Context Duplication</h5>
    ${row('Engineering', d.eng)}
    ${row('Security', d.sec)}
    ${row('Support', d.sup)}
    ${row('Product', d.prod)}
    <div class="desc" style="margin-top:6px">Each agent re-explains its world to the orchestrator, every time it's asked.</div>
  </div>`;
}

function mismatchPanelHtml() {
  return `<div class="intel-card">
    <h5>⚠ Semantic mismatch</h5>
    <span class="concept-chip">Deployable</span><span class="concept-chip">SecurityApproved</span><span class="concept-chip">Supportable</span><span class="concept-chip">CustomerReady</span>
    <div class="desc" style="margin-top:6px">No common definition of <b>LaunchReady</b>.</div>
  </div>`;
}

function intentMismatchPanelHtml() {
  return `<div class="intel-card">
    <h5>⚠ Intent mismatch</h5>
    <div class="kv"><span class="k">Engineering optimizes</span><span class="v">delivery speed</span></div>
    <div class="kv"><span class="k">Security optimizes</span><span class="v">risk</span></div>
    <div class="kv"><span class="k">Support optimizes</span><span class="v">recoverability</span></div>
    <div class="kv"><span class="k">Product optimizes</span><span class="v">customer commitment</span></div>
  </div>`;
}

function contextFragPanelHtml() {
  return `<div class="intel-card">
    <h5>⚠ Context fragmentation</h5>
    <div class="kv"><span class="k">Rollback (Engineering)</span><span class="v">7 min</span></div>
    <div class="kv"><span class="k">Rollback (Support)</span><span class="v">25 min</span></div>
    <div class="kv"><span class="k">Deadline (Product)</span><span class="v">9 AM</span></div>
    <div class="kv"><span class="k">Deadline (commitment)</span><span class="v">12 PM</span></div>
    <div class="kv"><span class="k">New vulnerability</span><span class="v">12 min ago</span></div>
  </div>`;
}

function recommendationPanelHtml() {
  return `<div class="intel-card">
    <h5>▸ Orchestrator recommendation</h5>
    <div class="kv"><span class="k">Decision</span><span class="v" style="color:var(--sec)">NO-GO</span></div>
    <div class="kv"><span class="k">Confidence</span><span class="v">61%</span></div>
    <div class="kv"><span class="k">Agreement</span><span class="v">2 / 4</span></div>
    <div class="desc" style="margin-top:6px">No agent consensus established.</div>
  </div>`;
}

// ---------------------------------------------------------------
// Chat content builders — BEFORE
// ---------------------------------------------------------------

function engGoCardHtml() {
  return `<div class="chat-card">
    <span class="verdict-badge go">🟢 GO</span>
    <p>1,248 tests passed.</p>
    <p>Deployment pipeline ready.</p>
    <p>Rollback available.</p>
  </div>`;
}
function secNogoCardHtml() {
  return `<div class="chat-card">
    <span class="verdict-badge nogo">🔴 NO-GO</span>
    <p>Critical vulnerability detected in Component Y.</p>
    <p>Security approval denied.</p>
  </div>`;
}
function supConditionalCardHtml() {
  return `<div class="chat-card">
    <span class="verdict-badge conditional">🟡 CONDITIONAL</span>
    <p>Support team available.</p>
    <p>Runbook indicates rollback may require 25 minutes.</p>
  </div>`;
}
function prodGoCardHtml() {
  return `<div class="chat-card">
    <span class="verdict-badge go">🟢 GO</span>
    <p>Customer commitment requires Feature X today.</p>
  </div>`;
}

function orchestratorRecCardHtml() {
  return `<div class="chat-card wide">
    <h4>Orchestrator Recommendation</h4>
    <div class="big-line" style="color:var(--sec)">NO-GO</div>
    <div class="conf">Confidence: <b>61%</b></div>
    <div class="reason">"Conflicting security and operational readiness signals."</div>
  </div>`;
}

function consensusWarningHtml() {
  return `<div class="warn-card">
    <h4>⚠ No agent consensus established</h4>
    <div class="row"><span>Engineering</span><b style="color:var(--sec)">REJECTS</b></div>
    <div class="row"><span>Security</span><b style="color:var(--wx-green)">ACCEPTS</b></div>
    <div class="row"><span>Support</span><b style="color:var(--sup)">UNCERTAIN</b></div>
    <div class="row"><span>Product</span><b style="color:var(--sec)">REJECTS</b></div>
  </div>`;
}

function ctaCardHtml() {
  return `<p><b>Ordinary A2A got four agents talking. It didn't get them to agree.</b></p>
  <p>Give them a shared way to establish meaning, intent, facts, and reasoning.</p>
  <button class="cta-big-btn" id="cta-enable-negmas">Enable IoC-Collaboration</button>`;
}

// ---------------------------------------------------------------
// BEFORE timeline
// ---------------------------------------------------------------

const beforeSteps = [
  // 0: broadcast
  { run: async () => {
      addRelay('orch', 'eng', 'Broadcasting: “Are we ready to launch?”');
      addRelay('orch', 'sec', 'Broadcasting: “Are we ready to launch?”');
      addRelay('orch', 'sup', 'Broadcasting: “Are we ready to launch?”');
      addRelay('orch', 'prod', 'Broadcasting: “Are we ready to launch?”');
      bumpBefore({ messages: 4, tokens: 1.4 });
      setIntelBody(introPanelHtml());
    }
  },
  // 1: eng response
  { run: async () => {
      await typingThen('eng', engGoCardHtml);
      bumpBefore({ messages: 1, tokens: 1.1 });
    }
  },
  // 2: sec response
  { run: async () => {
      await typingThen('sec', secNogoCardHtml);
      bumpBefore({ messages: 1, tokens: 1.1 });
    }
  },
  // 3: sup response
  { run: async () => {
      await typingThen('sup', supConditionalCardHtml);
      bumpBefore({ messages: 1, tokens: 1.1 });
    }
  },
  // 4: prod response -> PAUSE (initial disagreement)
  { run: async () => {
      await typingThen('prod', prodGoCardHtml);
      bumpBefore({ messages: 1, tokens: 1.1 });
      setIntelBody(initialPositionsPanelHtml());
    },
    pause: 'disagreement',
  },
  // 5: orch -> sec clarify
  { run: async () => {
      addRelay('orch', 'sec', 'Why is the vulnerability blocking?');
      bumpBefore({ messages: 1, tokens: 0.7 });
      state.dupDetail = { eng: 0, sec: 1, sup: 0, prod: 0 };
      setIntelBody(dupPanelHtml());
    }
  },
  // 6: sec -> orch reply
  { run: async () => {
      addRelay('sec', 'orch', 'Component Y has a critical vulnerability.');
      bumpBefore({ messages: 1, tokens: 0.9, roundtrips: 1 });
      state.dupDetail.sec++;
      setIntelBody(dupPanelHtml());
    }
  },
  // 7: orch -> eng clarify
  { run: async () => {
      addRelay('orch', 'eng', 'Is Component Y required?');
      bumpBefore({ messages: 1, tokens: 0.7 });
      state.dupDetail.eng++;
      setIntelBody(dupPanelHtml());
    }
  },
  // 8: eng -> orch reply
  { run: async () => {
      addRelay('eng', 'orch', 'Not for Feature X.');
      bumpBefore({ messages: 1, tokens: 0.9, roundtrips: 1 });
      state.dupDetail.eng++;
      setIntelBody(dupPanelHtml());
    }
  },
  // 9: orch -> sup clarify
  { run: async () => {
      addRelay('orch', 'sup', 'Is Feature X independently supportable?');
      bumpBefore({ messages: 1, tokens: 0.7 });
      state.dupDetail.sup++;
      setIntelBody(dupPanelHtml());
    }
  },
  // 10: sup -> orch reply
  { run: async () => {
      addRelay('sup', 'orch', 'Need deployment configuration.');
      bumpBefore({ messages: 1, tokens: 0.9, roundtrips: 1 });
      state.dupDetail.sup++;
      setIntelBody(dupPanelHtml());
    }
  },
  // 11: orch -> eng clarify
  { run: async () => {
      addRelay('orch', 'eng', 'Provide deployment configuration.');
      bumpBefore({ messages: 1, tokens: 0.8 });
      state.dupDetail.eng++;
      setIntelBody(dupPanelHtml());
    }
  },
  // 12: eng -> orch reply (detail)
  { run: async () => {
      addRelay('eng', 'orch', 'Deployment config: standalone service, no shared dependency on Component Y.');
      bumpBefore({ messages: 1, tokens: 1.2, roundtrips: 1 });
      state.dupDetail.eng++;
      setIntelBody(dupPanelHtml());
    }
  },
  // 13: orch -> sup re-ask, sup replies with partial info (more back and forth to sell the cost)
  { run: async () => {
      addRelay('orch', 'sup', 'Given that config, is Feature X supportable alone?');
      addRelay('sup', 'orch', 'Possibly — but our runbook still shows 25 min rollback for the full release train.');
      bumpBefore({ messages: 2, tokens: 2.1, roundtrips: 1 });
      state.dupDetail.sup++;
      setIntelBody(dupPanelHtml());
    }
  },
  // 14: semantic mismatch reveal
  { run: async () => {
      addSysNote('⚠ Semantic mismatch detected across agent vocabularies', true);
      bumpBefore({ messages: 0, tokens: 0.6, conflicts: 4 });
      setIntelBody(mismatchPanelHtml());
    }
  },
  // 15: intent mismatch reveal
  { run: async () => {
      addSysNote('⚠ Intent mismatch: each agent optimizes for something different', true);
      bumpBefore({ messages: 0, tokens: 0.5, conflicts: 3 });
      setIntelBody(intentMismatchPanelHtml());
    }
  },
  // 16: context fragmentation reveal
  { run: async () => {
      addSysNote('⚠ Context fragmentation: agents are reasoning from different facts', true);
      bumpBefore({ messages: 0, tokens: 0.7, unresolved: 4 });
      setIntelBody(contextFragPanelHtml());
    }
  },
  // 17: pad exchanges to sell the round-trip cost, then snap to final numbers
  { run: async () => {
      addRelay('orch', 'prod', 'Can the deadline move?');
      addRelay('prod', 'orch', 'Customer commitment says today — confirming exact time.');
      addRelay('orch', 'sec', 'How recent is this vulnerability?');
      addRelay('sec', 'orch', 'Discovered 12 minutes ago. Still triaging.');
      setBefore({ messages: BEFORE_FINAL.messages - 4, tokens: round1(BEFORE_FINAL.tokens - 3.4), roundtrips: BEFORE_FINAL.roundtrips - 2, dup: BEFORE_FINAL.dup, time: '2m 31s' });
      bumpBefore({ messages: 4, tokens: 3.4, roundtrips: 2 });
    }
  },
  // 18: orchestrator recommendation
  { run: async () => {
      addChat('orch', orchestratorRecCardHtml());
      setBefore({ confidence: 61, time: BEFORE_FINAL.time });
      setIntelBody(recommendationPanelHtml());
    }
  },
  // 19: consensus warning + CTA
  { run: async () => {
      addChat('orch', consensusWarningHtml());
      setBefore({ agreement: BEFORE_FINAL.agreement, messages: BEFORE_FINAL.messages, tokens: BEFORE_FINAL.tokens, roundtrips: BEFORE_FINAL.roundtrips, dup: BEFORE_FINAL.dup, conflicts: BEFORE_FINAL.conflicts, unresolved: BEFORE_FINAL.unresolved, cost: BEFORE_FINAL.cost });
      state.beforeComplete = true;
      await sleep(400);
      addCentered(ctaCardHtml(), 'cta-card');
      document.getElementById('cta-enable-negmas').onclick = () => enableNegmas();
      btnNegmas.classList.add('spotlight');
      renderMiniMetrics();
    }
  },
];

// ---------------------------------------------------------------
// Chat content builders — AFTER
// ---------------------------------------------------------------

function ontologyPublishHtml() {
  return `<div class="chat-card wide">
    <h4>Concepts published to the shared space</h4>
    <div class="kv"><span class="k name eng">Engineering</span></div>
    <span class="concept-chip">TechnicalReady</span><span class="concept-chip">TestsPassed</span><span class="concept-chip">Deployable</span><span class="concept-chip">Rollback</span>
    <div class="kv" style="margin-top:8px"><span class="k name sec">Security</span></div>
    <span class="concept-chip">SecurityReady</span><span class="concept-chip">RiskAccepted</span><span class="concept-chip">Vulnerability</span><span class="concept-chip">Exposure</span>
    <div class="kv" style="margin-top:8px"><span class="k name sup">Support</span></div>
    <span class="concept-chip">OperationalReady</span><span class="concept-chip">Supportable</span><span class="concept-chip">Recoverable</span>
    <div class="kv" style="margin-top:8px"><span class="k name prod">Product</span></div>
    <span class="concept-chip">BusinessReady</span><span class="concept-chip">CustomerCommitment</span><span class="concept-chip">FeatureAvailable</span>
  </div>`;
}

function ontologyResultHtml() {
  return `<div class="chat-card wide">
    <h4>Shared Ontology v1</h4>
    <div class="big-line" style="font-size:17px">LaunchReady</div>
    <div class="badge-row">
      <span class="mini-badge conditional">TechnicalReadiness</span>
      <span class="mini-badge conditional">SecurityReadiness</span>
      <span class="mini-badge conditional">OperationalReadiness</span>
      <span class="mini-badge conditional">BusinessReadiness</span>
    </div>
    <div class="stat-row">
      <div class="stat"><b>100%</b>Ontology convergence</div>
      <div class="stat"><b>7 → 0</b>Semantic conflicts</div>
    </div>
  </div>`;
}

function intentInitialHtml() {
  return `<div class="chat-card wide">
    <div class="kv"><span class="k name eng">Engineering</span><span class="v">Ship today</span></div>
    <div class="kv"><span class="k name sec">Security</span><span class="v">Minimize exposure</span></div>
    <div class="kv"><span class="k name sup">Support</span><span class="v">Ensure recoverability</span></div>
    <div class="kv"><span class="k name prod">Product</span><span class="v">Meet customer commitment</span></div>
  </div>`;
}

function intentResultHtml() {
  return `<div class="chat-card wide">
    <h4>Shared Intent</h4>
    <p style="font-weight:700;font-size:14px">Deliver Feature X today without exceeding agreed operational and security risk.</p>
    <div class="desc">Constraints:</div>
    <span class="concept-chip">customer capability before 12 PM</span>
    <span class="concept-chip">unacceptable security exposure = 0</span>
    <span class="concept-chip">rollback ≤ 10 minutes</span>
    <span class="concept-chip">support capacity available</span>
  </div>`;
}

function conflictTableHtml() {
  return `<div class="chat-card wide">
    <h4>Shared Context — conflicting facts</h4>
    <table class="conflict-table">
      <tr><th>Fact</th><th>Agent A</th><th>Agent B</th></tr>
      <tr><td>Rollback</td><td>Engineering: 7 min</td><td>Support: 25 min</td></tr>
      <tr><td>Customer deadline</td><td>Product: 9 AM</td><td>CRM / commitment: 12 PM</td></tr>
      <tr><td>Vulnerability</td><td>Engineering: unknown</td><td>Security: critical</td></tr>
      <tr><td>Feature dependency</td><td>Product: Feature X</td><td>Security: Component Y</td></tr>
    </table>
  </div>`;
}

function provenanceHtml() {
  return `<div class="chat-card wide">
    <h4>Resolving by provenance, freshness &amp; confidence</h4>
    <div class="provenance-compare">
      <div class="prov-box">
        <div class="headline">25 min</div>
        <div class="meta-line">Source: Support Runbook</div>
        <div class="meta-line">Age: 41 days</div>
      </div>
      <div class="prov-box winner">
        <div class="headline">7 min</div>
        <div class="meta-line">Source: Deployment Test</div>
        <div class="meta-line">Age: 2 hours</div>
        <div class="meta-line">Confidence: 98%</div>
      </div>
    </div>
  </div>`;
}

function contextSummaryHtml() {
  return `<div class="chat-card wide">
    <h4>Shared Context v3</h4>
    <p>✅ Tests: 1,248 passed</p>
    <p>⚠️ Component Y: critical vulnerability</p>
    <p>✅ Feature X independent of Component Y</p>
    <p>✅ Rollback: 7 minutes</p>
    <p>✅ Customer deadline: 12 PM</p>
    <p>✅ Support capacity: available</p>
    <div class="stat-row">
      <div class="stat"><b>100%</b>Context agreement</div>
      <div class="stat"><b>4 → 0</b>Unresolved facts</div>
    </div>
  </div>`;
}

function reasoningIssuesHtml() {
  const issues = ['Feature X', 'Component Y', 'deployment time', 'feature flag', 'rollback', 'monitoring period', 'security remediation'];
  return `<div class="chat-card wide">
    <h4>Negotiating a multi-issue agreement</h4>
    <div class="badge-row">${issues.map(i => `<span class="mini-badge conditional">${i}</span>`).join('')}</div>
    <div class="desc" style="margin-top:8px">proposal → counterproposal → concession → agreement</div>
  </div>`;
}

function finalAgreementCardHtml(revised) {
  return `<div class="adaptive-card ${revised ? 'revised' : ''}">
    <div class="ac-head">
      <div class="eyebrow">🤝 AGENT CONSENSUS</div>
      <h3>${revised ? 'CONDITIONAL GO — REVISED' : 'CONDITIONAL GO'}</h3>
      <div class="sub">Launch Feature X at 9:00 AM</div>
    </div>
    <div class="ac-body">
      <div class="ac-grid">
        <div class="ac-field"><div class="k">Component Y</div><div class="v off">DISABLED</div></div>
        <div class="ac-field"><div class="k">Feature flag</div><div class="v on">ENABLED</div></div>
        <div class="ac-field"><div class="k">Rollback</div><div class="v">${revised ? '20 min (full) · <1 min (flag)' : '7 minutes'}</div></div>
        <div class="ac-field"><div class="k">Monitoring</div><div class="v">${revised ? '90 minutes' : '60 minutes'}</div></div>
        <div class="ac-field"><div class="k">Security patch</div><div class="v warn">Required before full rollout</div></div>
        <div class="ac-field"><div class="k">Customer commitment</div><div class="v on">SATISFIED</div></div>
      </div>
      <div class="ac-divider"></div>
      <div class="ac-accept-list">
        <div class="ac-accept-row"><span class="name eng">Engineering Agent</span><span class="accept-pill">✓ ACCEPT</span></div>
        <div class="ac-accept-row"><span class="name sec">Security Agent</span><span class="accept-pill">✓ ACCEPT</span></div>
        <div class="ac-accept-row"><span class="name sup">Support Agent</span><span class="accept-pill">✓ ACCEPT</span></div>
        <div class="ac-accept-row"><span class="name prod">Product Agent</span><span class="accept-pill">✓ ACCEPT</span></div>
      </div>
      <div class="ac-consensus">Consensus: 4 / 4</div>
      <div class="ac-actions">
        <button class="primary" id="btn-approve-launch">Approve Launch</button>
        <button id="btn-challenge-reasoning">Challenge Reasoning</button>
        <button id="btn-change-constraint">Change Constraint</button>
      </div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------
// AFTER timeline
// ---------------------------------------------------------------

const afterSteps = [
  // 0: transition visual
  { run: async () => {
      setCollabState('Agents aligning…', true);
      addCentered(
        `<p><span class="bold">A2A allows the agents to communicate.</span></p>
         <p class="dim">IoC-Collaboration helps them establish what they mean, what they want, what they know, and what they can agree to.</p>`,
        'tagline-card'
      );
      setAfter({ messages: 1, tokens: 0.5 });
    }
  },
  // 1: phase 1 header
  { run: async () => {
      addPhaseDivider(1, 'SHARED ONTOLOGY', 'Do we mean the same thing?');
      setStage('discovered', 'done');
      setStage('ontology', 'active');
      setIntelBody(`<div class="intel-card"><h5>▸ Shared Ontology</h5><div class="desc">Each agent is publishing the concepts it reasons with, so IoC-Collaboration can negotiate a common mapping.</div></div>`);
    }
  },
  // 2: publish concepts
  { run: async () => {
      addChat('orch', ontologyPublishHtml());
      bumpAfter({ messages: 1, tokens: 1.2 });
    }
  },
  // 3: negotiate -> PAUSE (ontology convergence)
  { run: async () => {
      addSysNote('IoC-Collaboration negotiating concept mappings…');
      await sleep(500);
      setIntelBody(`<div class="intel-card"><h5>▸ Ontology convergence</h5><div class="progress-track"><div class="progress-fill" style="width:100%"></div></div><div class="desc">7 semantic conflicts → 0</div></div>`);
      bumpAfter({ messages: 1, tokens: 0.8 });
    },
    pause: 'ontology',
  },
  // 4: result
  { run: async () => {
      addChat('orch', ontologyResultHtml());
      bumpAfter({ messages: 1, tokens: 1.0, conflicts: -7 });
    }
  },
  // 5: confirm
  { run: async () => {
      addSysNote('✓ Agents established a shared definition of Launch Readiness.', true);
      setStage('ontology', 'done');
      setStage('intent', 'active');
    }
  },
  // 6: phase 2 header
  { run: async () => {
      addPhaseDivider(2, 'SHARED INTENT', 'What are we collectively trying to achieve?');
      setIntelBody(`<div class="intel-card"><h5>▸ Shared Intent</h5><div class="desc">Negotiating objectives and constraints across all four agents.</div></div>`);
    }
  },
  // 7: initial intents
  { run: async () => {
      addChat('orch', intentInitialHtml());
      bumpAfter({ messages: 1, tokens: 1.0 });
    }
  },
  // 8: convergence animation
  { run: async () => {
      const card = addCentered(`<h5 style="margin:0 0 6px;font-size:11.5px;text-transform:uppercase;color:var(--wx-text-faint)">Intent convergence</h5><div class="progress-track" style="width:320px"><div class="progress-fill" id="intent-fill"></div></div><div id="intent-pct" style="text-align:center;font-weight:800;margin-top:4px">25%</div>`, 'chat-card');
      const fill = card.querySelector('#intent-fill');
      const pct = card.querySelector('#intent-pct');
      const steps = [25, 48, 72, 96];
      for (const p of steps) {
        fill.style.width = p + '%';
        pct.textContent = p + '%';
        await sleep(450);
      }
      bumpAfter({ messages: 2, tokens: 1.4 });
    }
  },
  // 9: result
  { run: async () => {
      addChat('orch', intentResultHtml());
      bumpAfter({ messages: 1, tokens: 1.1 });
    }
  },
  // 10: confirm
  { run: async () => {
      addSysNote('✓ Shared intent established.', true);
      setStage('intent', 'done');
      setStage('context', 'active');
    }
  },
  // 11: phase 3 header
  { run: async () => {
      addPhaseDivider(3, 'SHARED CONTEXT', 'Are we reasoning from the same facts?');
      setIntelBody(`<div class="intel-card"><h5>▸ Shared Context</h5><div class="desc">4 conflicting facts identified across agents. Resolving by provenance.</div></div>`);
    }
  },
  // 12: conflict table
  { run: async () => {
      addChat('orch', conflictTableHtml());
      bumpAfter({ messages: 1, tokens: 1.6 });
    }
  },
  // 13: provenance -> PAUSE (context conflict)
  { run: async () => {
      addChat('orch', provenanceHtml());
      bumpAfter({ messages: 1, tokens: 1.0 });
    },
    pause: 'context',
  },
  // 14: resolutions
  { run: async () => {
      addSysNote('Resolved — Rollback = 7 minutes · Customer deadline = 12 PM · Component Y contains a critical vulnerability · Feature X does NOT require Component Y', true);
      bumpAfter({ messages: 1, tokens: 0.9, unresolved: -4 });
    }
  },
  // 15: summary
  { run: async () => {
      addChat('orch', contextSummaryHtml());
      bumpAfter({ messages: 1, tokens: 1.3 });
    }
  },
  // 16: confirm
  { run: async () => {
      addSysNote('✓ Agents now share the same situational model.', true);
      setStage('context', 'done');
      setStage('reasoning', 'active');
    }
  },
  // 17: phase 4 header
  { run: async () => {
      addPhaseDivider(4, 'SHARED REASONING', 'Given the same meaning, intent and facts, what action can everyone accept?');
      setIntelBody(`<div class="intel-card"><h5>▸ Shared Reasoning</h5><div class="desc">Agents propose directly to each other — no orchestrator relay.</div></div>`);
    }
  },
  // 18: security proposal
  { run: async () => {
      await typingThen('sec', () => `<span class="verdict-badge nogo">NO-GO</span><p>Component Y creates unacceptable exposure.</p>`);
      bumpAfter({ messages: 1, tokens: 0.8, rounds: 1 });
    }
  },
  // 19: engineering counterproposal
  { run: async () => {
      await typingThen('eng', () => `<span class="verdict-badge limited">LIMITED LAUNCH</span><p>Disable Component Y. Deploy Feature X independently.</p>`);
      bumpAfter({ messages: 1, tokens: 0.9, rounds: 1 });
    }
  },
  // 20: security conditional accept
  { run: async () => {
      await typingThen('sec', () => `<span class="verdict-badge conditional">CONDITIONAL ACCEPT</span><p>Requires isolation of Component Y.</p>`);
      bumpAfter({ messages: 1, tokens: 0.7, rounds: 1 });
    }
  },
  // 21: support conditional accept
  { run: async () => {
      await typingThen('sup', () => `<span class="verdict-badge conditional">CONDITIONAL ACCEPT</span><p>Requires feature flag and rollback &lt;10 min.</p>`);
      bumpAfter({ messages: 1, tokens: 0.7, rounds: 1 });
    }
  },
  // 22: product accept
  { run: async () => {
      await typingThen('prod', () => `<span class="verdict-badge go">ACCEPT</span><p>Feature X satisfies today's customer commitment.</p>`);
      bumpAfter({ messages: 1, tokens: 0.6, rounds: 1 });
    }
  },
  // 23: multi-issue negotiation viz -> PAUSE (negotiated agreement)
  { run: async () => {
      addChat('orch', reasoningIssuesHtml());
      bumpAfter({ messages: 1, tokens: 1.2, rounds: 1 });
    },
    pause: 'agreement',
  },
  // 24: final agreement card
  { run: async () => {
      addCentered(finalAgreementCardHtml(false), '');
      wireAgreementButtons();
      setStage('reasoning', 'done');
      setStage('agreement', 'active');
      setTimeout(() => setStage('agreement', 'done'), 600);
      setAfter(Object.assign({}, AFTER_FINAL, { messages: AFTER_FINAL.messages, tokens: AFTER_FINAL.tokens, agreement: AFTER_FINAL.agreement, confidence: AFTER_FINAL.confidence, reuse: AFTER_FINAL.reuse, dup: AFTER_FINAL.dup, cost: AFTER_FINAL.cost, conflicts: 0, unresolved: 0 }));
      state.afterComplete = true;
      setCollabState('Agents aligned', true);
      setIntelBody(`<div class="intel-card"><h5>✅ Agreement reached</h5><div class="kv"><span class="k">Consensus</span><span class="v" style="color:var(--wx-green)">4 / 4</span></div><div class="kv"><span class="k">Confidence</span><span class="v">94%</span></div></div>`);
    }
  },
  // 25: before/after metrics -> PAUSE
  { run: async () => {
      addSysNote(PAUSE_MESSAGES.metrics);
      addChat('orch', metricsCompareCardHtml());
    },
    pause: 'metrics',
  },
  // 26: final screen
  { run: async () => {
      showFinalScreen();
    }
  },
];

function metricsCompareCardHtml() {
  const b = BEFORE_FINAL, a = AFTER_FINAL;
  return `<div class="chat-card wide">
    <h4>Before vs. After</h4>
    <div class="stat-row">
      <div class="stat"><b style="color:var(--sec)">${b.messages} → ${a.messages}</b>Messages</div>
      <div class="stat"><b style="color:var(--sec)">${b.tokens}K → ${a.tokens}K</b>Tokens</div>
      <div class="stat"><b style="color:var(--sec)">$${b.cost} → $${a.cost}</b>Est. cost</div>
      <div class="stat"><b style="color:var(--sec)">${b.dup}% → ${a.dup}%</b>Context duplicated</div>
      <div class="stat"><b style="color:var(--wx-green)">${b.agreement} → ${a.agreement}</b>Consensus</div>
      <div class="stat"><b style="color:var(--wx-green)">${b.confidence}% → ${a.confidence}%</b>Confidence</div>
    </div>
    <div class="badge-row" style="margin-top:10px">
      <span class="mini-badge conditional">55% fewer messages</span>
      <span class="mini-badge conditional">56% fewer tokens</span>
      <span class="mini-badge conditional">56% lower cost</span>
      <span class="mini-badge conditional">71% less duplicated context</span>
      <span class="mini-badge go">100% agent consensus</span>
    </div>
    <div class="desc" style="margin-top:8px;font-style:italic">Simulated demo metrics — not measured production benchmarks. Open the Metrics panel for the full breakdown.</div>
  </div>`;
}

function wireAgreementButtons() {
  const approve = document.getElementById('btn-approve-launch');
  const challenge = document.getElementById('btn-challenge-reasoning');
  const change = document.getElementById('btn-change-constraint');
  if (approve) approve.onclick = () => {
    addSysNote('✅ Launch approved by human operator.', true);
    approve.disabled = true;
  };
  if (challenge) challenge.onclick = () => {
    composerInput.value = 'Why does Security disagree?';
    handleComposerSend();
  };
  if (change) change.onclick = () => {
    composerInput.value = 'What if rollback takes 20 minutes?';
    handleComposerSend();
  };
}

// ---------------------------------------------------------------
// Engine
// ---------------------------------------------------------------

function currentSteps() {
  return state.mode === 'before' ? beforeSteps : afterSteps;
}
function currentIdx() {
  return state.mode === 'before' ? state.beforeIdx : state.afterIdx;
}

function updateControlAvailability() {
  const steps = currentSteps();
  const idx = currentIdx();
  const atEnd = idx >= steps.length;
  btnAdvance.disabled = atEnd || state.busy;
  btnAdvance.classList.toggle('ctrl-btn--advance-glow', !atEnd && !state.busy && !state.autoplay);
  btnBefore.classList.toggle('active', state.mode === 'before');
  btnNegmas.classList.toggle('active', state.mode === 'after');
  btnNegmas.disabled = state.busy || state.mode === 'after';
  if (state.mode === 'after') btnNegmas.classList.remove('spotlight');
}

// advance() captures the mode + step index it started with, and a reset
// "generation" token, so a concurrent mode switch (e.g. clicking "Enable
// IoC-Collaboration" while a BEFORE step is still mid-animation) or a Reset fired
// while a step is in flight can never make it write into the wrong
// counter or clobber freshly-reset state.
async function advance() {
  if (state.busy) return;
  const mode = state.mode;
  const steps = mode === 'before' ? beforeSteps : afterSteps;
  const idx = mode === 'before' ? state.beforeIdx : state.afterIdx;
  if (idx >= steps.length) return;
  state.busy = true;
  const myGen = state.gen;
  hidePauseBanner();
  updateControlAvailability();
  const step = steps[idx];
  try {
    await step.run();
  } catch (e) {
    console.error(e);
  }
  if (state.gen !== myGen) return; // superseded by a Reset while this step was running
  if (mode === 'before') state.beforeIdx = idx + 1; else state.afterIdx = idx + 1;
  state.busy = false;
  updateControlAvailability();
  if (step.pause) {
    pauseForBeat(step.pause);
  }
}

function pauseForBeat(key) {
  stopAutoplay();
  showPauseBanner(PAUSE_MESSAGES[key] || 'Paused for discussion');
}

function showPauseBanner(text) {
  pauseTextEl.textContent = text;
  pauseBannerEl.hidden = false;
}
function hidePauseBanner() {
  pauseBannerEl.hidden = true;
}

function startAutoplay() {
  if (state.autoplay) return;
  state.autoplay = true;
  btnAutoplay.textContent = '⏸ Pause';
  btnAutoplay.classList.add('active');
  scheduleNextAutoplay();
}
function stopAutoplay() {
  state.autoplay = false;
  btnAutoplay.textContent = '▶ Auto Play';
  btnAutoplay.classList.remove('active');
  if (state.autoplayTimer) { clearTimeout(state.autoplayTimer); state.autoplayTimer = null; }
}
function scheduleNextAutoplay() {
  if (!state.autoplay) return;
  const delay = 6000 + Math.random() * 2000;
  state.autoplayTimer = setTimeout(async () => {
    if (!state.autoplay) return;
    const steps = currentSteps();
    const idx = currentIdx();
    if (idx >= steps.length) {
      if (state.mode === 'before' && state.beforeComplete) {
        enableNegmas();
        scheduleNextAutoplay();
        return;
      }
      stopAutoplay();
      return;
    }
    await advance();
    if (state.autoplay) scheduleNextAutoplay();
  }, delay);
}
function toggleAutoplay() {
  if (state.autoplay) stopAutoplay(); else startAutoplay();
}

function enableNegmas() {
  if (state.mode === 'after' || state.busy) return;
  stopAutoplay();
  state.mode = 'after';
  if (!state.beforeComplete) {
    // jumped straight to AFTER: freeze BEFORE numbers for later comparison
    setBefore(Object.assign({}, BEFORE_FINAL, { time: BEFORE_FINAL.time }));
    state.beforeComplete = true;
  }
  document.body.classList.add('mode-after');
  renderMiniMetrics();
  updateControlAvailability();
  renderQuickReplies();
  advance();
}

function goBeforeMode() {
  resetDemo();
}

// ---------------------------------------------------------------
// Metrics modal
// ---------------------------------------------------------------

function openMetrics() {
  const body = document.getElementById('metrics-modal-body');
  const b = state.beforeComplete ? BEFORE_FINAL : state.before;
  const a = state.afterComplete ? AFTER_FINAL : state.after;
  const showDelta = state.afterComplete;
  body.innerHTML = `
    <div class="metrics-compare-grid">
      <div class="metrics-col before">
        <h3>BEFORE · A2A + Orchestrator</h3>
        <div class="m-row"><span>Messages</span><span class="v">${b.messages}</span></div>
        <div class="m-row"><span>Agent round trips</span><span class="v">${b.roundtrips !== undefined ? b.roundtrips : '—'}</span></div>
        <div class="m-row"><span>Tokens</span><span class="v">${(b.tokens || 0).toFixed(1)}K</span></div>
        <div class="m-row"><span>Estimated cost</span><span class="v">$${(b.cost || 0).toFixed(2)}</span></div>
        <div class="m-row"><span>Context duplicated</span><span class="v">${b.dup || 0}%</span></div>
        <div class="m-row"><span>Conflicting concepts</span><span class="v">${b.conflicts || 0}</span></div>
        <div class="m-row"><span>Unresolved facts</span><span class="v">${b.unresolved || 0}</span></div>
        <div class="m-row"><span>Agent agreement</span><span class="v">${b.agreement}</span></div>
        <div class="m-row"><span>Decision confidence</span><span class="v">${b.confidence != null ? b.confidence + '%' : '—'}</span></div>
        <div class="m-row"><span>Time to decision</span><span class="v">${b.time || '—'}</span></div>
      </div>
      <div class="metrics-col after">
        <h3>AFTER · A2A + IoC-Collaboration</h3>
        <div class="m-row"><span>Messages</span><span class="v">${a.messages}</span></div>
        <div class="m-row"><span>Negotiation rounds</span><span class="v">${a.rounds !== undefined ? a.rounds : '—'}</span></div>
        <div class="m-row"><span>Tokens</span><span class="v">${(a.tokens || 0).toFixed(1)}K</span></div>
        <div class="m-row"><span>Estimated cost</span><span class="v">$${(a.cost || 0).toFixed(2)}</span></div>
        <div class="m-row"><span>Context duplicated</span><span class="v">${a.dup || 0}%</span></div>
        <div class="m-row"><span>Semantic conflicts</span><span class="v">${a.conflicts || 0}</span></div>
        <div class="m-row"><span>Unresolved facts</span><span class="v">${a.unresolved || 0}</span></div>
        <div class="m-row"><span>Consensus</span><span class="v">${a.agreement}</span></div>
        <div class="m-row"><span>Decision confidence</span><span class="v">${a.confidence != null ? a.confidence + '%' : '—'}</span></div>
      </div>
    </div>
    ${showDelta ? `<div class="delta-strip">
      <div class="delta-chip"><div class="num">55%</div><div class="lbl">fewer messages</div></div>
      <div class="delta-chip"><div class="num">56%</div><div class="lbl">fewer tokens</div></div>
      <div class="delta-chip"><div class="num">56%</div><div class="lbl">lower inference cost</div></div>
      <div class="delta-chip"><div class="num">71%</div><div class="lbl">less duplicated context</div></div>
      <div class="delta-chip"><div class="num">100%</div><div class="lbl">agent consensus</div></div>
    </div>` : `<div class="sim-note">Complete the negotiation to see the full before/after comparison.</div>`}
    <div class="sim-note">All figures are illustrative, simulated prototype metrics — not measured production benchmarks.</div>
    <div class="token-viz">
      <h3>Why fewer tokens?</h3>
      <div class="token-viz-cols">
        <div class="token-viz-col">
          <h4>Before</h4>
          <div class="desc" style="font-size:11.5px;color:var(--wx-text-soft);margin-bottom:6px">Each agent repeatedly receives:</div>
          <div class="token-block">goal + conversation + other-agent summaries + clarification + context</div>
          <div class="token-block">goal + conversation + other-agent summaries + clarification + context</div>
          <div class="token-block">goal + conversation + other-agent summaries + clarification + context</div>
        </div>
        <div class="token-viz-col">
          <h4>After</h4>
          <div class="desc" style="font-size:11.5px;color:var(--wx-text-soft);margin-bottom:6px">Agents establish reusable shared artifacts:</div>
          <div class="artifact-row"><div class="artifact-letter">O</div><div class="artifact-desc">Shared Ontology</div></div>
          <div class="artifact-row"><div class="artifact-letter">I</div><div class="artifact-desc">Shared Intent</div></div>
          <div class="artifact-row"><div class="artifact-letter">C</div><div class="artifact-desc">Shared Context</div></div>
          <div class="artifact-row"><div class="artifact-letter">R</div><div class="artifact-desc">Shared Reasoning</div></div>
          <div class="desc" style="font-size:11.5px;color:var(--wx-text-soft);margin:6px 0">Then agents exchange:</div>
          <div class="token-block" style="background:var(--wx-green-bg);border-color:#bfe6cd;color:var(--wx-green)">proposal + delta + reason</div>
          <div class="reuse-indicator">Context reused: ${state.afterComplete ? AFTER_FINAL.reuse : 0}%</div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('metrics-modal').hidden = false;
}

// ---------------------------------------------------------------
// Architecture modal
// ---------------------------------------------------------------

function archNodeStyle(left, top, extra) {
  return `left:${left}px;top:${top}px;${extra || ''}`;
}

function lineStyle(x1, y1, x2, y2, cls) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ang = Math.atan2(dy, dx) * 180 / Math.PI;
  return `<div class="arch-line ${cls || ''}" style="left:${x1}px;top:${y1}px;width:${len}px;transform:rotate(${ang}deg)"></div>`;
}

const ARCH_POS = {
  eng: { x: 75, y: 50, l: 20, t: 20 },
  sec: { x: 445, y: 50, l: 390, t: 20 },
  sup: { x: 75, y: 310, l: 20, t: 280 },
  prod: { x: 445, y: 310, l: 390, t: 280 },
  center: { x: 260, y: 180 },
};

function renderArchitectureBefore() {
  const p = ARCH_POS;
  return `
    <div class="arch-top-banner">Webex — Human collaboration + governance</div>
    <div class="arch-canvas">
      ${lineStyle(p.eng.x, p.eng.y, p.center.x, p.center.y)}
      ${lineStyle(p.sec.x, p.sec.y, p.center.x, p.center.y)}
      ${lineStyle(p.sup.x, p.sup.y, p.center.x, p.center.y)}
      ${lineStyle(p.prod.x, p.prod.y, p.center.x, p.center.y)}
      <div class="arch-node" style="${archNodeStyle(p.eng.l, p.eng.t)};background:var(--eng)">Engineering<span class="sub">Agent</span></div>
      <div class="arch-node" style="${archNodeStyle(p.sec.l, p.sec.t)};background:var(--sec)">Security<span class="sub">Agent</span></div>
      <div class="arch-node" style="${archNodeStyle(p.sup.l, p.sup.t)};background:var(--sup)">Support<span class="sub">Agent</span></div>
      <div class="arch-node" style="${archNodeStyle(p.prod.l, p.prod.t)};background:var(--prod)">Product<span class="sub">Agent</span></div>
      <div class="arch-node center" style="left:150px;top:135px">LaunchAgent<span class="sub">Orchestrator</span></div>
    </div>
    <div class="arch-caption">
      <div class="label">Hub-and-spoke reasoning</div>
      <div class="problems">repeated context &middot; semantic translation &middot; central interpretation &middot; no explicit consensus</div>
    </div>
  `;
}

function renderArchitectureAfter() {
  const p = ARCH_POS;
  return `
    <div class="arch-top-banner">Webex — Human collaboration + governance</div>
    <div class="arch-canvas">
      ${lineStyle(p.eng.x, p.eng.y, p.center.x, p.center.y, 'after')}
      ${lineStyle(p.sec.x, p.sec.y, p.center.x, p.center.y, 'after')}
      ${lineStyle(p.sup.x, p.sup.y, p.center.x, p.center.y, 'after')}
      ${lineStyle(p.prod.x, p.prod.y, p.center.x, p.center.y, 'after')}
      <div class="arch-node" style="${archNodeStyle(p.eng.l, p.eng.t)};background:var(--eng)">Engineering<span class="sub">Agent</span></div>
      <div class="arch-node" style="${archNodeStyle(p.sec.l, p.sec.t)};background:var(--sec)">Security<span class="sub">Agent</span></div>
      <div class="arch-node" style="${archNodeStyle(p.sup.l, p.sup.t)};background:var(--sup)">Support<span class="sub">Agent</span></div>
      <div class="arch-node" style="${archNodeStyle(p.prod.l, p.prod.t)};background:var(--prod)">Product<span class="sub">Agent</span></div>
      <div class="arch-node center negmas" style="left:147px;top:132px">IoC-Collaboration
        <div class="arch-layers">
          <div class="arch-layer-chip">Shared Ontology</div>
          <div class="arch-layer-chip">Shared Intent</div>
          <div class="arch-layer-chip">Shared Context</div>
          <div class="arch-layer-chip">Shared Reasoning</div>
        </div>
      </div>
    </div>
    <div class="arch-caption">
      <div class="label">Negotiated multi-agent cognition</div>
      <div class="problems">agents publish intent &middot; concepts &middot; claims &middot; constraints &middot; utility &middot; proposals &middot; reasons — and consume the negotiated shared state</div>
    </div>
  `;
}

function openArchitecture() {
  state.archTab = state.mode === 'after' ? 'after' : 'before';
  renderArchitectureModal();
  document.getElementById('architecture-modal').hidden = false;
}

function renderArchitectureModal() {
  const body = document.getElementById('architecture-modal-body');
  body.innerHTML = `
    <div class="arch-tabs">
      <button class="arch-tab ${state.archTab === 'before' ? 'active' : ''}" data-tab="before">BEFORE: A2A Orchestration</button>
      <button class="arch-tab ${state.archTab === 'after' ? 'active' : ''}" data-tab="after">AFTER: A2A + IoC-Collaboration</button>
    </div>
    <div class="arch-diagram">${state.archTab === 'before' ? renderArchitectureBefore() : renderArchitectureAfter()}</div>
  `;
  body.querySelectorAll('.arch-tab').forEach(btn => {
    btn.onclick = () => { state.archTab = btn.dataset.tab; renderArchitectureModal(); };
  });
}

// ---------------------------------------------------------------
// Final screen
// ---------------------------------------------------------------

function showFinalScreen() {
  const overlay = document.createElement('div');
  overlay.className = 'final-overlay';
  overlay.innerHTML = `
    <div class="final-content">
      <h2>Communication ≠ Collaboration</h2>
      <div class="final-compare">
        <div class="final-col">
          <h3>A2A</h3>
          <ul>
            <li>Agents can discover each other.</li>
            <li>Agents can communicate.</li>
            <li>Agents can delegate work.</li>
          </ul>
        </div>
        <div class="final-eq">+</div>
        <div class="final-col">
          <h3>IoC-Collaboration</h3>
          <ul>
            <li>Agents align meaning.</li>
            <li>Agents expose intent.</li>
            <li>Agents reconcile context.</li>
            <li>Agents negotiate reasoning.</li>
            <li>Agents reach explicit agreement.</li>
          </ul>
        </div>
      </div>
      <div class="final-arrow">=</div>
      <h2 style="font-size:22px;margin-bottom:18px">From Agent Communication to Agent Consensus</h2>
      <div class="final-flow">Shared Ontology → Shared Intent → Shared Context → Shared Reasoning → Agreement</div>
      <div class="final-quote">
        <p>“Four independently reasoning agents entered this space with four different definitions of ‘ready.’”</p>
        <p>“They leave with one agreement — and a shared understanding of why.”</p>
      </div>
      <button class="final-close" id="final-close-btn">Close</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('final-close-btn').onclick = () => overlay.remove();
}

// ---------------------------------------------------------------
// Composer / human interaction
// ---------------------------------------------------------------

const QUICK_REPLIES_BEFORE = [
  'Why does Security disagree?',
];
const QUICK_REPLIES_AFTER = [
  'Why does Security disagree?',
  'What would make this a full GO?',
  'What if rollback takes 20 minutes?',
];

function renderQuickReplies() {
  const list = state.mode === 'after' ? QUICK_REPLIES_AFTER : QUICK_REPLIES_BEFORE;
  quickRepliesEl.innerHTML = list.map(q => `<div class="quick-reply-chip">${q}</div>`).join('');
  quickRepliesEl.querySelectorAll('.quick-reply-chip').forEach(chip => {
    chip.onclick = () => { composerInput.value = chip.textContent; handleComposerSend(); };
  });
}

function handleComposerSend() {
  const text = composerInput.value.trim();
  if (!text) return;
  addChat('human', `<p>${escapeHtml(text)}</p>`);
  composerInput.value = '';
  const lower = text.toLowerCase();

  if (lower.includes('rollback') && lower.includes('20')) {
    handleRollbackMutation();
  } else if (lower.includes('full go') || lower.includes('a full go')) {
    setTimeout(() => addChat('orch', '<p>Security Agent requires Component Y to be patched and rescanned.</p>'), 500);
  } else if (lower.includes('security') && lower.includes('disagree')) {
    setTimeout(() => {
      if (state.mode === 'after') {
        addChat('sec', '<p>Originally: Component Y carried a critical vulnerability, discovered 12 minutes before the readiness check. That’s now part of our Shared Context. We agreed to launch only because Component Y is disabled and isolated from Feature X in this release.</p>');
      } else {
        addChat('sec', '<p>Component Y has a critical vulnerability. Security approval denied.</p>');
      }
    }, 500);
  } else {
    setTimeout(() => addChat('orch', `<p>Noted. Try one of the suggested questions above, or Advance the story to see how the agents respond.</p>`), 500);
  }
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function handleRollbackMutation() {
  if (state.mode !== 'after' || !state.afterComplete) {
    setTimeout(() => addChat('orch', '<p>That would need to be confirmed with Engineering and Support before we can assess impact.</p>'), 500);
    return;
  }
  await sleep(400);
  const flash = addCentered('<b>rollback: 7 → 20 minutes</b>', 'sys-note flash-context strong');
  await sleep(500);
  addCentered(`<h4 style="margin:0 0 4px">⚠ AGREEMENT INVALIDATED</h4><div class="desc" style="font-size:12.5px">Shared context changed — the current agreement no longer satisfies its constraints.</div>`, 'warn-card');
  await sleep(500);
  addChat('sup', '<span class="verdict-badge nogo">WITHDRAW</span><p>Withdrawing acceptance — rollback exceeds our 10 minute threshold.</p>');
  setAfter({ agreement: '3 / 4', confidence: null });
  await sleep(400);
  addChat('sec', '<span class="verdict-badge nogo">WITHDRAW</span><p>Withdrawing acceptance — the extended rollback window increases exposure during the incident window.</p>');
  setAfter({ agreement: '2 / 4' });
  await sleep(500);
  setStage('agreement', 'active');
  state.negotiationCount++;
  addSysNote('Renegotiating because shared context changed…');
  await sleep(1200);
  addChat('eng', '<span class="verdict-badge limited">COUNTERPROPOSAL</span><p>Add an instant feature-flag kill-switch (&lt;1 min) as the primary mitigation. Full rollback (20 min) becomes a fallback, not the safety net.</p>');
  await sleep(500);
  addChat('sec', '<span class="verdict-badge conditional">CONDITIONAL ACCEPT</span><p>Acceptable, if monitoring extends to cover the longer fallback window.</p>');
  await sleep(400);
  addChat('sup', '<span class="verdict-badge conditional">CONDITIONAL ACCEPT</span><p>Acceptable with the kill-switch as primary control.</p>');
  await sleep(400);
  addChat('prod', '<span class="verdict-badge go">ACCEPT</span><p>Feature X still ships today. No impact to the customer commitment.</p>');
  await sleep(500);
  addCentered(finalAgreementCardHtml(true), '');
  wireAgreementButtons();
  setStage('agreement', 'done');
  setAfter({ agreement: '4 / 4', confidence: 92 });
  bumpAfter({ messages: 8, tokens: 2.4, rounds: 1 });
  setIntelBody(`<div class="intel-card"><h5>♻ Renegotiated</h5><div class="kv"><span class="k">Renegotiations</span><span class="v">${state.negotiationCount}</span></div><div class="kv"><span class="k">Consensus</span><span class="v" style="color:var(--wx-green)">4 / 4</span></div><div class="desc" style="margin-top:6px">Only the changed fact and its consequences were re-negotiated — Shared Ontology, Intent and the rest of Shared Context stayed valid.</div></div>`);
}

// ---------------------------------------------------------------
// Reset
// ---------------------------------------------------------------

function resetDemo() {
  state.gen++;
  stopAutoplay();
  messagesEl.innerHTML = '';
  quickRepliesEl.innerHTML = '';
  hidePauseBanner();
  document.body.classList.remove('mode-after');
  btnNegmas.classList.remove('spotlight');

  state.mode = 'before';
  state.beforeIdx = 0;
  state.afterIdx = 0;
  state.busy = false;
  state.stageStatus = { discovered: 'active', ontology: 'pending', intent: 'pending', context: 'pending', reasoning: 'pending', agreement: 'pending' };
  state.before = { messages: 1, tokens: 0.4, cost: 0.01, roundtrips: 0, dup: 0, conflicts: 0, unresolved: 0, agreement: '—', confidence: null, time: '0:00' };
  state.beforeComplete = false;
  state.after = { messages: 0, tokens: 0, cost: 0, rounds: 0, dup: 0, conflicts: 7, unresolved: 4, agreement: '—', confidence: null, reuse: 0 };
  state.afterComplete = false;
  state.negotiationCount = 0;
  state.dupDetail = { eng: 0, sec: 0, sup: 0, prod: 0 };
  state.clock = { h: 8, m: 52 };

  document.querySelectorAll('.final-overlay').forEach(n => n.remove());

  renderStageTracker();
  setCollabState('Agents communicating', false);
  renderMiniMetrics();
  renderQuickReplies();
  updateControlAvailability();

  addChat('human', '<p><b>@LaunchAgent</b> Are we GO for Project Nova at 9 AM?</p>');
  setIntelBody(`<div class="intel-card"><h5>▸ Discovered</h5><div class="desc">4 A2A agents discovered in this space: Engineering, Security, Support, Product. Awaiting the orchestrator's query.</div></div>`);
}

// ---------------------------------------------------------------
// Wire up controls
// ---------------------------------------------------------------

btnReset.onclick = () => resetDemo();
btnBefore.onclick = () => goBeforeMode();
btnNegmas.onclick = () => enableNegmas();
btnAdvance.onclick = () => advance();
btnAutoplay.onclick = () => toggleAutoplay();
btnMetrics.onclick = () => openMetrics();
btnArchitecture.onclick = () => openArchitecture();
composerSend.onclick = () => handleComposerSend();
composerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleComposerSend(); });

document.querySelectorAll('.modal-close').forEach(btn => {
  btn.onclick = () => { document.getElementById(btn.dataset.close).hidden = true; };
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.hidden = true; });
});
document.getElementById('pause-continue').onclick = () => { hidePauseBanner(); };

// ---------------------------------------------------------------
// Init
// ---------------------------------------------------------------

renderParticipants();
resetDemo();
