from __future__ import annotations

from typing import Callable

from fastapi import FastAPI, HTTPException, Request

from moltbook.a2a.schema import Message, Task, TaskState, TaskStatus, TextPart
from moltbook.agents.base import Agent, AgentContext


def build_app(agents: dict[str, Agent], make_context: Callable[[dict], AgentContext]) -> FastAPI:
    """Mounts one A2A endpoint pair per agent on a single FastAPI app:

      GET  /agents/{agent_id}/.well-known/agent.json   -- capability discovery
      POST /agents/{agent_id}/a2a                       -- JSON-RPC 'message/send'

    Agents call each other's endpoints over real HTTP (via A2AClient), so the
    collaboration between agents is genuine A2A wire traffic, not in-process
    function calls -- even though everything happens to run on one host here.
    """
    app = FastAPI(title="Moltbook A2A Gateway")

    for agent_id, agent in agents.items():
        _mount_agent_routes(app, agent_id, agent, make_context)

    return app


def _mount_agent_routes(
    app: FastAPI, agent_id: str, agent: Agent, make_context: Callable[[dict], AgentContext]
) -> None:
    @app.get(f"/agents/{agent_id}/.well-known/agent.json")
    async def get_card() -> dict:
        return agent.agent_card().model_dump()

    @app.post(f"/agents/{agent_id}/a2a")
    async def rpc(request: Request) -> dict:
        body = await request.json()
        if body.get("method") != "message/send":
            raise HTTPException(400, f"unsupported method: {body.get('method')!r}")

        message = Message.model_validate(body["params"]["message"])
        ctx = make_context(message.metadata)

        reply_text = await agent.handle(message.text, ctx)

        reply_message = Message(
            role="agent",
            parts=[TextPart(text=reply_text)],
            context_id=message.context_id,
            task_id=message.task_id,
        )
        task = Task(
            status=TaskStatus(state=TaskState.COMPLETED, message=reply_message),
            history=[message, reply_message],
        )
        return {"jsonrpc": "2.0", "id": body["id"], "result": task.model_dump()}
