from __future__ import annotations

from moltbook.agents.base import Agent
from moltbook.agents.personas import CoderAgent, ResearcherAgent, ReviewerAgent


def build_agents(base_url: str) -> list[Agent]:
    """The roster of agents that live in every Moltbook space."""
    return [ResearcherAgent(base_url), CoderAgent(base_url), ReviewerAgent(base_url)]
