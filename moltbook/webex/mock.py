from __future__ import annotations

from moltbook.webex.base import WebexClient, WebexMessage


class MockWebexClient(WebexClient):
    """In-memory stand-in for the Webex Messaging API.

    Mirrors exactly the calls a real integration needs (spaces, memberships,
    messages), so swapping in RealWebexClient later is a one-line change in
    moltbook.webex.factory -- nothing in the orchestrator or agents changes.
    """

    def __init__(self):
        self._spaces: dict[str, dict] = {}

    async def ensure_space(self, title: str) -> str:
        for space_id, space in self._spaces.items():
            if space["title"] == title:
                return space_id
        space_id = f"space-{len(self._spaces) + 1}"
        self._spaces[space_id] = {"title": title, "members": [], "messages": []}
        return space_id

    async def add_member(self, space_id: str, display_name: str, *, is_bot: bool = False) -> None:
        self._spaces[space_id]["members"].append({"name": display_name, "is_bot": is_bot})

    async def post_message(self, space_id: str, author: str, text: str, *, is_bot: bool = False) -> WebexMessage:
        msg = WebexMessage(author=author, text=text, is_bot=is_bot)
        self._spaces[space_id]["messages"].append(msg)
        return msg

    async def transcript(self, space_id: str) -> list[WebexMessage]:
        return list(self._spaces[space_id]["messages"])
