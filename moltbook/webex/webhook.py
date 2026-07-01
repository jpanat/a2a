from __future__ import annotations

import hashlib
import hmac

import httpx
from fastapi import APIRouter, Header, HTTPException, Request

from moltbook.core import Moltbook
from moltbook.webex.real import WEBEX_API


def build_webhook_router(moltbook: Moltbook, admin_token: str, secret: str | None = None) -> APIRouter:
    """Production entry point for real human messages in Webex.

    Register a Webex webhook (resource="messages", event="created",
    targetUrl=<public URL of this route>) using the admin bot token, then
    mount this router on the same FastAPI app as the A2A gateway. Webex only
    sends a message *id* in the payload for security, so we fetch the body
    ourselves with the admin token, then feed the text into the very same
    Moltbook.submit_human_entry the mock CLI demo uses.

    Known limitation: this prototype does not yet track each bot's own
    personId to filter out its replies, so a webhook wired up against a space
    where the bots also post could re-trigger on their own messages. Populate
    that filter (via GET /v1/people/me per bot token) before pointing this at
    a live space.
    """
    router = APIRouter()

    @router.post("/webex/events")
    async def handle_event(request: Request, x_spark_signature: str | None = Header(default=None)) -> dict:
        raw = await request.body()
        if secret:
            expected = hmac.new(secret.encode(), raw, hashlib.sha1).hexdigest()
            if not x_spark_signature or not hmac.compare_digest(expected, x_spark_signature):
                raise HTTPException(401, "invalid webhook signature")

        payload = await request.json()
        data = payload.get("data", {})
        message_id = data.get("id")
        person_email = data.get("personEmail")
        if not message_id:
            return {"status": "ignored"}

        async with httpx.AsyncClient(base_url=WEBEX_API, headers={"Authorization": f"Bearer {admin_token}"}) as http:
            resp = await http.get(f"/messages/{message_id}")
            resp.raise_for_status()
            text = resp.json().get("text", "")

        await moltbook.submit_human_entry(person_email or "human", text)
        return {"status": "ok"}

    return router
