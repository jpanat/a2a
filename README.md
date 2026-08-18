# CSP Negotiation Demo

A local demo of two AI agents negotiating a cross-company meeting time - once
with plain, unstructured message-passing, and once through a **Cognition
State Protocol (CSP)**: a semantic coordination layer with three properties -
**shared intent**, **shared ontology/context**, and **shared reasoning**.

The scenario: Riya (Outshift by Cisco, Outlook + Webex Scheduler) emails
Grace (Microsoft, Outlook + Microsoft Copilot) to find time for a sync.
Instead of humans going back and forth, each side's scheduling agent
negotiates on their behalf. The demo lets you compare what that negotiation
looks like with and without a shared protocol.

Two scenarios are seeded, covering both topologies the app supports:

- **Cross-company, different vendors** - `outshift-microsoft-api-review`:
  Outshift by Cisco (Webex) negotiating with Microsoft (Copilot) - the real
  pairing this demo is built to pitch.
- **Intra-company, same vendor** - `cisco-internal-standup-prep`: two Cisco
  employees in different business units (Outshift and Cisco Security), both
  on Webex. No vendor to blame, no vocabulary to translate - this scenario
  isolates how much of CSP's value comes purely from shared intent and joint
  reasoning, independent of the ontology-translation story.

An earlier iteration of this demo also seeded four Northwind-branded
scenarios (Fenwick Partners, Solace Health, Bramwell & Vance, Orbit
Logistics) to show a trust-gate escalation and a notice-period escalation
specifically. Those were removed to keep the app focused on the Cisco/
Microsoft storyline the demo is actually for - the underlying mechanics
(trust gating in `engine/stages.ts`'s `discoveryStage`, notice-period checks
in `engine/withIoc.ts`) are unchanged and still exercised by the Live
Protocol view's Drift, Loop, and Emergent-Conflict demos; there just isn't a
dedicated preset scenario for the trust-gate case at the moment.

Everything is simulated - there are no real Webex, Microsoft Graph, or
Copilot API calls. Calendars, org data, and the email thread are all
in-memory mock data.

## Running it

```bash
npm install
npm run dev
```

Then open **http://localhost:4173**. Everything runs from one process (a
single Express server, in-memory state, no database, no build step for the
frontend).

**Watch the negotiation in the terminal too.** Every time a negotiation runs
(clicking "Negotiate with agent" in the Inbox, picking a scenario in Compare,
or hitting "Run comparison" in the Conflict Lab), the full agent-to-agent
transcript is also printed to the same terminal running `npm run dev` -
round/stage/speaker and the full message text, color-coded (cyan for
ordinary exchange, magenta for ontology/intent grounding, green for
resolution, red for escalation), finishing with the outcome and timing. The
one-off startup seeding (12 historical negotiations) prints one summary line
each instead of a full dump, so it doesn't flood the console. Turn transcript
logging off with `LOG_TRANSCRIPTS=false npm run dev`; set `NO_COLOR=1` to
keep the log but drop the ANSI colors.

Optional: to have the "with-IoC" mode's resolution explanation written by a
real LLM call instead of a template, set:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export USE_LLM_REASONING=true
npm run dev
```

Without those two variables set, everything runs on rule-based logic only -
this is also the default and doesn't require any network access or API key.
The LLM is only ever used to narrate a scheduling decision that has already
been made deterministically (see [Simulated vs. real](#simulated-vs-real)
below) - it never decides which slot to book.

## The six views

- **Inbox** (`#/end-user`) - a mock Outlook thread with the scheduling ask.
  "Add Webex meeting" is a stub (this demo doesn't build a real
  scheduling UI). "Negotiate with agent" runs the full with-IoC negotiation
  and shows the result as an inline suggestion card - proposed time, why it
  matches, an "Accept and send invite" button, and an expandable full
  transcript. Accepting shows a mock calendar-invite confirmation with a
  Webex join link.
- **Compare modes** (`#/compare`) - the centerpiece for a live demo. Pick a
  scenario and see: the user story this negotiation exists to serve; a small
  diagram of where each agent actually lives (two separate org tenants
  joined by a CSP trust channel for cross-company scenarios, or a single
  tenant with two agents reasoning directly for the intra-company one); a
  KPI strip computed from the two runs (rounds, time saved, and a plain-
  English headline - "Escalation avoided", "Same outcome, N fewer round-
  trips", or "CSP correctly stopped a booking the baseline would have made
  blindly" when CSP's *correct* answer is to escalate and the baseline's
  "success" was actually an ungoverned or policy-violating booking); and the
  full side-by-side transcripts, colored for a quick "this one worked, this
  one didn't" read from across a room.
- **Live Protocol** (`#/protocol`) - the actual agent-to-agent protocol trace,
  streamed into the page rather than dumped all at once, plus three dynamics
  that don't show up in the other views. See
  [Live Protocol: four dynamics](#live-protocol-four-dynamics) below.
- **Conflict Lab** (`#/lab`) - a live editor, not another fixture. Load any
  preset as a starting point (or start blank), then edit either agent's
  calendar row by row (add/remove busy, tentative-hold/focus-time, or free
  blocks on any day/time), edit the stated windows and the real vs. naively-
  assumed duration, flip intra-org vs. cross-company, pick any partner org
  (its live trust status comes straight from the Admin view), and hit "Run
  comparison." That call goes to `POST /api/compare/custom`, which validates
  your input and runs it through the *exact same* `runWithoutIoc` /
  `runWithIoc` functions as every preset scenario - there's no scripted
  branch for "custom" scenarios, so whatever conflict you build gets
  reasoned over live. This is the place to convince yourself the engine is
  real: build a calendar clash that's never existed in this codebase before
  and watch both modes work it out.
- **Admin** (`#/admin`) - connected organizations and their trust status
  (with an approve/revoke action), a data-sharing policy panel with live
  toggles (free/busy, priority tier, meeting titles & attendees, human
  approval before send), an audit log of past negotiations with a
  transcript viewer, and summary metrics computed from the actual
  in-memory negotiation history (not hardcoded).
- **Negotiation engine** (`server/src/engine/`) - the actual logic, kept
  independent of Express and the UI (see [Architecture](#architecture)).

## How the two modes differ

**Without IoC** (`server/src/engine/withoutIoc.ts`): each agent only ever
reasons about its own calendar, in its own vocabulary, one candidate slot at
a time. There's no shared notion of "this hold is soft and movable" - a
`tentative-hold` (Webex's term) or a `focus-time` block (Copilot's term) is
just as blocking to the *other* org's agent as a hard conflict, because
nothing tells it otherwise. There's also no shared intent object, so each
agent falls back to a generic default meeting length instead of the one
actually implied by the thread. The two agents propose and reject slots in
turns (round-robin, 4-6 rounds) until either one is accidentally free at the
same time as the other, or - a real, not-contrived outcome - they exhaust
every candidate in the stated windows and the negotiation escalates to the
humans.

**With IoC** (`server/src/engine/withIoc.ts`, stage builders shared from
`server/src/engine/stages.ts`) runs these explicit stages:

1. **Identity resolution** - before anything else, figure out *who's
   actually negotiating*: which agent/service identity represents each
   human sender, and which tenant's IAM it authenticates against. This runs
   even for the intra-org scenario (two employees still need two distinct
   agent identities resolved) - it's genuinely separate from step 2, which
   is about the *orgs'* relationship, not the *agents'* identities.
2. **Discovery & trust** - now that both identities are resolved, confirm a
   trust relationship exists between the two orgs (a lookup against a
   static trusted-orgs list). No trust, no negotiation - it escalates right
   here, before any calendar or intent data is exchanged.
3. **Shared ontology grounding** - each agent maps its own calendar
   vocabulary into one shared schema (`hard-busy` / `soft-busy` /
   `available`) before anything else happens. This step is shown explicitly
   in the transcript, e.g. `tentative-hold -> soft-busy`.
4. **Term alignment** - before locking anything into the shared intent
   object, both agents ground what its *ambiguous, qualitative* terms
   actually mean - the same failure mode ontology grounding fixes for
   calendar vocab, but applied to the request's own language instead of
   calendar status labels. "Medium" urgency gets an operational definition
   (should land within the stated windows this week, a short slip is
   tolerable), "required attendee" gets one too (don't book without them
   unless they explicitly decline), and each side's priority tier is named
   as a pre-agreed, org-level scale from federation setup - not something
   renegotiated per meeting. Skipping this is exactly how two agents can
   each silently assume a different meaning for "medium" and still both
   claim they're using the shared intent object correctly.
5. **Shared intent exchange** - with those terms grounded, both agents
   assemble one structured intent object from the email thread: goal,
   urgency, required attendees, duration.
6. **Joint constraint negotiation** - instead of proposing slots one at a
   time, the engine scores *every* candidate slot across *both* calendars in
   a single pass, in the shared schema, and can produce an option neither
   side stated explicitly (e.g. a slot 30 minutes shorter than the naive
   default, sitting on top of someone's soft-busy hold that the ontology
   confirms is movable).
7. **Resolution & write-back** - the winning slot gets "written" to both
   mock calendars and a join link is generated.

With-IoC mode does **not** always succeed - it's built with real failure
paths, not just a happy path with a facade. A partner org that isn't yet
trusted escalates at stage 2, before any calendar data is exchanged at all;
an ask whose deadline collides with a notice-period policy escalates at
stage 6, even after identity, ontology, and intent are all fully grounded.
Neither of the two seeded scenarios triggers these specific cases today (the
trust-gate and notice-period example scenarios were trimmed - see
[Live Protocol: four dynamics](#live-protocol-four-dynamics)), but both code
paths are real and reachable: flip Microsoft's trust status to "pending
review" in the admin view and rerun the flagship scenario, or build a
same-day, notice-violating ask in the Conflict Lab, and either one escalates
exactly as described.

## Live Protocol: four dynamics

The Live Protocol view (`#/protocol`) is Webex-agent-vs-Copilot-agent only
for now (it rejects the intra-org scenario). Every negotiation here is also
reprojected into an explicit **A2A protocol trace** - `server/src/engine/
protocol.ts` maps each transcript message onto an ACL-style frame
(`{ seq, performative, sender, receiver, protocol, content }`, performatives
like `PROPOSE` / `REJECT_PROPOSAL` / `CONFIRM` / `INFORM_ONTOLOGY` /
`FAILURE`) instead of just prose, and the UI streams those frames into the
page one at a time rather than dumping the whole thing at once, so it reads
like a live log. All four tabs run the real engine on request - nothing is
pre-recorded.

1. **Live A2A Trace** - the standard five-stage CSP negotiation (or the
   without-IoC baseline, via the toggle), shown as protocol frames.
2. **Drift & Correction** - the joint-negotiation pass here is deliberately
   "smarter but careless": it searches the *whole business week* for the
   best-scoring calendar fit instead of only the windows the humans actually
   stated (an honest failure mode - an agent optimizing a metric while
   quietly widening its own scope, not a calendar bug). A **cognition
   engine** stage then checks whatever it found against the original shared
   intent object; if it drifted outside the stated windows, it flags the
   drift explicitly and re-grounds to a compliant candidate before
   resolving. On the seeded Outshift/Microsoft scenario this reliably drifts
   to Monday morning (nobody defined Monday, so it defaults to fully free)
   before correcting back to the same Tuesday slot the standard flow finds -
   see `server/src/engine/cognitionEngine.ts`.
3. **Endless Loop → NegMAS** - both agents ground the same shared intent
   (discovery/ontology/intent all run normally), but the negotiation
   *strategy* is deliberately rigid: each side always re-offers its own
   single favorite slot instead of reasoning jointly. With two favorites
   that are each infeasible for the other side, that oscillates forever on
   its own - a loop detector catches the repeat and hands off to a
   lightweight, hand-rolled concession mediator modeled on NegMAS's
   alternating-offers protocol (per-candidate utilities, a monotonically
   conceding acceptance threshold across rounds). **This is a simulation of
   the idea, not the real NegMAS Python library** - a Node/TS app can't
   invoke it directly - and it's labeled as such everywhere it appears. See
   `server/src/engine/negmasMediator.ts`.
4. **T+1 Emergent Conflict** - runs the standard negotiation to agreement at
   T0, then clones the scenario and injects one new hard-busy calendar block
   for the requesting agent landing exactly on the slot just agreed to
   ("Sudden: urgent escalation call") - something neither agent could have
   known about at negotiation time - and re-runs the same engine at T+1. On
   the seeded scenario this automatically finds the next-best compliant slot
   30 minutes later; if nothing were left, it would escalate instead of
   silently keeping a now-invalid booking. See
   `server/src/engine/emergentConflict.ts`.

All three demo engines share the same candidate-scoring math as the standard
CSP flow (`server/src/engine/jointReasoning.ts`) and the same
discovery/ontology/intent stage builders (`server/src/engine/stages.ts`) - so
"drift", "loop", and "emergent conflict" aren't three different fake
scripts, they're the same reasoning primitives run with a different search
strategy or a mutated calendar.

## Seed data

`server/src/data/` seeds:

- 1 partner org (`server/src/data/orgs.ts`): Microsoft (trusted). "Home"
  orgs live alongside it in a separate `HOME_ORGS` registry (currently just
  Outshift by Cisco) - home orgs are "us" in a given scenario, not a partner
  to manage trust for, so they're deliberately kept out of the admin view's
  connected-organizations list. Toggling Microsoft's trust status in the
  admin view still exercises the same trust-gate code path the discovery
  stage checks (`engine/stages.ts`), it's just no longer paired with a
  dedicated seeded "starts out untrusted" scenario.
- 2 negotiation scenarios (`server/src/data/scenarios.ts`), each with its own
  email thread, calendars, and stated windows: the flagship cross-company
  case (baseline stalls and escalates on an ontology mismatch + naive
  duration default; CSP mode resolves it) and the intra-company case
  (isolates shared-intent + joint-reasoning value with no vendor mismatch
  possible).
- 6 historical negotiations (mixing modes, with a couple of realistic
  repeats - these two scenarios' participants plausibly negotiate more than
  once) are run through the real engine at server startup and backdated
  over the last ~2 weeks, so the admin audit log and metrics aren't empty on
  first run. Metrics on the admin page are computed from this data, not
  hardcoded.

## Architecture

```
server/src/
  types/domain.ts       shared types (Org, AgentProfile, NegotiationSession, ProtocolFrame, ...)
  engine/
    ontology.ts          local-vocab -> shared-schema mapping
    calendarUtil.ts       slot/date helpers
    jointReasoning.ts      shared candidate building + scoring (used by all four negotiation paths)
    stages.ts              shared discovery/ontology/intent stage builders
    reasoner.ts            pluggable explanation generator (rule-based | LLM)
    withoutIoc.ts          baseline negotiation
    withIoc.ts             five-stage CSP negotiation
    cognitionEngine.ts     drift-detection + realignment demo
    negmasMediator.ts      endless-loop detection + concession-mediator demo
    emergentConflict.ts    T0/T+1 sudden-calendar-event demo
    protocol.ts            transcript -> ACL-style protocol frame projection
    customScenario.ts      validates Conflict Lab input into a real NegotiationScenario
    index.ts              runNegotiation(scenario, mode, policy)
  data/
    orgs.ts, scenarios.ts  seed data
  store.ts               in-memory state: orgs, policy, negotiation audit log
  logger.ts              prints transcripts to the server console
  routes/api.ts          Express routes
  index.ts               server entrypoint
public/
  index.html, app.js, styles.css   plain HTML/JS SPA, hash-routed, no build step
```

The negotiation engine (`server/src/engine/`) doesn't import Express, doesn't
know about HTTP, and doesn't know about the UI - it's pure functions over the
domain types in `types/domain.ts`. That's deliberate: swapping the
rule-based reasoning in `withIoc.ts` / `withoutIoc.ts` for real LLM-driven
agent reasoning later should mean changing those two files (or adding new
ones behind the same `runNegotiation` signature), not touching routes or UI.
The `reasoner.ts` module already demonstrates the seam for narration; the
same pattern (an injectable "how do I decide" function instead of a
hardcoded rule) is how you'd extend it to LLM-driven *decisions*, not just
LLM-narrated ones.

## Simulated vs. real

Everything below is mocked for the demo and would need real work to go to
production:

- **Auth & identity** - "discovery" is a static lookup in
  `server/src/data/orgs.ts`. A real version needs actual org-to-org identity
  federation (e.g. OAuth client-credentials between tenants, SPIFFE/SPIFFE-like
  workload identity, or a partner-specific API key exchange).
- **Trust/federation** - trust is a boolean-ish status on a hardcoded list.
  A real system needs an actual federation mechanism (mutual TLS, signed
  attestations, a partner onboarding workflow) and probably a real policy
  engine instead of four toggles.
- **Calendar access** - calendars are static JSON in
  `server/src/data/scenarios.ts`. A real version calls Microsoft Graph
  (`/me/calendar/getSchedule` or similar) for the Copilot side and the Webex
  Scheduler / Graph API for the Webex side, with real OAuth consent and
  incremental sync, not a synchronous snapshot.
- **Scheduling write-back** - "writing" the event and generating a join link
  is a hash-based fake ID and a fake URL
  (`server/src/engine/withIoc.ts`). Production needs real calendar-write
  calls (Graph `POST /events`, Webex Meetings API) with retry/idempotency
  handling and real error paths (conflicts created since the negotiation
  started, declined invites, etc).
- **Email thread parsing** - the "shared intent" extraction
  (goal/urgency/attendees/duration) is hand-authored per scenario in
  `scenarios.ts`, not actually parsed from free text. A production CSP layer
  would need real NLP/LLM extraction from the live thread, with confidence
  scoring and a fallback to asking the human when the ask is ambiguous.
- **LLM reasoning** - only the *narration* of the with-IoC resolution is
  LLM-optional (`server/src/engine/reasoner.ts`, gated by
  `USE_LLM_REASONING`); the actual scheduling decision is deterministic in
  both modes. A real "swap in LLM-driven agent reasoning" pass would move
  the decision itself behind the same seam.
- **Notice-period / governance policy** - modeled as a single number
  (minimum notice hours) per agent. Real orgs have much richer policies
  (working hours, blackout periods, delegate approval chains) that a
  production version would need to model explicitly.
- **Agent hosting diagram** - the "where these agents actually live" diagram
  in the Compare view (an inline SVG driven by `scenario.isIntraOrg`) is
  illustrative, not a real deployment topology. A production CSP layer would
  actually need to decide where each agent runs (inside the employer's
  tenant vs. a third-party broker), how it authenticates outbound, and how
  the trust channel between tenants is actually secured (mTLS, signed
  tokens, a broker service) - the diagram just names that decision, it
  doesn't make it.
- **The A2A protocol frames** (`server/src/engine/protocol.ts`) are a
  real, consistent ACL-style projection of the transcript - performative,
  sender, receiver, machine-readable content - but the performative set and
  the `csp-a2a/1.0` / `adhoc-a2a/0.1` protocol tags are this demo's own
  invention, not literally the (still-evolving) real-world A2A or FIPA-ACL
  specs. The point is to show the shape a real agent-communication protocol
  takes, not to claim interoperability with any specific standard.
- **The NegMAS mediator is simulated, not the real library.** NegMAS is an
  actual Python package for automated multi-issue negotiation research.
  This app is Node/TypeScript and can't invoke it directly, so
  `server/src/engine/negmasMediator.ts` is a small hand-rolled concession
  mediator built on the same idea NegMAS's alternating-offers protocol uses
  (per-candidate utilities, a monotonically conceding acceptance threshold
  across rounds) - not a wrapper around the actual library. A real
  integration would shell out to (or run a sidecar for) Python NegMAS, or
  reimplement one of its concrete negotiator strategies faithfully rather
  than approximating the idea.
- **The cognition engine's "drift"** (`server/src/engine/cognitionEngine.ts`)
  is one concrete, deliberately-triggered failure mode - the search widening
  past the stated windows - chosen because it's realistic and easy to
  verify (the seeded scenario reliably drifts to Monday, which nobody
  defined and so defaults to fully free). A production drift detector would
  need to check far more dimensions (duration, attendee completeness,
  urgency-vs-notice-period consistency, priority-tier mismatches) and would
  likely run continuously rather than as a single post-hoc check.
- **The T+1 emergent-conflict demo** re-runs the same deterministic engine
  against a manually mutated calendar; it doesn't actually watch a live
  calendar for changes. A production version would need a real
  change-notification subscription (Graph webhooks / Watch API) to know a
  new event landed at all, plus a policy for whether to re-negotiate
  automatically, ask a human first, or only for changes above some priority
  threshold.

## Design choices worth calling out

- A scenario's two participants are named `homeAgent` (whoever sent the
  first email) and `partnerAgent` (the other side), each an `AgentProfile`
  with its own `kind` (`webex` | `copilot`). Nothing in the engine assumes
  the partner is on a different vendor or a different company - a scenario
  sets `isIntraOrg: true` and gives both agents the same `kind` to model two
  employees at one company instead. That's what makes the intra-Cisco
  scenario possible without forking the negotiation logic: stage (a)
  short-circuits to "same org, no trust check needed" and stage (b) collapses
  to a one-line "already speak the same vocabulary" instead of two identical
  mapping tables.
- The data-sharing policy panel is a single global policy (Outshift's
  outbound stance for any trusted partner), not per-org, matching how the
  panel was described in the brief. Per-org overrides would be a natural
  extension if needed.
- "Rounds" means different things in the two modes on purpose: without-IoC
  counts literal back-and-forth proposal/rejection round-trips; with-IoC is
  always reported as 1 round because the whole point of joint reasoning is
  that it's a single pass - the number of *protocol stages* it took
  (`stagesCompleted`) is tracked separately so that distinction doesn't get
  lost in the UI.
- Comparison-view and audit-log timestamps use a fixed reference week
  (`WEEK_START_DATE` in `calendarUtil.ts`) so slot labels ("Tue, Aug 25...")
  stay stable and reproducible across runs, while the negotiation *itself*
  (the agent back-and-forth) is timestamped with the real current time so
  the demo audit log grows naturally as you use it.
