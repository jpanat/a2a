from __future__ import annotations

import os

from moltbook.agents.base import Agent
from moltbook.webex.base import WebexClient
from moltbook.webex.mock import MockWebexClient
from moltbook.webex.real import RealWebexClient


def build_webex_client(agents: list[Agent]) -> WebexClient:
    """Uses RealWebexClient only if a bot token is configured for every agent
    (env var WEBEX_BOT_TOKEN_<AGENT_ID>, e.g. WEBEX_BOT_TOKEN_RESEARCHER) plus
    an admin token (WEBEX_ADMIN_TOKEN) used to create the space. Falls back to
    an in-memory MockWebexClient otherwise, so the prototype runs with zero
    setup out of the box.
    """
    admin_token = os.environ.get("WEBEX_ADMIN_TOKEN")

    bot_tokens: dict[str, str] = {}
    for agent in agents:
        token = os.environ.get(f"WEBEX_BOT_TOKEN_{agent.id.upper()}")
        if token:
            bot_tokens[agent.name] = token

    if admin_token and len(bot_tokens) == len(agents):
        member_emails = [e for e in os.environ.get("WEBEX_MEMBER_EMAILS", "").split(",") if e]
        return RealWebexClient(bot_tokens=bot_tokens, admin_token=admin_token, member_emails=member_emails)

    return MockWebexClient()
