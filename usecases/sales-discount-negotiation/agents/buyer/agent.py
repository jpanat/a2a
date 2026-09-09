"""Buyer agent: an A2A server exposing one skill, ``start_negotiation``.

This is the only skill anyone outside the MAS calls. Once invoked, the
Buyer agent drives the entire negotiation itself by calling the Seller
agent's A2A endpoint directly, round after round, until a deal is reached
or the buyer walks away. Nothing outside the buyer and seller agents (and,
transitively, the seller's own conversation with the sales manager) is
involved in the back-and-forth -- there is no orchestrator relaying offers.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from common.a2a_protocol import A2APeer, AgentCard, AgentSkill, build_agent_app  # noqa: E402
from common.negotiation import Offer  # noqa: E402
from agents.buyer.policy import BuyerPolicy, BuyerProfile  # noqa: E402

HOST = os.environ.get("BUYER_HOST", "127.0.0.1")
PORT = int(os.environ.get("BUYER_PORT", "9001"))
PUBLIC_URL = os.environ.get("BUYER_URL", f"http://{HOST}:{PORT}")

CARD = AgentCard(
    name="Buyer Agent",
    description=(
        "Procurement agent negotiating a CloudSuite Pro renewal on behalf "
        "of the customer. Given a seller agent's URL, negotiates directly "
        "with it until a deal is reached or the buyer's reservation price "
        "is breached."
    ),
    url=PUBLIC_URL,
    skills=[
        AgentSkill(
            id="start_negotiation",
            name="Start a discount negotiation",
            description=(
                "Kicks off a full negotiation against the given seller "
                "agent URL and returns once it concludes (deal or "
                "impasse), including the full offer transcript."
            ),
            tags=["sales", "negotiation", "discount", "procurement"],
            examples=['{"action": "start_negotiation", "sellerUrl": "http://127.0.0.1:9002"}'],
        )
    ],
)


async def handle_message(message: dict) -> dict:
    data = _extract(message)
    action = data.get("action")
    if action != "start_negotiation":
        return {"action": "error", "reason": f"unsupported action {action}"}
    seller_url = data["sellerUrl"]
    return await run_negotiation(seller_url)


async def run_negotiation(seller_url: str) -> dict:
    policy = BuyerPolicy(BuyerProfile())
    seller_peer = A2APeer(seller_url)
    transcript: list[dict] = []
    try:
        round_no = 0
        buyer_offer = policy.opening_offer()
        transcript.append(buyer_offer.to_dict())
        while True:
            reply = await seller_peer.send({"action": "negotiate_round", "offer": buyer_offer.to_dict()})
            seller_offer = Offer.from_dict(reply["offer"])
            transcript.append(seller_offer.to_dict())
            decision, next_offer = policy.respond(round_no, seller_offer)
            if decision == "accept":
                return {
                    "action": "negotiation_result",
                    "outcome": "deal",
                    "finalOffer": seller_offer.to_dict(),
                    "escalations": reply.get("escalations", []),
                    "transcript": transcript,
                }
            if decision == "reject":
                return {
                    "action": "negotiation_result",
                    "outcome": "impasse",
                    "finalOffer": seller_offer.to_dict(),
                    "escalations": reply.get("escalations", []),
                    "transcript": transcript,
                }
            round_no = next_offer.round
            buyer_offer = next_offer
            transcript.append(buyer_offer.to_dict())
    finally:
        await seller_peer.aclose()


def _extract(message: dict) -> dict:
    for part in message.get("parts", []):
        if part.get("kind") == "data":
            return part["data"]
    return {}


app = build_agent_app(CARD, handle_message)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT)
