from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class WebexMessage:
    author: str
    text: str
    timestamp: float = field(default_factory=time.time)
    is_bot: bool = False


class WebexClient(ABC):
    """Everything Moltbook needs from Webex Messaging: create/find a space, add
    members, post a message, and read back the transcript. MockWebexClient and
    RealWebexClient both implement this so the orchestration code never has to
    know which one it's talking to.
    """

    @abstractmethod
    async def ensure_space(self, title: str) -> str: ...

    @abstractmethod
    async def add_member(self, space_id: str, display_name: str, *, is_bot: bool = False) -> None: ...

    @abstractmethod
    async def post_message(self, space_id: str, author: str, text: str, *, is_bot: bool = False) -> WebexMessage: ...

    @abstractmethod
    async def transcript(self, space_id: str) -> list[WebexMessage]: ...
