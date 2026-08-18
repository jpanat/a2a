// Webex Task Agent — drives the interview scheduling negotiation.
//
// See /CLAUDE.md (project root) and /shared/message-schema.json for the message shape
// and /shared/negotiation-policy.md for the round cap / tie-break / escalation rules
// implemented below.
//
// Responsibilities:
// 1. Detect an "action item" from a Webex meeting summary. For local dev there's no real
//    Webex meeting to read, so this is simulated: POST /trigger with a candidate/req to
//    negotiate, as if a meeting summary had just produced that action item. (In a real
//    deployment this would come from the Webex Meetings MCP Server's summary/transcript
//    tools instead.)
// 2. Build a `propose` message and POST it to the Workday Recruiting Agent mock's
//    /tasks endpoint (WORKDAY_AGENT_URL below).
// 3. On `accept` — hand the accepted_window to the Scheduling Agent's /book endpoint to
//    actually book it.
// 4. On `counter` — read `acceptable_windows` from the response, ask the Scheduling
//    Agent which (if any) are actually free on real calendars, and re-propose with an
//    updated `proposed_window`. Reuses the SAME task_id across rounds — the mock relies
//    on this to track round count.
// 5. Enforces the round cap and tie-break policy from /shared/negotiation-policy.md.
//    After the cap, stops and returns an `escalated` outcome instead of looping forever.
//
// Test candidates against the mock (see workday-recruiting-agent-mock/README.md):
//   cand-001 -> accepts immediately if required_attendees matches
//   cand-002 -> counters once, then accepts on the 2nd request with same task_id
//   cand-003 -> always counters -> should trigger the round cap + escalation

const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4001;
const WORKDAY_AGENT_URL = process.env.WORKDAY_AGENT_URL || 'http://localhost:4000';
const SCHEDULING_AGENT_URL = process.env.SCHEDULING_AGENT_URL || 'http://localhost:4002';

// Default from shared/negotiation-policy.md.
const ROUND_CAP = 3;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', agent: 'webex-task-agent' });
});

// Simulates receiving an action item from a Webex meeting summary.
// Expected body: { candidate_id, requisition_id, proposed_window, required_attendees, urgency }
app.post('/trigger', async (req, res) => {
  const { candidate_id, requisition_id, proposed_window, required_attendees, urgency } =
    req.body || {};

  if (!candidate_id || !requisition_id || !proposed_window || !required_attendees) {
    return res.status(400).json({
      error:
        'candidate_id, requisition_id, proposed_window, and required_attendees are required'
    });
  }

  const task_id = crypto.randomUUID();
  let currentWindow = proposed_window;
  // The panel of attendees Workday says a slot must satisfy can grow on a counter
  // (e.g. a fuller panel becomes "required" once negotiation starts) — track it
  // separately from the originally requested attendees so availability checks stay
  // accurate.
  let currentAttendees = required_attendees;
  let round = 0;
  let lastResponse = null;

  console.log(
    `\n=== [${task_id}] Starting negotiation for ${candidate_id} / ${requisition_id} ===`
  );

  while (round < ROUND_CAP) {
    round += 1;

    const proposeMessage = {
      task_id,
      from_agent: 'webex-task-agent',
      to_agent: 'workday-recruiting-agent',
      type: 'propose',
      payload: {
        candidate_id,
        requisition_id,
        proposed_window: currentWindow,
        required_attendees: currentAttendees,
        urgency
      }
    };

    console.log(
      `[${task_id}] Round ${round} -> propose to Workday:`,
      JSON.stringify(proposeMessage.payload)
    );

    let workdayResponse;
    try {
      const workdayRes = await fetch(`${WORKDAY_AGENT_URL}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proposeMessage)
      });
      workdayResponse = await workdayRes.json();
    } catch (err) {
      console.error(`[${task_id}] Failed to reach Workday agent:`, err.message);
      return res
        .status(502)
        .json({ error: 'Failed to reach Workday agent', detail: err.message });
    }

    console.log(`[${task_id}] Round ${round} <- Workday responded:`, JSON.stringify(workdayResponse));
    lastResponse = workdayResponse;

    if (workdayResponse.type === 'accept') {
      const acceptedWindow = workdayResponse.payload.accepted_window;
      console.log(
        `[${task_id}] Workday accepted ${JSON.stringify(acceptedWindow)}. Booking with Scheduling Agent...`
      );

      let bookingResponse;
      try {
        const bookRes = await fetch(`${SCHEDULING_AGENT_URL}/book`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidate_id,
            requisition_id,
            window: acceptedWindow,
            attendees: currentAttendees
          })
        });
        bookingResponse = await bookRes.json();
      } catch (err) {
        console.error(`[${task_id}] Failed to reach Scheduling agent:`, err.message);
        return res
          .status(502)
          .json({ error: 'Failed to reach Scheduling agent', detail: err.message });
      }

      console.log(`[${task_id}] Booked:`, JSON.stringify(bookingResponse.booking));
      console.log(`=== [${task_id}] Negotiation accepted after ${round} round(s) ===\n`);

      return res.json({
        outcome: 'accepted',
        rounds: round,
        booking: bookingResponse.booking
      });
    }

    if (workdayResponse.type === 'counter') {
      const {
        acceptable_windows = [],
        blocking_constraint,
        sla_deadline,
        required_attendees: counterAttendees
      } = workdayResponse.payload;

      if (counterAttendees) {
        currentAttendees = counterAttendees;
      }

      if (!acceptable_windows.length) {
        console.log(
          `[${task_id}] Workday offered no acceptable_windows (blocking_constraint: ${blocking_constraint}). Nothing to check with the Scheduling Agent this round.`
        );
        continue;
      }

      console.log(
        `[${task_id}] Checking availability for ${acceptable_windows.length} window(s) via Scheduling Agent...`
      );

      let availabilityResponse;
      try {
        const availRes = await fetch(`${SCHEDULING_AGENT_URL}/check-availability`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attendees: currentAttendees, windows: acceptable_windows })
        });
        availabilityResponse = await availRes.json();
      } catch (err) {
        console.error(`[${task_id}] Failed to reach Scheduling agent:`, err.message);
        return res
          .status(502)
          .json({ error: 'Failed to reach Scheduling agent', detail: err.message });
      }

      const freeWindows = availabilityResponse.free_windows || [];
      console.log(`[${task_id}] Scheduling Agent free windows:`, JSON.stringify(freeWindows));

      if (!freeWindows.length) {
        console.log(
          `[${task_id}] None of Workday's acceptable_windows are free for the full panel. Re-proposing current window to keep the round going.`
        );
        continue;
      }

      let chosenWindow = freeWindows[0];
      if (freeWindows.length > 1) {
        // Tie-break policy (shared/negotiation-policy.md): SLA deadline wins over
        // candidate/interviewer convenience. Surface the tradeoff in the logs rather
        // than silently dropping the losing option.
        const meetingDeadline = sla_deadline
          ? freeWindows.filter((w) => new Date(w.end) <= new Date(sla_deadline))
          : [];
        if (meetingDeadline.length) {
          chosenWindow = meetingDeadline[0];
          console.log(
            `[${task_id}] Tie-break: multiple free windows, choosing ${JSON.stringify(chosenWindow)} to meet SLA deadline ${sla_deadline}. Deprioritized: ${JSON.stringify(freeWindows.filter((w) => w !== chosenWindow))}`
          );
        } else {
          console.log(
            `[${task_id}] Tie-break: multiple free windows but none meet SLA deadline ${sla_deadline}; defaulting to earliest option ${JSON.stringify(chosenWindow)}. All options: ${JSON.stringify(freeWindows)}`
          );
        }
      }

      currentWindow = chosenWindow;
      console.log(
        `[${task_id}] Re-proposing ${JSON.stringify(currentWindow)} to Workday (same task_id)...`
      );
      continue;
    }

    console.error(`[${task_id}] Unexpected response type from Workday: ${workdayResponse.type}`);
    return res
      .status(502)
      .json({ error: `Unexpected response type from Workday agent: ${workdayResponse.type}` });
  }

  // Round cap reached without an accept -> escalate.
  const reason = `Round cap (${ROUND_CAP}) reached without agreement`;
  const lastTradeoffs = lastResponse && lastResponse.payload;

  console.log(`[${task_id}] Escalating: ${reason}`);
  console.log(`[${task_id}] Last tradeoffs:`, JSON.stringify(lastTradeoffs));
  console.log(`=== [${task_id}] Negotiation escalated after ${round} round(s) ===\n`);

  return res.json({
    outcome: 'escalated',
    rounds: round,
    reason,
    last_tradeoffs: lastTradeoffs
  });
});

app.listen(PORT, () => {
  console.log(`Webex Task Agent listening on port ${PORT}`);
  console.log(`  Workday agent expected at:    ${WORKDAY_AGENT_URL}`);
  console.log(`  Scheduling agent expected at: ${SCHEDULING_AGENT_URL}`);
});
