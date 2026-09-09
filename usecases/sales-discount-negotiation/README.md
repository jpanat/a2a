# Use case: sales discount negotiation, agent-to-agent

A multi-agent system (MAS) where a **Buyer** agent and a **Seller** agent
negotiate a discount on a SaaS renewal directly with each other -- true
peer-to-peer, over the A2A wire protocol, with no orchestrator or broker
relaying offers between them. When the seller needs more discount room than
it holds on its own, it consults a **Sales Manager** agent directly, again
peer-to-peer, as a nested side-negotiation.

See [`MAS.md`](./MAS.md) for the topology diagram and protocol details, and
each agent's `AGENT.md` for its specific policy and message contract:

- [`agents/buyer/AGENT.md`](./agents/buyer/AGENT.md)
- [`agents/seller/AGENT.md`](./agents/seller/AGENT.md)
- [`agents/sales_manager/AGENT.md`](./agents/sales_manager/AGENT.md)

## The scenario

A customer's procurement team (Buyer agent) is renewing 250 seats of
"CloudSuite Pro" ($500/seat list) for a 3-year term and wants a much bigger
discount than the sales rep (Seller agent) can approve alone. The rep
negotiates directly with procurement, and -- only when it's clearly stuck --
picks up the phone (well, calls an API) to its own Sales Manager agent to
ask for a bigger discount ceiling on this specific deal, citing the deal's
size and term as justification. The manager doesn't just rubber-stamp the
ask; it applies its own margin policy and may grant less than requested.
The rep then keeps negotiating with procurement using whatever ceiling it
was actually given.

This is a good testbed use case for P2P agent negotiation because it has
the three ingredients that make it interesting:
1. **Opposed objectives** (buyer wants a low price, seller wants a high
   one) with a real zone of possible agreement to find.
2. **Bounded rounds** (nobody negotiates forever -- a deadline forces
   concessions).
3. **A realistic escalation path** that is itself a negotiation (the seller
   doesn't automatically get what it asks its manager for), showing that
   P2P collaboration composes: one negotiation can trigger another between
   a different pair of agents, with neither buyer nor manager aware of the
   other.

## Run it

```bash
cd usecases/sales-discount-negotiation
pip install -r requirements.txt
python3 run_negotiation.py
```

This starts all three agents as independent HTTP servers (ports 9001-9003)
and makes one call into the Buyer agent to kick things off. Everything
after that -- every offer, counter-offer, and the seller's escalation to its
manager -- happens as direct A2A calls between the agents' own HTTP
endpoints; the script just prints the transcript it gets back.

Sample output (concession tactics and profile defaults are documented in
each agent's `AGENT.md`; exact numbers will match this run since the demo
is deterministic):

```
--- Negotiation transcript (buyer <-> seller) ---
round  0  buyer    30.0% off  $ 350.00/seat  -- Benchmarked against competing quotes for 250 seats; requesting 30% off list.
round  0  seller    0.0% off  $ 500.00/seat  -- Best I can do this round is 0.0% off (authority ceiling 15.0%).
...
round  8  buyer    20.0% off  $ 400.00/seat  -- Seller's 22.8% is still short of our target; revising ask for round 8.
round  8  seller   20.0% off  $ 400.00/seat  -- Matching your ask at 20.0% off.

--- Seller -> Sales Manager escalation(s) ---
round 5: seller requested 31.1%, manager granted 26.0% -- Deal (250 seats, 3yr) qualifies for strategic authority; approving 26.0% instead of the requested 31.1% to protect margin (cap 26.0%).

--- Outcome ---
{
  "outcome": "deal",
  "finalOffer": { "round": 8, "sender": "seller", "discountPct": 20.0, "unitPrice": 400.0, ... }
}
```

You can also talk to any agent directly, since each is just an A2A server:

```bash
# discover an agent
curl -s http://127.0.0.1:9002/.well-known/agent-card.json | python3 -m json.tool

# call a skill directly (JSON-RPC 2.0, method message/send)
curl -s http://127.0.0.1:9001/a2a -X POST -H 'content-type: application/json' -d '{
  "jsonrpc": "2.0", "id": "1", "method": "message/send",
  "params": { "message": { "role": "user", "messageId": "m1", "contextId": "c1",
    "parts": [{"kind": "data", "data": {"action": "start_negotiation", "sellerUrl": "http://127.0.0.1:9002"}}] } }
}' | python3 -m json.tool
```

## Layout

```
usecases/sales-discount-negotiation/
  README.md                     <- this file: the use case
  MAS.md                        <- MAS topology, protocol, extension points
  requirements.txt
  common/
    a2a_protocol.py              A2A Agent Card + JSON-RPC server/client (the transport)
    negotiation.py                Shared concession-curve model (the negotiation math)
  agents/
    buyer/{AGENT.md, agent_card.json, policy.py, agent.py}
    seller/{AGENT.md, agent_card.json, policy.py, agent.py}
    sales_manager/{AGENT.md, agent_card.json, policy.py, agent.py}
  run_negotiation.py             Launcher only -- starts the 3 servers, sends 1 kickoff call
```
