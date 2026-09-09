"""Sales Manager agent: an A2A server exposing one skill, ``authority_check``.

It is a peer the Seller agent calls directly when it needs discount
authority beyond what it can approve alone. The manager has no relationship
with the Buyer agent and never sees the buyer's messages -- it only ever
answers the Seller.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from common.a2a_protocol import AgentCard, AgentSkill, build_agent_app  # noqa: E402
from agents.sales_manager.policy import ManagerPolicy, ManagerProfile  # noqa: E402

HOST = os.environ.get("MANAGER_HOST", "127.0.0.1")
PORT = int(os.environ.get("MANAGER_PORT", "9003"))
PUBLIC_URL = os.environ.get("MANAGER_URL", f"http://{HOST}:{PORT}")

policy = ManagerPolicy(ManagerProfile())

CARD = AgentCard(
    name="Sales Manager Agent",
    description=(
        "Deal-desk approver for CloudSuite Pro renewals. Grants discount "
        "authority beyond a sales rep's own ceiling, based on deal size, "
        "contract term, and margin policy."
    ),
    url=PUBLIC_URL,
    skills=[
        AgentSkill(
            id="authority_check",
            name="Discount authority check",
            description=(
                "Given a requested discount percentage and deal context "
                "(seats, term, current round), returns a granted discount "
                "ceiling and the rationale behind it. May grant less than "
                "requested."
            ),
            tags=["sales", "approval", "discount"],
            examples=[
                '{"action": "authority_request", "requestedPct": 28, '
                '"dealContext": {"seats": 250, "term_years": 3}}'
            ],
        )
    ],
)


async def handle_message(message: dict) -> dict:
    data = _extract(message)
    action = data.get("action")
    if action != "authority_request":
        return {"action": "error", "reason": f"unsupported action {action}"}
    requested_pct = float(data["requestedPct"])
    deal_context = data.get("dealContext", {})
    granted_pct, rationale = policy.evaluate(requested_pct, deal_context)
    return {
        "action": "authority_response",
        "grantedPct": granted_pct,
        "rationale": rationale,
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
