from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional

import httpx

from moltbook.a2a.client import A2AClient
from moltbook.a2a.schema import Message, TextPart, new_id
from moltbook.agents.base import Agent, AgentContext
from moltbook.webex.base import WebexClient


@dataclass
class MoltbookComment:
    author: str
    text: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class MoltbookEntry:
    id: str
    author: str
    text: str
    comments: list[MoltbookComment] = field(default_factory=list)


class Moltbook:
    """The collaborative notebook that sits on top of a Webex Space.

    Humans post entries; agents pick them up (routed by A2A skill match) and
    may delegate to one another over real A2A HTTP calls. Every contribution,
    human or agent, is mirrored into the Webex space as a message from its
    own identity, and appended to the entry's comment thread.
    """

    def __init__(self, webex: WebexClient, agents: list[Agent], a2a_base_url: str):
        self.webex = webex
        self.agents: dict[str, Agent] = {a.id: a for a in agents}
        self.a2a_base_url = a2a_base_url.rstrip("/")
        self.entries: dict[str, MoltbookEntry] = {}
        self.space_id: Optional[str] = None
        self._http = httpx.AsyncClient()

    def set_http_client(self, http: httpx.AsyncClient) -> None:
        """Swap in a different transport for agent-to-agent A2A calls (tests
        wire an ASGI-transported client here to exercise the real FastAPI app
        without opening network sockets)."""
        self._http = http

    async def setup_space(self, title: str, humans: list[str]) -> str:
        self.space_id = await self.webex.ensure_space(title)
        for human in humans:
            await self.webex.add_member(self.space_id, human, is_bot=False)
        for agent in self.agents.values():
            await self.webex.add_member(self.space_id, agent.name, is_bot=True)
        return self.space_id

    def make_ctx(self, metadata: dict) -> AgentContext:
        entry_id = metadata.get("entry_id")
        return AgentContext(
            space_id=metadata.get("space_id", self.space_id),
            entry_id=entry_id,
            notify=lambda agent, text, eid=entry_id: self._notify(agent, eid, text),
            call_agent=self._call_agent,
        )

    def _pick_agent(self, text: str) -> Agent:
        ranked = sorted(self.agents.values(), key=lambda a: a.match_score(text), reverse=True)
        return ranked[0]

    async def _notify(self, agent: Agent, entry_id: str, text: str) -> None:
        await self.webex.post_message(self.space_id, agent.name, text, is_bot=True)
        self.entries[entry_id].comments.append(MoltbookComment(author=agent.name, text=text))

    async def _call_agent(self, agent_id: str, text: str, parent_ctx: AgentContext):
        client = A2AClient(self.a2a_base_url, agent_id, self._http)
        message = Message(
            role="user",
            parts=[TextPart(text=text)],
            metadata={"space_id": parent_ctx.space_id, "entry_id": parent_ctx.entry_id},
        )
        return await client.send_message(message)

    async def submit_human_entry(self, author: str, text: str) -> MoltbookEntry:
        entry_id = new_id("entry")
        entry = MoltbookEntry(id=entry_id, author=author, text=text)
        self.entries[entry_id] = entry
        await self.webex.post_message(self.space_id, author, text, is_bot=False)

        agent = self._pick_agent(text)
        client = A2AClient(self.a2a_base_url, agent.id, self._http)
        message = Message(
            role="user",
            parts=[TextPart(text=text)],
            metadata={"space_id": self.space_id, "entry_id": entry_id},
        )
        await client.send_message(message)
        return entry

    async def aclose(self) -> None:
        await self._http.aclose()
