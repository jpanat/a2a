# Sales Manager Agent

## Role

Deal-desk approver. The only agent it ever talks to is the Seller agent --
it has no notion of the buyer and never sees the buyer's offers. Its whole
job is to answer one question when asked: *"can this rep have more discount
authority on this deal, and if so, how much?"*

## A2A identity

| | |
|---|---|
| Agent Card | [`agent_card.json`](./agent_card.json), served live at `GET /.well-known/agent-card.json` |
| Default URL | `http://127.0.0.1:9003` |
| Skill exposed | `authority_check` |
| Peers it calls | none -- it only ever responds |

## Skill: `authority_check`

**Request** (`message/send`, DataPart):
```json
{ "action": "authority_request", "requestedPct": 31.0, "dealContext": { "seats": 250, "term_years": 3, "current_round": 5, "rounds_remaining": 3, "buyer_ask_pct": 29.1 } }
```

**Reply** (DataPart):
```json
{ "action": "authority_response", "grantedPct": 26.0, "rationale": "Deal (250 seats, 3yr) qualifies for strategic authority; approving 26.0% instead of the requested 31.0% to protect margin (cap 26.0%)." }
```

## Approval policy (`policy.py::ManagerPolicy`)

| Parameter | Default | Meaning |
|---|---|---|
| `standard_cap` | 18% | Discount cap for a routine deal |
| `strategic_cap` | 26% | Discount cap for a strategic deal |
| `hard_cap` | 30% | Absolute ceiling, regardless of context |
| `strategic_seats_threshold` | 200 | Seats at/above which a deal can qualify as strategic |
| `strategic_term_threshold` | 2 (years) | Contract length at/above which a deal can qualify as strategic |

A deal is **strategic** if it meets *both* the seats and term thresholds.
The manager grants `min(requested, applicable_cap)` -- it will happily
approve a modest ask in full, but it caps an aggressive ask rather than
rubber-stamping it, and says why in `rationale`. This is a bounded
negotiation of its own (one exchange, in this implementation): the seller
states a number, the manager either grants it or counters down to its cap.

## Non-goals

- Never contacts the buyer agent, directly or indirectly.
- Does not track discount grants across multiple deals/negotiations in this
  reference implementation (no running margin budget) -- each request is
  evaluated independently on its own deal context.
