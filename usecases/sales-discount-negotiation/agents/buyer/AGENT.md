# Buyer Agent

## Role

Procurement agent acting on behalf of the customer negotiating a **CloudSuite
Pro** license renewal. It is the only agent in this MAS that an outside
caller talks to; once started, it negotiates on its own.

## A2A identity

| | |
|---|---|
| Agent Card | [`agent_card.json`](./agent_card.json), served live at `GET /.well-known/agent-card.json` |
| Default URL | `http://127.0.0.1:9001` |
| Skill exposed | `start_negotiation` |
| Peers it calls | Seller Agent (directly, via its A2A endpoint) |

## Skill: `start_negotiation`

**Request** (`message/send`, DataPart):
```json
{ "action": "start_negotiation", "sellerUrl": "http://127.0.0.1:9002" }
```

**Reply** (DataPart), once the negotiation concludes:
```json
{
  "action": "negotiation_result",
  "outcome": "deal | impasse",
  "finalOffer": { "round": 8, "sender": "seller", "discountPct": 20.0, "unitPrice": 400.0, "conditions": [...], "rationale": "..." },
  "escalations": [ { "round": 5, "requestedPct": 31.0, "grantedPct": 26.0, "rationale": "..." } ],
  "transcript": [ /* every offer exchanged, in order */ ]
}
```
This call blocks until the negotiation finishes -- the buyer runs every
round of the buyer↔seller conversation itself, on the same request, using
`common.a2a_protocol.A2APeer` to call the seller's `negotiate_round` skill
directly. Nothing outside these two agents sees or relays the offers in
between.

## Negotiation policy (`policy.py::BuyerPolicy`)

Deal parameters (`BuyerProfile`, defaults):

| Parameter | Default | Meaning |
|---|---|---|
| `seats` | 250 | Seats being renewed |
| `term_years` | 3 | Contract length being offered |
| `list_price_per_seat` | $500 | Public list price |
| `aspiration_discount` | 30% | Opening ask |
| `reservation_discount` | 20% | Walk-away floor -- will not accept less |
| `max_rounds` | 8 | Deadline, in negotiation rounds |
| `tactic` | `boulware` | Concession shape (see below) |

Each round, the buyer's ask follows a time-dependent concession curve
(Faratin et al., 1998): it stays close to its opening ask for most of the
negotiation, then concedes sharply in the final rounds toward its
reservation floor (`boulware` tactic -- a realistic stance for a procurement
team with a competing quote in hand). See
[`common/negotiation.py`](../../common/negotiation.py) for the shared
concession-curve math used by every agent.

**Decision rule** each round, given the seller's latest offer:
- **accept** if the seller's offered discount is at least the buyer's
  current ask.
- **reject** (walk away) if the deadline (`max_rounds`) is reached and the
  seller's best offer is still below the buyer's `reservation_discount`.
- otherwise **counter** with the next point on its concession curve.

## Non-goals

- Does not negotiate anything besides `discount_pct` / `unit_price` (seats
  and term are stated up front, not traded round to round).
- Single negotiation per process run -- state is not keyed by `contextId`,
  so a given buyer process drives one deal at a time.
