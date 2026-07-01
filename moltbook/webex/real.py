from __future__ import annotations

import httpx

from moltbook.webex.base import WebexClient, WebexMessage

WEBEX_API = "https://webexapis.com/v1"


class RealWebexClient(WebexClient):
    """Talks to the real Webex Messaging API.

    Each agent posts through its OWN bot token (so it shows up in the space's
    member list as its own participant, per-agent bot identity) while
    `admin_token` -- any one bot/user token with room-creation rights -- is
    used to create the space and invite members.

    Note: `post_message` for a human `author` is only exercised by the mock
    demo path, which simulates a human typing. In a real deployment humans
    type directly into the Webex space; inbound human messages arrive via a
    Webex webhook instead (see moltbook.webex.webhook), not through this
    method.
    """

    def __init__(self, bot_tokens: dict[str, str], admin_token: str, member_emails: list[str] | None = None):
        self.bot_tokens = bot_tokens
        self.admin_token = admin_token
        self.member_emails = member_emails or []
        self._space_ids: dict[str, str] = {}

    def _client(self, token: str) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=WEBEX_API, headers={"Authorization": f"Bearer {token}"}, timeout=15)

    async def ensure_space(self, title: str) -> str:
        if title in self._space_ids:
            return self._space_ids[title]

        async with self._client(self.admin_token) as http:
            resp = await http.post("/rooms", json={"title": title})
            resp.raise_for_status()
            room_id = resp.json()["id"]

            for email in self.member_emails:
                await http.post("/memberships", json={"roomId": room_id, "personEmail": email})

        self._space_ids[title] = room_id
        return room_id

    async def add_member(self, space_id: str, display_name: str, *, is_bot: bool = False) -> None:
        # Bots "join" simply by posting with their own token; humans are invited
        # by email in ensure_space(). Nothing further needed for the prototype.
        return None

    async def post_message(self, space_id: str, author: str, text: str, *, is_bot: bool = False) -> WebexMessage:
        token = self.bot_tokens.get(author, self.admin_token)
        async with self._client(token) as http:
            resp = await http.post("/messages", json={"roomId": space_id, "markdown": text})
            resp.raise_for_status()
        return WebexMessage(author=author, text=text, is_bot=is_bot)

    async def transcript(self, space_id: str) -> list[WebexMessage]:
        async with self._client(self.admin_token) as http:
            resp = await http.get("/messages", params={"roomId": space_id, "max": 50})
            resp.raise_for_status()
        items = resp.json().get("items", [])
        return [
            WebexMessage(author=item.get("personEmail", "unknown"), text=item.get("text", ""))
            for item in reversed(items)
        ]
