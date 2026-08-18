# Recruitment scheduling negotiation demo

Three agents negotiating a candidate interview slot across two vendor platforms:

- **`webex-task-agent`** (stub) — kicks off scheduling, wants it done fast.
- **`workday-recruiting-agent-mock`** (fully working) — enforces panel/SLA requirements.
- **`webex-scheduling-agent`** (stub + mock calendar) — owns real availability, books the
  final slot.

## Fastest path: hand this to Claude Code

1. Open this folder in Claude Code.
2. Say: **"Read CLAUDE.md and implement the two stub agents."**
3. Once it's done, run:
   ```bash
   npm run install:all
   npm run start:all
   ```
4. Trigger a negotiation:
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

Try `cand-001` (clean accept), `cand-002` (one round of negotiation), and `cand-003`
(forced escalation) to see all three behaviors.

## What's real vs. mocked here

- The **negotiation logic** (propose → counter → re-propose → accept/escalate) is the
  real thing you're prototyping — that's what's worth getting right.
- The **Workday connection** and the **Webex calendar** are both mocked for local dev, so
  you don't need Webex A2A beta access or a Workday tenant to build and test this.
- See each subfolder's README/comments for exactly where the mock stands in for a real
  integration, so swapping it in later is a smaller lift.

## Folder map

```
recruitment-negotiation-demo/
├── CLAUDE.md                       ← full build instructions (start here / give to Claude Code)
├── package.json                    ← root scripts to install/run everything
├── shared/
│   ├── message-schema.json         ← the message shape all agents use
│   └── negotiation-policy.md       ← round cap, tie-break rule, escalation default
├── workday-recruiting-agent-mock/  ← DONE — mock Workday agent, port 4000
├── webex-task-agent/               ← TO BUILD — negotiation loop, port 4001
└── webex-scheduling-agent/         ← TO BUILD (mostly done) — mock calendar, port 4002
```
