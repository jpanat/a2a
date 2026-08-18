# Mock Workday Recruiting Agent (A2A stub)

A minimal A2A-style server that behaves like a Workday Recruiting Agent, for building and
testing the Webex Task Agent / Scheduling Agent negotiation loop before you have real
Workday Agent Gateway access. Swapping this out for the real thing later should mean
changing a URL, not rewriting your negotiation logic — every response follows the same
message shape a real A2A-connected Workday agent would return.

## Run it

```bash
npm install
npm start
```

Server listens on `http://localhost:4000` by default (override with `PORT`).

- Agent discovery: `GET /.well-known/agent-card.json`
- Task negotiation: `POST /tasks`

## The three canned scenarios

Behavior is keyed off `payload.candidate_id` in the request. Use these three IDs to
exercise the three outcomes your build prompt calls for:

| candidate_id | Behavior                        | What it demonstrates                              |
|--------------|----------------------------------|----------------------------------------------------|
| `cand-001`   | Accepts immediately if required attendees are present | Clean accept — happy path |
| `cand-002`   | Counters once, then accepts on the 2nd request for the same `task_id` | One round of real negotiation |
| `cand-003`   | Always counters, never accepts   | Forces your escalation/fallback path to trigger |

Any other candidate_id falls through to a generic "unknown candidate" counter, so you
can tell a real miss apart from a scripted scenario.

## Try it with curl

Clean accept:
```bash
curl -s -X POST http://localhost:4000/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "task-1",
    "from_agent": "webex-task-agent",
    "to_agent": "workday-recruiting-agent",
    "type": "propose",
    "payload": {
      "candidate_id": "cand-001",
      "requisition_id": "req-100",
      "proposed_window": { "start": "2026-08-21T14:00:00Z", "end": "2026-08-21T15:00:00Z" },
      "required_attendees": ["hiring_manager@example.com"],
      "urgency": "high"
    }
  }'
```

One round of counter-proposal (send the same `task_id` twice to see it flip from
`counter` to `accept`):
```bash
curl -s -X POST http://localhost:4000/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "task-2",
    "from_agent": "webex-task-agent",
    "to_agent": "workday-recruiting-agent",
    "type": "propose",
    "payload": {
      "candidate_id": "cand-002",
      "requisition_id": "req-101",
      "proposed_window": { "start": "2026-08-20T10:00:00Z", "end": "2026-08-20T11:00:00Z" },
      "required_attendees": ["hiring_manager@example.com"],
      "urgency": "high"
    }
  }'

# Run again with the SAME task_id and one of the acceptable_windows returned above
# to see it accept on round 2.
```

Forced escalation (always counters — use this to test your negotiation-round cap and
human handoff):
```bash
curl -s -X POST http://localhost:4000/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "task-3",
    "from_agent": "webex-task-agent",
    "to_agent": "workday-recruiting-agent",
    "type": "propose",
    "payload": {
      "candidate_id": "cand-003",
      "requisition_id": "req-102",
      "proposed_window": { "start": "2026-08-18T09:00:00Z", "end": "2026-08-18T10:00:00Z" },
      "required_attendees": ["hiring_manager@example.com"],
      "urgency": "high"
    }
  }'
```

## Wiring this into the real negotiation loop

Your Webex Task Agent / Scheduling Agent should treat this exactly like a real A2A peer:

1. Fetch `/.well-known/agent-card.json` first to discover the skill and confirm the
   endpoint is alive — don't hardcode assumptions about what it can do.
2. POST proposals to `/tasks` using the schema in the build prompt.
3. Branch on the response `type`:
   - `accept` → book the `accepted_window`.
   - `counter` → feed `blocking_constraint`, `required_attendees`, and
     `acceptable_windows` into your Scheduling Agent's next availability search.
   - After your round cap (per the build prompt, e.g. 3), stop and escalate — this mock
     will happily counter forever on `cand-003` if you let it.

## Known limitations of this mock

- No auth — a real Workday Agent Gateway connection will require credentials the build
  prompt didn't scope out yet.
- No persistence — round counts reset if the server restarts.
- Scenarios are static JSON, not a real pipeline/SLA engine — fine for prototyping the
  negotiation *logic*, not a stand-in for actual Workday data.
