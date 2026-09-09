"""Lightweight reference implementation of the Agent2Agent (A2A) wire protocol.

Only the subset needed for this use case is implemented:

- Agent discovery via a well-known Agent Card document
  (``/.well-known/agent-card.json``).
- A single JSON-RPC 2.0 method, ``message/send``, exchanging a ``Message``
  (role + parts) and getting back a completed ``Task`` whose artifact
  carries the reply ``Message``.

The shapes mirror the public A2A spec (https://a2a-protocol.org) closely
enough to be a faithful teaching example. It intentionally does not pull in
the official `a2a-sdk` package, whose server/executor API is still moving
fast across versions -- swapping this module for that SDK's transport is a
drop-in extension point (see README.md).

Every agent in this use case is both an A2A *server* (it exposes an Agent
Card and accepts ``message/send`` calls) and an A2A *client* (``A2APeer``,
used to call another agent's endpoint directly). There is no broker: an
agent that wants to talk to a peer just calls that peer's URL.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any, Awaitable, Callable

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

AGENT_CARD_PATH = "/.well-known/agent-card.json"
RPC_PATH = "/a2a"


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


@dataclass
class AgentSkill:
    id: str
    name: str
    description: str
    tags: list[str] = field(default_factory=list)
    examples: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class AgentCard:
    """Machine-readable description of one agent, served at a well-known URL.

    Peers fetch this to discover what an agent is, where it lives, and what
    skills it exposes -- there is no central registry involved.
    """

    name: str
    description: str
    url: str
    version: str = "1.0.0"
    protocol_version: str = "0.3"
    default_input_modes: list[str] = field(default_factory=lambda: ["application/json"])
    default_output_modes: list[str] = field(default_factory=lambda: ["application/json"])
    capabilities: dict[str, Any] = field(default_factory=lambda: {"streaming": False})
    skills: list[AgentSkill] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "protocolVersion": self.protocol_version,
            "name": self.name,
            "description": self.description,
            "url": self.url,
            "version": self.version,
            "capabilities": self.capabilities,
            "defaultInputModes": self.default_input_modes,
            "defaultOutputModes": self.default_output_modes,
            "skills": [s.to_dict() for s in self.skills],
        }


def data_message(
    role: str,
    data: dict[str, Any],
    context_id: str | None = None,
    task_id: str | None = None,
) -> dict[str, Any]:
    """Build an A2A Message carrying a single DataPart."""
    return {
        "role": role,
        "messageId": new_id("msg"),
        "contextId": context_id or new_id("ctx"),
        "taskId": task_id,
        "parts": [{"kind": "data", "data": data}],
    }


def message_data(message: dict[str, Any]) -> dict[str, Any]:
    """Extract the payload out of the first DataPart of a Message."""
    for part in message.get("parts", []):
        if part.get("kind") == "data":
            return part["data"]
    return {}


MessageHandler = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]


def build_agent_app(card: AgentCard, handler: MessageHandler) -> FastAPI:
    """Build a minimal A2A-compliant server for one agent.

    ``handler`` receives the inbound Message's payload dict and the raw
    inbound Message, and returns the payload dict for the reply Message.
    The JSON-RPC envelope, Task wrapping, and the Agent Card route are all
    handled here so each agent's own code only deals in negotiation data.
    """

    app = FastAPI(title=card.name)

    @app.get(AGENT_CARD_PATH)
    async def agent_card() -> dict[str, Any]:
        return card.to_dict()

    @app.post(RPC_PATH)
    async def rpc(request: Request) -> JSONResponse:
        body = await request.json()
        rpc_id = body.get("id")
        method = body.get("method")
        if method != "message/send":
            return JSONResponse(
                {
                    "jsonrpc": "2.0",
                    "id": rpc_id,
                    "error": {"code": -32601, "message": f"unsupported method {method}"},
                },
                status_code=400,
            )
        inbound = body["params"]["message"]
        reply_payload = await handler(inbound)
        reply_message = data_message(
            role="agent",
            data=reply_payload,
            context_id=inbound.get("contextId"),
            task_id=inbound.get("taskId") or new_id("task"),
        )
        task = {
            "id": reply_message["taskId"],
            "contextId": reply_message["contextId"],
            "status": {"state": "completed", "timestamp": time.time()},
            "artifacts": [{"artifactId": new_id("artifact"), "parts": reply_message["parts"]}],
            "history": [inbound, reply_message],
        }
        return JSONResponse({"jsonrpc": "2.0", "id": rpc_id, "result": task})

    return app


class A2APeer:
    """Client used by one agent to call another agent's A2A endpoint directly.

    This is the whole point of the "no agent in the middle" design: any
    agent holding a peer's URL can open an ``A2APeer`` to it and negotiate,
    with no shared coordinator relaying the conversation.
    """

    def __init__(self, base_url: str, timeout: float = 15.0):
        self.base_url = base_url.rstrip("/")
        self._client = httpx.AsyncClient(timeout=timeout)

    async def discover(self) -> dict[str, Any]:
        resp = await self._client.get(f"{self.base_url}{AGENT_CARD_PATH}")
        resp.raise_for_status()
        return resp.json()

    async def send(
        self,
        data: dict[str, Any],
        context_id: str | None = None,
        task_id: str | None = None,
    ) -> dict[str, Any]:
        message = data_message(role="agent", data=data, context_id=context_id, task_id=task_id)
        payload = {
            "jsonrpc": "2.0",
            "id": new_id("rpc"),
            "method": "message/send",
            "params": {"message": message},
        }
        resp = await self._client.post(f"{self.base_url}{RPC_PATH}", json=payload)
        resp.raise_for_status()
        body = resp.json()
        if "error" in body:
            raise RuntimeError(body["error"])
        return message_data(
            {"parts": body["result"]["artifacts"][0]["parts"]}
        )

    async def aclose(self) -> None:
        await self._client.aclose()
