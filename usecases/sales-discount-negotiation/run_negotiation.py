"""Launcher for the sales-discount-negotiation demo.

This script does NOT participate in the negotiation and relays no offers.
All it does is:

1. Start the three agents as independent A2A servers (each its own
   uvicorn process, in its own thread).
2. Make exactly one call into the Buyer agent's ``start_negotiation``
   skill, handing it the Seller agent's URL.
3. Print the transcript the Buyer agent hands back once it's done.

From that point on, the Buyer and Seller agents negotiate by calling each
other's A2A endpoints directly, and the Seller and Sales Manager agents do
the same for the authority side-channel -- this script is just "the user
pressing start."
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(__file__))

import httpx
import uvicorn

BUYER_URL = "http://127.0.0.1:9001"
SELLER_URL = "http://127.0.0.1:9002"
MANAGER_URL = "http://127.0.0.1:9003"


def _serve(app_path: str, host: str, port: int) -> None:
    module_name, attr = app_path.split(":")
    module = __import__(module_name, fromlist=[attr])
    app = getattr(module, attr)
    config = uvicorn.Config(app, host=host, port=port, log_level="warning")
    server = uvicorn.Server(config)
    asyncio.run(server.serve())


def _start_background(app_path: str, host: str, port: int) -> threading.Thread:
    thread = threading.Thread(target=_serve, args=(app_path, host, port), daemon=True)
    thread.start()
    return thread


def _wait_until_up(url: str, timeout: float = 10.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            httpx.get(f"{url}/.well-known/agent-card.json", timeout=1.0).raise_for_status()
            return
        except Exception:
            time.sleep(0.2)
    raise RuntimeError(f"agent at {url} did not come up in time")


def main() -> None:
    _start_background("agents.sales_manager.agent:app", "127.0.0.1", 9003)
    _start_background("agents.seller.agent:app", "127.0.0.1", 9002)
    _start_background("agents.buyer.agent:app", "127.0.0.1", 9001)

    for url in (MANAGER_URL, SELLER_URL, BUYER_URL):
        _wait_until_up(url)

    print("All three agents are up (buyer:9001, seller:9002, sales_manager:9003).")
    print(f"Kicking off negotiation: buyer -> seller ({SELLER_URL})\n")

    rpc_request = {
        "jsonrpc": "2.0",
        "id": "kickoff-1",
        "method": "message/send",
        "params": {
            "message": {
                "role": "user",
                "messageId": "kickoff-msg-1",
                "contextId": "demo-deal-1",
                "parts": [{"kind": "data", "data": {"action": "start_negotiation", "sellerUrl": SELLER_URL}}],
            }
        },
    }
    resp = httpx.post(f"{BUYER_URL}/a2a", json=rpc_request, timeout=60.0)
    resp.raise_for_status()
    task = resp.json()["result"]
    result = task["artifacts"][0]["parts"][0]["data"]

    print("--- Negotiation transcript (buyer <-> seller) ---")
    for offer in result["transcript"]:
        print(
            f"round {offer['round']:>2}  {offer['sender']:<6}  "
            f"{offer['discountPct']:>5.1f}% off  ${offer['unitPrice']:>7.2f}/seat  -- {offer['rationale']}"
        )

    if result.get("escalations"):
        print("\n--- Seller -> Sales Manager escalation(s) ---")
        for esc in result["escalations"]:
            print(
                f"round {esc['round']}: seller requested {esc['requestedPct']:.1f}%, "
                f"manager granted {esc['grantedPct']:.1f}% -- {esc['rationale']}"
            )

    print("\n--- Outcome ---")
    print(json.dumps({"outcome": result["outcome"], "finalOffer": result["finalOffer"]}, indent=2))


if __name__ == "__main__":
    main()
