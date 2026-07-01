"""A minimal, faithful subset of the Agent2Agent (A2A) protocol's data model:
AgentCard for capability discovery, and Message/Task for the message/send exchange.
"""
from __future__ import annotations

import time
import uuid
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


class TextPart(BaseModel):
    kind: Literal["text"] = "text"
    text: str


class Message(BaseModel):
    role: Literal["user", "agent"]
    parts: list[TextPart]
    message_id: str = Field(default_factory=lambda: new_id("msg"))
    context_id: Optional[str] = None
    task_id: Optional[str] = None
    metadata: dict = Field(default_factory=dict)

    @property
    def text(self) -> str:
        return "\n".join(p.text for p in self.parts)


class TaskState(str, Enum):
    SUBMITTED = "submitted"
    WORKING = "working"
    COMPLETED = "completed"
    FAILED = "failed"


class TaskStatus(BaseModel):
    state: TaskState
    message: Optional[Message] = None
    timestamp: float = Field(default_factory=time.time)


class Task(BaseModel):
    id: str = Field(default_factory=lambda: new_id("task"))
    context_id: str = Field(default_factory=lambda: new_id("ctx"))
    status: TaskStatus
    history: list[Message] = Field(default_factory=list)

    @property
    def final_text(self) -> str:
        return self.status.message.text if self.status.message else ""


class AgentSkill(BaseModel):
    id: str
    name: str
    description: str
    tags: list[str] = Field(default_factory=list)


class AgentCapabilities(BaseModel):
    streaming: bool = False
    push_notifications: bool = False


class AgentCard(BaseModel):
    name: str
    description: str
    url: str
    version: str = "0.1.0"
    capabilities: AgentCapabilities = Field(default_factory=AgentCapabilities)
    skills: list[AgentSkill] = Field(default_factory=list)


class JsonRpcRequest(BaseModel):
    jsonrpc: Literal["2.0"] = "2.0"
    id: str = Field(default_factory=lambda: new_id("rpc"))
    method: str
    params: dict


class JsonRpcResponse(BaseModel):
    jsonrpc: Literal["2.0"] = "2.0"
    id: str
    result: Optional[dict] = None
    error: Optional[dict] = None
