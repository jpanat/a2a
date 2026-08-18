// Webex Scheduling Agent — STUB, not yet implemented (calendar endpoints are mocked).
//
// Read /CLAUDE.md (project root) and /shared/message-schema.json before writing code here.
//
// Responsibilities:
// 1. Given a set of required attendees and a candidate window (or a list of candidate
//    windows from a Workday counter-proposal), check real availability and return which
//    windows, if any, actually work.
// 2. Book the final agreed window once the Task Agent confirms a `type: accept`.
// 3. In production this talks to the real Webex Meetings MCP Server
//    (webex-list-meetings / webex-create-meeting / webex-update-meeting) plus calendar
//    availability (Google/Microsoft 365). For local dev, an in-memory mock calendar is
//    provided below so you can build and test the negotiation loop without real
//    credentials — swap MOCK_CALENDAR / the two endpoints below for real MCP tool calls
//    when you're ready.
//
// Mock calendar below is intentionally a bit awkward (hiring_manager is busy at the
// first obvious slot) so the negotiation loop actually has something to negotiate over.

const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4002;

// attendee email -> array of busy windows
const MOCK_CALENDAR = {
  'hiring_manager@example.com': [
    { start: '2026-08-20T10:00:00Z', end: '2026-08-20T11:00:00Z' },
    { start: '2026-08-21T14:00:00Z', end: '2026-08-21T15:00:00Z' }
  ],
  'tech_interviewer_1@example.com': [
    { start: '2026-08-22T09:00:00Z', end: '2026-08-22T09:30:00Z' }
  ],
  'tech_interviewer_2@example.com': []
};

const BOOKED = []; // in-memory list of confirmed meetings, for demo purposes only

app.get('/health', (req, res) => {
  res.json({ status: 'ok', agent: 'webex-scheduling-agent' });
});

// POST { attendees: [email], windows: [{start, end}, ...] }
// Returns which of the given windows are free for ALL listed attendees.
app.post('/check-availability', (req, res) => {
  // TODO: replace MOCK_CALENDAR lookup with real Webex/calendar MCP tool calls.
  const { attendees = [], windows = [] } = req.body || {};

  const freeWindows = windows.filter((w) =>
    attendees.every((email) => {
      const busy = MOCK_CALENDAR[email] || [];
      return !busy.some((b) => overlaps(w, b));
    })
  );

  res.json({ free_windows: freeWindows });
});

// POST { candidate_id, requisition_id, window, attendees }
// TODO: replace with a real webex-create-meeting MCP tool call.
app.post('/book', (req, res) => {
  const booking = { ...req.body, booked_at: new Date().toISOString() };
  BOOKED.push(booking);
  res.json({ status: 'booked', booking });
});

app.get('/bookings', (req, res) => {
  res.json({ bookings: BOOKED });
});

function overlaps(a, b) {
  return new Date(a.start) < new Date(b.end) && new Date(b.start) < new Date(a.end);
}

app.listen(PORT, () => {
  console.log(`Webex Scheduling Agent (stub) listening on port ${PORT}`);
  console.log('Using in-memory MOCK_CALENDAR — replace with real MCP calls when ready.');
});
