# Seller Agent

## Role

Account executive for **CloudSuite Pro**. Negotiates discounts directly with
whichever buyer agent calls it, within its own discount authority. When the
buyer won't move within that authority, it consults its Sales Manager peer
directly for a wider ceiling on this specific deal -- it never simply routes
the buyer's messages elsewhere, and the buyer never talks to the manager.

## A2A identity

| | |
|---|---|
| Agent Card | [`agent_card.json`](./agent_card.json), served live at `GET /.well-known/agent-card.json` |
| Default URL | `http://127.0.0.1:9002` |
| Skill exposed | `negotiate_round` |
| Peers it calls | Sales Manager Agent (directly, via its A2A endpoint, only when escalating) |

## Skill: `negotiate_round`

**Request** (`message/send`, DataPart) -- the buyer's offer for this round:
```json
{ "action": "negotiate_round", "offer": { "round": 0, "sender": "buyer", "discountPct": 30, "unitPrice": 350, "conditions": ["250 seats", "3-year term"], "rationale": "..." } }
```

**Reply** (DataPart):
```json
{
  "action": "negotiate_round_reply",
  "decision": "counter | accept",
  "offer": { "round": 0, "sender": "seller", "discountPct": 0.0, "unitPrice": 500.0, "conditions": [...], "rationale": "..." },
  "escalations": [ /* any authority requests made so far this negotiation */ ]
}
```
`decision` reflects the seller's own read of the state (informational --
the buyer agent independently decides accept/counter/reject against its own
reservation price; the seller does not dictate the outcome).

## Negotiation policy (`policy.py::SellerPolicy`)

Deal parameters (`SellerProfile`, defaults):

| Parameter | Default | Meaning |
|---|---|---|
| `list_price_per_seat` | $500 | Public list price |
| `own_authority_ceiling` | 15% | Max discount the rep can approve without sign-off |
| `max_rounds` | 8 | Deadline, matches the buyer's |
| `tactic` | `linear` | Concession shape toward its own ceiling |
| `escalate_after_round` | 5 | Consult the manager if still stuck past this round |
| `escalation_buffer` | 2% | Padding added on top of the buyer's current ask when requesting authority |

Each round, the seller's offer follows a concession curve from `0%` (list
price) up to its current ceiling. It never offers more discount than the
buyer is currently asking for -- it matches the buyer's ask exactly rather
than over-conceding.

### Escalation to the Sales Manager (peer-to-peer, not a broker)

If, past round `escalate_after_round`, the buyer's ask is still above the
seller's own ceiling, the seller opens an `A2APeer` connection straight to
the Sales Manager agent's URL and calls its `authority_check` skill once:

```json
{ "action": "authority_request", "requestedPct": 31.0, "dealContext": { "seats": 250, "term_years": 3, "current_round": 5, "rounds_remaining": 3, "buyer_ask_pct": 29.1 } }
```

The manager may grant less than requested (see its `AGENT.md`). Whatever is
granted becomes the seller's new ceiling for the rest of *this* negotiation,
and the seller keeps negotiating with the buyer from there -- the manager
never re-enters the conversation. Escalation happens at most once per
negotiation in this implementation.

## Non-goals

- Does not re-escalate if the manager's grant still isn't enough -- it will
  concede up to the granted ceiling and let the negotiation end in an
  impasse if the buyer still won't meet it.
- Single negotiation per process run, same caveat as the Buyer agent.
