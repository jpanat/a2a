from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Awaitable, Callable

from moltbook.a2a.schema import AgentCard, AgentSkill


@dataclass
class AgentContext:
    """Threaded through every request so an agent can post its own contribution
    back into the Moltbook entry / Webex space, and call other agents over A2A,
    without needing a direct reference to the Moltbook orchestrator itself.
    """

    space_id: str
    entry_id: str
    notify: Callable[["Agent", str], Awaitable[None]]
    call_agent: Callable[[str, str, "AgentContext"], Awaitable[object]]


class Agent(ABC):
    id: str
    name: str
    avatar: str
    description: str
    skills: list[AgentSkill]

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def agent_card(self) -> AgentCard:
        return AgentCard(
            name=self.name,
            description=self.description,
            url=f"{self.base_url}/agents/{self.id}",
            skills=self.skills,
        )

    def match_score(self, text: str) -> int:
        text_l = text.lower()
        return sum(1 for skill in self.skills for tag in skill.tags if tag in text_l)

    @abstractmethod
    async def handle(self, text: str, ctx: AgentContext) -> str:
        """Process an incoming request. May delegate to other agents via
        ctx.call_agent(agent_id, text, ctx), and should notify its own
        contribution via ctx.notify(self, text) as it produces output.
        Returns the agent's final reply text.
        """
