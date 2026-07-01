from __future__ import annotations

import httpx

from moltbook.a2a.schema import JsonRpcRequest, Message, Task


class A2AClient:
    """Thin client for the A2A JSON-RPC surface exposed by moltbook.a2a.server."""

    def __init__(self, base_url: str, agent_id: str, http: httpx.AsyncClient):
        self.base_url = base_url.rstrip("/")
        self.agent_id = agent_id
        self.http = http

    async def get_agent_card(self) -> dict:
        resp = await self.http.get(f"{self.base_url}/agents/{self.agent_id}/.well-known/agent.json")
        resp.raise_for_status()
        return resp.json()

    async def send_message(self, message: Message) -> Task:
        req = JsonRpcRequest(method="message/send", params={"message": message.model_dump()})
        resp = await self.http.post(f"{self.base_url}/agents/{self.agent_id}/a2a", json=req.model_dump())
        resp.raise_for_status()
        body = resp.json()
        if body.get("error"):
            raise RuntimeError(body["error"])
        return Task.model_validate(body["result"])
