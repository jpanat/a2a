# a2a
Playground for agent 2 agents

## Project Nova — Launch Readiness prototype

An interactive, self-contained Webex Messaging product-concept demo contrasting
ordinary A2A multi-agent orchestration ("BEFORE") with A2A agents collaborating
through NegMAS + Shared Ontology + Shared Intent + Shared Context + Shared
Reasoning ("AFTER").

Four agents (Engineering, Security, Support, Product) are asked whether a
release is GO. In the BEFORE flow they disagree and an orchestrator relays
clarifying questions back and forth, incurring duplicated context, semantic
mismatch, and an unconfident, non-consensus recommendation. Clicking
**Enable NegMAS Collaboration** switches to the AFTER flow, where the agents
negotiate a shared ontology, intent, context, and reasoning, converging on an
explicit, unanimous "Conditional GO" agreement — with live before/after
metrics, an architecture view (hub-and-spoke vs. shared negotiation space),
and an interactive composer that can invalidate and trigger a live
renegotiation of the agreement.

Plain HTML/CSS/JS, no build step or dependencies.

```
python3 -m http.server 8000
# open http://localhost:8000/index.html
```

Prototype controls: **Reset**, **Before**, **Enable NegMAS**, **Advance**,
**Auto Play** (pauses at 5 key story beats), **Metrics**, **Architecture**.
All metrics shown are illustrative, simulated demo figures — not measured
production benchmarks.
