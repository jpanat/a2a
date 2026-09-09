"""Seller agent: an A2A server exposing one skill, ``negotiate_round``.

Negotiates the deal directly with whichever Buyer agent calls it. When it
needs discount authority beyond its own ceiling, it calls the Sales Manager
agent's A2A endpoint directly -- a second, independent peer-to-peer
conversation nested inside the first, with no shared coordinator.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from common.a2a_protocol import A2APeer, AgentCard, AgentSkill, build_agent_app  # noqa: E402
from common.negotiation import Offer  # noqa: E402
from agents.seller.policy import SellerPolicy, SellerProfile  # noqa: E402

HOST = os.environ.get("SELLER_HOST", "127.0.0.1")
PORT = int(os.environ.get("SELLER_PORT", "9002"))
PUBLIC_URL = os.environ.get("SELLER_URL", f"http://{HOST}:{PORT}")
MANAGER_URL = os.environ.get("MANAGER_URL", "http://127.0.0.1:9003")

manager_peer = A2APeer(MANAGER_URL)


async def request_authority(requested_pct: float, deal_context: dict) -> tuple[float, str]:
    reply = await manager_peer.send(
        {"action": "authority_request", "requestedPct": requested_pct, "dealContext": deal_context}
    )
    return float(reply["grantedPct"]), reply["rationale"]


policy = SellerPolicy(SellerProfile(), request_authority)

CARD = AgentCard(
    name="Seller Agent",
    description=(
        "Account executive for CloudSuite Pro. Negotiates discounts "
        "directly with buyer agents, escalating to the Sales Manager agent "
        "only when a deal needs more authority than the rep holds alone."
    ),
    url=PUBLIC_URL,
    skills=[
        AgentSkill(
            id="negotiate_round",
            name="Negotiate one round",
            description=(
                "Given the buyer's current offer for this round, returns "
                "the seller's counter-offer (or a matching offer if the "
                "buyer's ask is already acceptable)."
            ),
            tags=["sales", "negotiation", "discount"],
            examples=[
                '{"action": "negotiate_round", "offer": {"round": 0, "sender": "buyer", '
                '"discountPct": 30, "unitPrice": 350, "conditions": ["250 seats"]}}'
            ],
        )
    ],
)


async def handle_message(message: dict) -> dict:
    data = _extract(message)
    action = data.get("action")
    if action != "negotiate_round":
        return {"action": "error", "reason": f"unsupported action {action}"}
    buyer_offer = Offer.from_dict(data["offer"])
    decision, seller_offer = await policy.respond(buyer_offer.round, buyer_offer)
    return {
        "action": "negotiate_round_reply",
        "decision": decision,
        "offer": seller_offer.to_dict(),
        "escalations": policy.escalation_log,
    }


def _extract(message: dict) -> dict:
    for part in message.get("parts", []):
        if part.get("kind") == "data":
            return part["data"]
    return {}


app = build_agent_app(CARD, handle_message)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT)
