# Project instructions for Claude Code

This repo prototypes a three-agent negotiation system that schedules candidate interviews
across two vendor platforms — Webex and Workday — using the A2A (Agent2Agent) message
pattern for cross-vendor communication. Your job is to implement the two stub agents so
the whole loop runs locally end-to-end.

## Current state — what's already done

- `workday-recruiting-agent-mock/` — **fully working**, do not modify unless a scenario
  needs adjusting. It's an Express server on port 4000 exposing:
  - `GET /.well-known/agent-card.json` — A2A agent discovery
  - `POST /tasks` — accepts a propose message, returns accept/counter based on which
    `candidate_id` is used (`cand-001` accepts, `cand-002` counters once then accepts,
    `cand-003` always counters). See its README for full details and curl examples.

- `webex-task-agent/` — **stub only**. `index.js` has a `/health` route and a `/trigger`
  route that currently returns 501. This is what you need to implement.

- `webex-scheduling-agent/` — **stub with a mock calendar**. `/health`,
  `/check-availability`, `/book`, and `/bookings` all work against an in-memory
  `MOCK_CALENDAR` — no real Webex credentials needed for local dev. You need to implement
  the Task Agent's calls into this, and can extend the mock calendar data if useful for
  testing.

- `shared/message-schema.json` — the message shape all three agents use.
- `shared/negotiation-policy.md` — the round cap, tie-break rule, and escalation default
  to implement. Read this before writing the negotiation loop.

## What to build

### 1. `webex-task-agent/index.js` — the negotiation loop

Implement `POST /trigger` to:

1. Accept `{ candidate_id, requisition_id, proposed_window, required_attendees, urgency }`.
2. Generate a `task_id` (uuid) and build a `propose` message per the shared schema.
3. POST it to the Workday mock at `WORKDAY_AGENT_URL/tasks`.
4. Branch on the response `type`:
   - `accept` → POST the accepted window to the Scheduling Agent's `/book` endpoint, then
     return `{ outcome: "accepted", rounds, booking }`.
   - `counter` → take `acceptable_windows` from the response, POST them to the Scheduling
     Agent's `/check-availability` along with `required_attendees`, pick the first
     `free_windows` result (or apply the tie-break rule from
     `shared/negotiation-policy.md` if there's a choice to make), and re-propose to
     Workday **using the same `task_id`**.
   - Repeat up to the round cap in `shared/negotiation-policy.md` (default 3). If the cap
     is hit without an accept, stop and return
     `{ outcome: "escalated", rounds, reason, last_tradeoffs }` instead of looping
     further.
5. Log each round's request/response to the console — this is a demo, visibility into
   the back-and-forth matters more than clean production logging.

### 2. `webex-scheduling-agent/index.js` — light additions if needed

The mock calendar endpoints already work. You mostly just need the Task Agent to call
them correctly. Only touch this file if you need to adjust `MOCK_CALENDAR` to make a test
scenario demonstrate something specific (e.g. add a slot that's free for everyone so
`cand-002`'s second round can actually succeed).

### 3. Verify the three scenarios end-to-end

After both agents are implemented, confirm all three flows work by calling
`webex-task-agent`'s `/trigger`:

- `cand-001` → should return `outcome: "accepted"` on the first round.
- `cand-002` → should show one `counter`, a re-proposal, then `outcome: "accepted"`.
- `cand-003` → should hit the round cap and return `outcome: "escalated"`.

Print or log enough at each step that someone watching the terminal can follow the
negotiation happening — this is meant to be demoed, not just pass a test.

## Running everything

```bash
npm run install:all   # installs all three services' dependencies
npm run start:all     # runs all three services concurrently
```

Or run them individually in separate terminals:
```bash
npm run start:workday      # port 4000
npm run start:task         # port 4001
npm run start:scheduling   # port 4002
```

Then trigger a scenario:
```bash
curl -s -X POST http://localhost:4001/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "candidate_id": "cand-002",
    "requisition_id": "req-101",
    "proposed_window": { "start": "2026-08-20T10:00:00Z", "end": "2026-08-20T11:00:00Z" },
    "required_attendees": ["hiring_manager@example.com"],
    "urgency": "high"
  }'
```

## Explicitly out of scope for this local prototype

- Real Webex A2A beta registration and real Workday Agent Gateway access — this repo
  mocks both. Don't try to wire up real credentials; that's a separate step once the
  logic here is proven out.
- Real Webex Meetings MCP Server calls — the scheduling agent's mock calendar stands in
  for it.
- Auth of any kind between the three services.
- A real escalation channel (Slack/email/etc.) — logging the escalation is sufficient
  here.

If you hit a decision point not covered by `shared/negotiation-policy.md`, pick the most
reasonable default, note the assumption in a code comment, and keep going rather than
stopping to ask.
