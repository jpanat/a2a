# Multi-Agent System: Sales Discount Negotiation

This document is the index/overview for the MAS. Each agent's own
[`AGENT.md`](#agents) is the source of truth for its policy and message
contract; this file covers the topology and protocol that ties them
together.

## Topology: peer-to-peer, no broker

```
   ┌───────────────┐   A2A: negotiate_round    ┌───────────────┐
   │  Buyer Agent   │ ─────────────────────────>│  Seller Agent │
   │   (:9001)      │<───────────────────────── │    (:9002)    │
   └───────────────┘   negotiate_round_reply    └───────┬───────┘
                                                          │
                                          A2A: authority_check
                                          (only if the rep is stuck   ▼
                                           past its own ceiling)  ┌───────────────┐
                                                                  │ Sales Manager │
                                                                  │    Agent      │
                                                                  │   (:9003)     │
                                                                  └───────────────┘
```

There is **no fourth "orchestrator" or "broker" agent, and no shared
message bus.** Each arrow above is one agent's `A2APeer` client calling
another agent's own A2A HTTP endpoint directly:

- The Buyer agent discovers/calls the Seller agent's URL and drives every
  round of the negotiation itself.
- The Seller agent discovers/calls the Sales Manager agent's URL on its own
  initiative, mid-negotiation, when it needs more room than it holds -- the
  buyer never sees this call happen and the manager never talks back to the
  buyer.

`run_negotiation.py` only starts the three servers and makes a single call
into the Buyer agent to say "go" -- see its docstring. It is a launcher, not
a participant.

## Wire protocol

All inter-agent traffic uses the same lightweight A2A layer
([`common/a2a_protocol.py`](./common/a2a_protocol.py)):

- Each agent serves an **Agent Card** at `GET /.well-known/agent-card.json`
  (also checked into this repo per-agent as `agent_card.json`) so a peer can
  discover its URL, description, and skills before calling it.
- Each agent accepts JSON-RPC 2.0 `message/send` calls at `POST /a2a`. The
  request carries a `Message` with one `DataPart` (structured JSON payload,
  not natural language); the reply is a completed `Task` whose artifact
  carries the reply `Message`, again as one `DataPart`.
- Domain payloads (what actually goes in the `DataPart`) are documented per
  skill in each agent's `AGENT.md`.

This mirrors the shapes defined by the public [A2A
spec](https://a2a-protocol.org) closely enough to be a faithful example,
without pinning to a specific version of the fast-moving official
`a2a-sdk` package. Swapping `common/a2a_protocol.py`'s server/client for
that SDK's transport (`A2AStarletteApplication` / `A2AClient`) is a
drop-in replacement -- nothing in `policy.py` or the domain payloads would
need to change, since the negotiation logic never touches transport
directly.

## Negotiation model

All three agents share one concession-curve model
([`common/negotiation.py`](./common/negotiation.py)), the time-dependent
tactic from Faratin, Sierra & Jennings (1998): an agent's offer moves from
an opening `start` value toward a `limit` (reservation) value as rounds
progress, shaped by a `tactic` (`boulware` = hold firm then concede late,
`conceder` = concede early, `linear` = constant rate).

A deal exists at the first round where one side's offer is at least as
generous as the other side's current ask; if the deadline (`max_rounds`)
passes without that happening, the negotiation ends in an impasse. See
[`agents/buyer/AGENT.md`](./agents/buyer/AGENT.md) and
[`agents/seller/AGENT.md`](./agents/seller/AGENT.md) for the exact
accept/counter/reject rules each side applies.

## Agents

| Agent | AGENT.md | Role |
|---|---|---|
| Buyer | [`agents/buyer/AGENT.md`](./agents/buyer/AGENT.md) | Procurement; drives the negotiation |
| Seller | [`agents/seller/AGENT.md`](./agents/seller/AGENT.md) | Account executive; negotiates within/escalates its authority |
| Sales Manager | [`agents/sales_manager/AGENT.md`](./agents/sales_manager/AGENT.md) | Deal-desk approver; the seller's only peer |

## Extension points

- **Swap in an LLM-driven "brain".** Every policy (`BuyerPolicy`,
  `SellerPolicy`, `ManagerPolicy`) is a plain, transport-free Python class
  with a narrow interface (`respond(round, offer) -> decision, offer`).
  Replacing the deterministic concession curve with a call to an LLM (e.g.
  to generate the `rationale` text, or the offer itself, from a persona
  prompt) only touches `policy.py` -- `agent.py` and the wire protocol are
  unaffected.
- **Multi-issue bargaining.** Only `discount_pct` is actually negotiated
  round to round; `seats` and `term_years` are fixed inputs used as
  context. A natural extension is to let the buyer trade a longer term or
  higher seat count for a bigger discount within the same offer.
- **Official `a2a-sdk` transport.** See "Wire protocol" above.
- **Concurrent negotiations.** Each policy instance is currently a single
  in-flight negotiation per process (state is not keyed by `contextId`);
  a production version would key seller/manager state by `contextId` to
  run many deals concurrently against the same seller.
