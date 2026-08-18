const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;

const agentCard = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'agent-card.json'), 'utf8')
);
const scenarios = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'scenarios.json'), 'utf8')
);

// A2A discovery endpoint
app.get('/.well-known/agent-card.json', (req, res) => {
  res.json(agentCard);
});

// In-memory round counter per task_id, to simulate a negotiation
// progressing across multiple requests for the same task.
const roundCounts = {};

// Main A2A-style task endpoint. Accepts the message schema from the
// build prompt: { task_id, from_agent, to_agent, type, payload }.
app.post('/tasks', (req, res) => {
  const msg = req.body;

  if (!msg || !msg.task_id || !msg.payload || !msg.payload.candidate_id) {
    return res
      .status(400)
      .json({ error: 'task_id and payload.candidate_id are required' });
  }

  roundCounts[msg.task_id] = (roundCounts[msg.task_id] || 0) + 1;
  const round = roundCounts[msg.task_id];

  const scenario = scenarios[msg.payload.candidate_id] || scenarios.default;

  switch (scenario.behavior) {
    case 'accept_if_attendees_met': {
      const proposedAttendees = msg.payload.required_attendees || [];
      const attendeesSatisfied = scenario.required_attendees.every((a) =>
        proposedAttendees.includes(a)
      );
      if (attendeesSatisfied) {
        return res.json(buildAccept(msg, scenario));
      }
      return res.json(buildCounter(msg, scenario, round));
    }

    case 'counter_once_then_accept': {
      if (round === 1) {
        return res.json(buildCounter(msg, scenario, round));
      }
      return res.json(buildAccept(msg, scenario));
    }

    case 'always_counter':
    default: {
      return res.json(buildCounter(msg, scenario, round));
    }
  }
});

function buildAccept(msg, scenario) {
  return {
    task_id: msg.task_id,
    from_agent: 'workday-recruiting-agent',
    to_agent: msg.from_agent,
    type: 'accept',
    payload: {
      candidate_id: msg.payload.candidate_id,
      requisition_id: msg.payload.requisition_id,
      accepted_window: msg.payload.proposed_window,
      note:
        scenario.accept_note ||
        'Proposal satisfies required panel and SLA requirements.'
    }
  };
}

function buildCounter(msg, scenario, round) {
  return {
    task_id: msg.task_id,
    from_agent: 'workday-recruiting-agent',
    to_agent: msg.from_agent,
    type: 'counter',
    payload: {
      candidate_id: msg.payload.candidate_id,
      requisition_id: msg.payload.requisition_id,
      round,
      blocking_constraint: scenario.blocking_constraint,
      required_attendees: scenario.required_attendees,
      acceptable_windows: scenario.acceptable_windows,
      sla_deadline: scenario.sla_deadline || null
    }
  };
}

app.listen(PORT, () => {
  console.log(`Mock Workday Recruiting Agent listening on port ${PORT}`);
  console.log(`Agent card: http://localhost:${PORT}/.well-known/agent-card.json`);
  console.log(`Task endpoint: POST http://localhost:${PORT}/tasks`);
});
