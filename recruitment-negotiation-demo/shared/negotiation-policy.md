# Negotiation policy — decisions to make (or leave as defaults below)

These are the judgment calls the negotiation loop depends on. Sensible defaults are given
so the demo runs end-to-end without stalling on a decision — override any of them by
editing this file and having the agents read from it, or just hardcoding your own choice.

## Round cap

**Default: 3 rounds per task_id.** After 3 rounds of propose/counter without an accept,
the Task Agent should stop negotiating and escalate (see below) rather than looping
indefinitely. `cand-003` in the mock Workday agent always counters — use it to prove the
cap actually triggers.

## Tie-break policy (when no slot satisfies every constraint)

**Default: SLA deadline wins over candidate/interviewer convenience.** If the Scheduling
Agent finds two candidate plans — one that meets the SLA deadline but is less convenient
(e.g. split panel across two days), and one that's more convenient but misses the
deadline — prefer the one that meets the SLA deadline. Surface the tradeoff explicitly in
whatever you log or display; don't silently drop the losing option.

## Escalation path

**Default for local dev: log a structured summary to the console and return a 200 with
`type: "escalate"`** containing the reason, rounds attempted, and the last tradeoff
object. In a real deployment this would go to a recruiter via Slack/Webex message or
email — that integration is out of scope for this local prototype.

## What "accept" actually commits to

**Default: the Scheduling Agent's accept is the source of truth for the calendar.**
Task Agent and Recruiting Agent proposals are negotiation inputs; only the Scheduling
Agent's local calendar tool actually books anything. Don't let the Task Agent or Workday
mock "accept" on the calendar's behalf.
