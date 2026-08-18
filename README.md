# CSP Negotiation Demo

A local demo of two AI agents negotiating a cross-company meeting time - once
with plain, unstructured message-passing, and once through a **Cognition
State Protocol (CSP)**: a semantic coordination layer with three properties -
**shared intent**, **shared ontology/context**, and **shared reasoning**.

The scenario: Dana (Northwind Corp, Outlook + Webex Scheduler) emails Marcus
(a partner company, Outlook + Microsoft Copilot) to find time for a sync.
Instead of humans going back and forth, each side's scheduling agent
negotiates on their behalf. The demo lets you compare what that negotiation
looks like with and without a shared protocol.

Six scenarios are seeded, covering three different topologies:

- **Cross-company, different vendors** - Northwind x Fenwick/Solace/Bramwell/
  Orbit (Webex ↔ Copilot), and **Outshift by Cisco x Microsoft**
  (`outshift-microsoft-api-review`) - the real pairing this demo is built to
  pitch: Cisco's Webex Scheduler side negotiating with a Microsoft Copilot
  counterpart.
- **Intra-company, same vendor** - `cisco-internal-standup-prep`: two Cisco
  employees in different business units (Outshift and Cisco Security), both
  on Webex. No vendor to blame, no vocabulary to translate - this scenario
  isolates how much of CSP's value comes purely from shared intent and joint
  reasoning, independent of the ontology-translation story.

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

## The five views

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

**With IoC** (`server/src/engine/withIoc.ts`) runs five explicit stages:

1. **Identity & discovery** - agents authenticate and confirm a trust
   relationship exists between the two orgs (a lookup against a static
   trusted-orgs list). No trust, no negotiation - it escalates right here,
   before any calendar or intent data is even exchanged.
2. **Shared ontology grounding** - each agent maps its own calendar
   vocabulary into one shared schema (`hard-busy` / `soft-busy` /
   `available`) before anything else happens. This step is shown explicitly
   in the transcript, e.g. `tentative-hold -> soft-busy`.
3. **Shared intent exchange** - both agents build one structured intent
   object from the email thread: goal, urgency, required attendees,
   duration.
4. **Joint constraint negotiation** - instead of proposing slots one at a
   time, the engine scores *every* candidate slot across *both* calendars in
   a single pass, in the shared schema, and can produce an option neither
   side stated explicitly (e.g. a slot 30 minutes shorter than the naive
   default, sitting on top of someone's soft-busy hold that the ontology
   confirms is movable).
5. **Resolution & write-back** - the winning slot gets "written" to both
   mock calendars and a join link is generated.

With-IoC mode does **not** always succeed - it's built to fail two different
ways so the demo has a visible, honest failure path even with the full
protocol: a partner org that isn't yet trusted escalates at stage 1, and an
urgent same-day ask that violates one side's notice-period policy escalates
at stage 4 even after ontology and intent are fully grounded. Roughly a
third of the seeded audit log is escalations, not five-star successes.

## Seed data

`server/src/data/` seeds:

- 5 partner orgs (`server/src/data/orgs.ts`): Fenwick Partners, Solace
  Health, Orbit Logistics, and Microsoft (all trusted), and Bramwell &
  Vance (pending review, used for the trust-escalation case). Two "home"
  orgs exist alongside them in a separate `HOME_ORGS` registry (Northwind
  Corp and Outshift by Cisco) - home orgs are "us" in a given scenario, not
  a partner to manage trust for, so they're deliberately kept out of the
  admin view's connected-organizations list.
- 6 negotiation scenarios (`server/src/data/scenarios.ts`), each with its
  own email thread, calendars, and stated windows - designed so the
  contrast between modes is genuine, not scripted: one flagship scenario
  where the baseline stalls and escalates while CSP mode resolves it (and
  its Outshift/Microsoft reskin); one "good case" where even the baseline
  succeeds, just less efficiently; the trust-gate case; the notice-period
  case; and the intra-company case described above.
- 12 historical negotiations (one of each scenario x mode) are run through
  the real engine at server startup and backdated over the last ~3 weeks,
  so the admin audit log and metrics aren't empty on first run. Metrics on
  the admin page are computed from this data, not hardcoded.

## Architecture

```
server/src/
  types/domain.ts       shared types (Org, AgentProfile, NegotiationSession, ...)
  engine/
    ontology.ts          local-vocab -> shared-schema mapping
    calendarUtil.ts       slot/date helpers
    reasoner.ts            pluggable explanation generator (rule-based | LLM)
    withoutIoc.ts          baseline negotiation
    withIoc.ts             five-stage CSP negotiation
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
- The data-sharing policy panel is a single global policy (Northwind's
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
